// Supabase veri katmanı: demo-store.js ile aynı arayüz. Yetki kontrolleri veritabanındaki RLS kurallarıyla yapılır.

import { supabase } from '../lib/supabase.js';
import { todayIso } from '../lib/format.js';
import {
  classFromRow, examFromRow, examToRow, profileFromRow, questionFromRow, questionToRow, teacherRequestFromRow, usageFromRow,
} from './mappers.js';

let currentUserId = null;
export function setCurrentUser(id) {
  currentUserId = id;
}
function requireUser() {
  if (!currentUserId) throw new Error('Oturum açılmamış.');
  return currentUserId;
}

/** Supabase hatasını kullanıcıya gösterilecek Türkçe iletiye çevirir. */
function check({ data, error }) {
  if (error) {
    const msg = error.message || '';
    if (/row-level security|permission denied/i.test(msg)) throw new Error('Bu işlem için yetkiniz yok.');
    if (/JWT|token/i.test(msg)) throw new Error('Oturum süresi doldu. Lütfen yeniden giriş yapın.');
    if (/Failed to fetch|NetworkError/i.test(msg)) throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    throw new Error(msg || 'Beklenmeyen bir hata oluştu.');
  }
  return data;
}

/** PostgREST tek seferde en fazla 1000 satır döner; tümünü sayfa sayfa çeker. */
async function fetchAll(buildQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const rows = check(await buildQuery().range(from, from + pageSize - 1));
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export function resetDemoData() {
  /* yalnızca Demo Modu'nda anlamlı */
}

// ---------------- Kullanıcılar ----------------
export const profiles = {
  async get(id) {
    return profileFromRow(check(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()));
  },
  async update(id, { fullName, schoolName, grade }) {
    const row = {};
    if (fullName !== undefined) row.full_name = fullName;
    if (schoolName !== undefined) row.school_name = schoolName;
    if (grade !== undefined) row.grade = grade;
    return profileFromRow(check(await supabase.from('profiles').update(row).eq('id', id).select().single()));
  },
};

export const admin = {
  async teacherRequests({ status } = {}) {
    let q = supabase.from('teacher_requests').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return check(await q).map(teacherRequestFromRow);
  },
  async reviewTeacherRequest(id, approve, reason = '') {
    return teacherRequestFromRow(check(await supabase.rpc('review_teacher_request', { p_request_id: id, p_approve: approve, p_reason: reason })));
  },
  async myTeacherRequest() {
    const rows = check(await supabase.from('teacher_requests').select('*').eq('user_id', requireUser()).order('created_at', { ascending: false }).limit(1));
    return rows[0] ? teacherRequestFromRow(rows[0]) : null;
  },
};

// ---------------- Müfredat ----------------
const subjectFromRow = (r) => ({ id: r.id, gradeId: r.grade_id, name: r.name, programYear: r.program_year });
const themeFromRow = (r) => ({ id: r.id, subjectId: r.subject_id, order: r.sort_order, name: r.name, meta: r.meta ?? {} });
const outcomeFromRow = (r) => ({ code: r.code, themeId: r.theme_id, text: r.text, processComponents: r.process_components ?? [] });

let lookupCache = null;

export const curriculum = {
  async grades() {
    return check(await supabase.from('grades').select('*').order('id'));
  },
  async subjects({ gradeId } = {}) {
    let q = supabase.from('subjects').select('*').order('grade_id').order('name');
    if (gradeId) q = q.eq('grade_id', Number(gradeId));
    return check(await q).map(subjectFromRow);
  },
  async themes(subjectId) {
    return check(await supabase.from('themes').select('id, subject_id, sort_order, name').eq('subject_id', subjectId).order('sort_order')).map(themeFromRow);
  },
  async outcomes({ themeId, subjectId } = {}) {
    if (themeId) return check(await supabase.from('outcomes').select('*').eq('theme_id', themeId).order('sort_order')).map(outcomeFromRow);
    const themes = subjectId ? await curriculum.themes(subjectId) : [];
    if (!themes.length) return [];
    return check(await supabase.from('outcomes').select('*').in('theme_id', themes.map((t) => t.id)).order('sort_order')).map(outcomeFromRow);
  },
  /** Ders ve tema adları (etiket gösterimi için). Öğrenme çıktıları büyük olduğu için burada yüklenmez. */
  async lookup() {
    if (!lookupCache) {
      const [subjects, themes] = await Promise.all([
        fetchAll(() => supabase.from('subjects').select('*').order('id')),
        fetchAll(() => supabase.from('themes').select('id, subject_id, sort_order, name').order('id')),
      ]);
      lookupCache = {
        subjects: Object.fromEntries(subjects.map((s) => [s.id, subjectFromRow(s)])),
        themes: Object.fromEntries(themes.map((t) => [t.id, themeFromRow(t)])),
        outcomes: {},
      };
    }
    return lookupCache;
  },
  async summary() {
    return check(await supabase.rpc('curriculum_summary')).map((r) => ({
      subjectId: r.subject_id, gradeId: r.grade_id, name: r.name, themeCount: Number(r.theme_count), outcomeCount: Number(r.outcome_count),
    }));
  },
  /** Dışa aktarma için müfredatın tamamı */
  async snapshot() {
    const [subjects, themes, outcomes] = await Promise.all([
      fetchAll(() => supabase.from('subjects').select('*').order('id')),
      fetchAll(() => supabase.from('themes').select('id, subject_id, sort_order, name').order('id')),
      fetchAll(() => supabase.from('outcomes').select('*').order('id')),
    ]);
    return { subjects: subjects.map(subjectFromRow), themes: themes.map(themeFromRow), outcomes: outcomes.map(outcomeFromRow) };
  },
  /** Ekle/güncelle; büyük dosyalar parçalara bölünerek gönderilir. onProgress(0..1) */
  async importBatch({ subjects = [], themes = [], outcomes = [] }, onProgress) {
    const CHUNK = 800;
    const total = { subjects: { added: 0, updated: 0 }, themes: { added: 0, updated: 0 }, outcomes: { added: 0, updated: 0 } };
    const add = (r) => ['subjects', 'themes', 'outcomes'].forEach((k) => {
      total[k].added += r[k].added;
      total[k].updated += r[k].updated;
    });
    add(check(await supabase.rpc('import_curriculum', { p_payload: { subjects, themes, outcomes: [] } })));
    for (let i = 0; i < outcomes.length; i += CHUNK) {
      add(check(await supabase.rpc('import_curriculum', { p_payload: { outcomes: outcomes.slice(i, i + CHUNK) } })));
      onProgress?.(Math.min(1, (i + CHUNK) / outcomes.length));
    }
    lookupCache = null;
    return total;
  },
};

// ---------------- Sınıflar ----------------
export const classes = {
  async listMine() {
    const rows = check(await supabase.from('classes').select('*, class_members(student_id)').eq('teacher_id', requireUser()).order('created_at'));
    return rows.map(classFromRow);
  },
  async create({ name, subjectId, grade }) {
    const row = check(await supabase.from('classes').insert({ teacher_id: requireUser(), name, subject_id: subjectId, grade }).select('*, class_members(student_id)').single());
    return classFromRow(row);
  },
  async remove(id) {
    check(await supabase.from('classes').delete().eq('id', id));
  },
  async students(classId) {
    const members = check(await supabase.from('class_members').select('student_id, joined_at').eq('class_id', classId));
    if (!members.length) return [];
    const profs = check(await supabase.from('profiles').select('id, full_name, grade').in('id', members.map((m) => m.student_id)));
    return profs.map((p) => ({ id: p.id, fullName: p.full_name, grade: p.grade })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  },
  async removeStudent(classId, studentId) {
    check(await supabase.from('class_members').delete().eq('class_id', classId).eq('student_id', studentId));
  },
  async join(code) {
    return classFromRow(check(await supabase.rpc('join_class', { p_code: code })));
  },
  async listJoined() {
    const rows = check(await supabase.from('class_members').select('class_id, classes(*)').eq('student_id', requireUser()));
    return rows.filter((r) => r.classes).map((r) => classFromRow(r.classes));
  },
};

// ---------------- Soru havuzu ----------------
export const questions = {
  async list(filters = {}) {
    const me = requireUser();
    let q = supabase.from('questions').select('*').order('updated_at', { ascending: false }).limit(500);
    q = q.or(`owner_id.eq.${me},visibility.eq.public`);
    if (filters.subjectId) q = q.eq('subject_id', filters.subjectId);
    if (filters.grade) q = q.eq('grade', Number(filters.grade));
    if (filters.themeId) q = q.eq('theme_id', filters.themeId);
    if (filters.outcomeCode) q = q.contains('outcome_codes', [filters.outcomeCode]);
    if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.bloom) q = q.eq('bloom', filters.bloom);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.statusIn) q = q.in('status', filters.statusIn);
    if (filters.search?.trim()) q = q.textSearch('search', filters.search.trim(), { type: 'websearch', config: 'turkish' });
    return check(await q).map(questionFromRow);
  },
  async get(id) {
    return questionFromRow(check(await supabase.from('questions').select('*').eq('id', id).maybeSingle()));
  },
  async getMany(ids) {
    if (!ids.length) return [];
    return check(await supabase.from('questions').select('*').in('id', ids)).map(questionFromRow);
  },
  async save(input) {
    const row = questionToRow(input);
    if (input.id) {
      return questionFromRow(check(await supabase.from('questions').update(row).eq('id', input.id).select().single()));
    }
    return questionFromRow(check(await supabase.from('questions').insert({ ...row, owner_id: requireUser() }).select().single()));
  },
  async setStatus(id, status) {
    return questionFromRow(check(await supabase.from('questions').update({ status }).eq('id', id).select().single()));
  },
  async remove(id) {
    check(await supabase.from('questions').delete().eq('id', id));
  },
  async stats() {
    const me = requireUser();
    const count = async (status) => {
      let q = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('owner_id', me);
      if (status) q = q.eq('status', status);
      const { count: c, error } = await q;
      if (error) check({ error });
      return c ?? 0;
    };
    const [total, active, draft, quarantined] = await Promise.all([count(), count('active'), count('draft'), count('quarantined')]);
    return { total, active, draft, quarantined };
  },
};

// ---------------- Sınavlar ----------------
export const exams = {
  async listMine() {
    return check(await supabase.from('exams').select('*').eq('owner_id', requireUser()).order('updated_at', { ascending: false })).map(examFromRow);
  },
  async get(id) {
    return examFromRow(check(await supabase.from('exams').select('*').eq('id', id).maybeSingle()));
  },
  async create(input) {
    const row = {
      kind: 'written', title: 'Yeni Yazılı', class_ids: [], exam_date: todayIso(),
      header: { schoolName: '', academicYear: '', term: '', durationMin: 40, instructions: '' },
      sections: [{ id: `s_${Date.now().toString(36)}`, title: 'Sorular', items: [] }],
      ...examToRow(input),
      owner_id: requireUser(),
    };
    return examFromRow(check(await supabase.from('exams').insert(row).select().single()));
  },
  async save(input) {
    const data = check(await supabase.from('exams').update(examToRow(input)).eq('id', input.id).select());
    if (!data.length) throw new Error('Kesinleşmiş sınav düzenlenemez.');
    return examFromRow(data[0]);
  },
  async remove(id) {
    const data = check(await supabase.from('exams').delete().eq('id', id).select('id'));
    if (!data.length) throw new Error('Kesinleşmiş sınav silinemez; önce kesinleştirmeyi geri alın.');
  },
  /** ⭐ Kesinleştirme ve kullanılmış soru kayıtları tek transaction içinde (finalize_exam RPC). */
  async finalize(id) {
    return examFromRow(check(await supabase.rpc('finalize_exam', { p_exam_id: id })));
  },
  async unfinalize(id) {
    return examFromRow(check(await supabase.rpc('unfinalize_exam', { p_exam_id: id })));
  },
  async duplicate(id) {
    const src = await exams.get(id);
    if (!src) throw new Error('Sınav bulunamadı.');
    const sections = src.sections.map((s) => ({ ...s, items: s.items.map(({ snapshot, ...i }) => i) }));
    return exams.create({ ...src, sections, title: `${src.title} (kopya)`, examDate: todayIso() });
  },
};

// ---------------- Kullanılmış soru kayıtları ----------------
export const usages = {
  async mySummary() {
    const rows = await fetchAll(() => supabase.from('question_usages').select('*').eq('teacher_id', requireUser()).order('exam_date', { ascending: false }));
    const map = new Map();
    for (const u of rows.map(usageFromRow)) {
      if (!map.has(u.questionId)) map.set(u.questionId, []);
      map.get(u.questionId).push(u);
    }
    return map;
  },
};

// ---------------- Yapay zeka ----------------
export const ai = {
  available: true,
  /** /api/generate-questions sunucu fonksiyonunu çağırır. */
  async generate(request) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Oturum süresi doldu. Lütfen yeniden giriş yapın.');
    let res;
    try {
      res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Soru üretilemedi (HTTP ${res.status}).`);
    return body;
  },
};
