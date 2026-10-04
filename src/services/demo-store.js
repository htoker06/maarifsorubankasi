// Demo Modu veri deposu: Supabase bağlanana kadar tüm veriler tarayıcının localStorage'ında tutulur.
// Fonksiyonlar Supabase sürümüyle aynı imzaya sahiptir (async), böylece Adım 3'te yalnızca bu katman değişir.

import { createSeed } from '../data/demo-seed.js';
import { readJson, writeJson, removeKey } from '../lib/storage.js';
import { normalizeTr, todayIso, uid } from '../lib/format.js';
import { outcomeKey } from '../data/constants.js';

const KEY = 'sbm-demo-db-v3'; // sürüm değişince eski demo verisi sıfırlanır

let state = readJson(KEY);
if (!state || state.version !== 1) {
  state = createSeed();
  writeJson(KEY, state);
}

const persist = () => writeJson(KEY, state);
const clone = (v) => structuredClone(v);
const now = () => new Date().toISOString();

let currentUserId = null;
export function setCurrentUser(id) {
  currentUserId = id;
}
function requireUser() {
  if (!currentUserId) throw new Error('Oturum açılmamış.');
  return currentUserId;
}

export function resetDemoData() {
  removeKey(KEY);
  state = createSeed();
  persist();
}

// ---------------- Kullanıcılar ----------------
export const profiles = {
  async get(id) {
    return clone(state.profiles.find((p) => p.id === id) ?? null);
  },
  async update(id, changes) {
    const p = state.profiles.find((x) => x.id === id);
    Object.assign(p, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
    persist();
    return clone(p);
  },
};

// ---------------- Yönetici: öğretmen başvuruları ----------------
function requireAdmin() {
  const me = requireUser();
  if (state.profiles.find((p) => p.id === me)?.role !== 'admin') throw new Error('Bu işlem için yönetici yetkisi gerekir.');
  return me;
}

export const admin = {
  async teacherRequests({ status } = {}) {
    requireAdmin();
    return clone(state.teacherRequests.filter((r) => !status || r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  /** Onaylanırsa kullanıcının rolü 'teacher' olur. Supabase'de review_teacher_request() RPC'si. */
  async myTeacherRequest() {
    return clone(state.teacherRequests.find((r) => r.userId === requireUser()) ?? null);
  },
  async reviewTeacherRequest(id, approve, reason = '') {
    const me = requireAdmin();
    const req = state.teacherRequests.find((r) => r.id === id);
    if (!req || req.status !== 'pending') throw new Error('Başvuru bulunamadı ya da zaten sonuçlandı.');
    req.status = approve ? 'approved' : 'rejected';
    req.reviewedBy = me;
    req.reviewedAt = now();
    req.reason = reason;
    const profile = state.profiles.find((p) => p.id === req.userId);
    if (profile) profile.role = approve ? 'teacher' : 'pending_teacher';
    persist();
    return clone(req);
  },
};

// ---------------- Müfredat ----------------
export const curriculum = {
  async grades() {
    return clone(state.grades);
  },
  async subjects({ gradeId } = {}) {
    return clone(state.subjects.filter((s) => !gradeId || s.gradeId === Number(gradeId)));
  },
  async themes(subjectId) {
    return clone(state.themes.filter((t) => t.subjectId === subjectId).sort((a, b) => a.order - b.order));
  },
  async outcomes({ themeId, subjectId } = {}) {
    const themeIds = themeId
      ? [themeId]
      : state.themes.filter((t) => !subjectId || t.subjectId === subjectId).map((t) => t.id);
    return clone(state.outcomes.filter((o) => themeIds.includes(o.themeId)));
  },
  async summary() {
    return state.subjects
      .map((s) => {
        const themeIds = new Set(state.themes.filter((t) => t.subjectId === s.id).map((t) => t.id));
        return { subjectId: s.id, gradeId: s.gradeId, name: s.name, themeCount: themeIds.size, outcomeCount: state.outcomes.filter((o) => themeIds.has(o.themeId)).length };
      })
      .sort((a, b) => a.gradeId - b.gradeId || a.name.localeCompare(b.name, 'tr'));
  },
  /** Müfredatın tamamı (dışa aktarma için). */
  async snapshot() {
    return clone({ subjects: state.subjects, themes: state.themes, outcomes: state.outcomes });
  },
  /**
   * CSV'den gelen kayıtları ekler ya da günceller (upsert). Hiçbir kayıt silinmez;
   * böylece sorulara bağlı tema ve kazanımlar korunur.
   * Supabase'de bu işlem tek transaction içinde import_curriculum() RPC fonksiyonuyla yapılacak.
   */
  async importBatch({ subjects = [], themes = [], outcomes = [] }, onProgress) {
    requireAdmin();
    const backup = clone({ subjects: state.subjects, themes: state.themes, outcomes: state.outcomes });
    const upsert = (list, items, keyOf) => {
      const counts = { added: 0, updated: 0, unchanged: 0 };
      for (const item of items) {
        const existing = list.find((x) => keyOf(x) === keyOf(item));
        if (!existing) {
          list.push(clone(item));
          counts.added += 1;
        } else if (JSON.stringify({ ...existing, ...item }) !== JSON.stringify(existing)) {
          Object.assign(existing, clone(item));
          counts.updated += 1;
        } else counts.unchanged += 1;
      }
      return counts;
    };
    const summary = {
      subjects: upsert(state.subjects, subjects, (s) => s.id),
      themes: upsert(state.themes, themes, (t) => t.id),
      outcomes: upsert(state.outcomes, outcomes, (o) => outcomeKey(o.themeId, o.code)),
    };
    if (!persist()) {
      Object.assign(state, backup);
      throw new Error('Demo Modu tarayıcı depolama sınırı aşıldı. Daha az ders seçerek tekrar deneyin (Supabase bağlandığında bu sınır olmayacak).');
    }
    onProgress?.(1);
    return summary;
  },
  /** Tüm müfredatı tek seferde (küçük veri) — etiket gösterimi için sözlükler. */
  async lookup() {
    return {
      subjects: Object.fromEntries(state.subjects.map((s) => [s.id, s])),
      themes: Object.fromEntries(state.themes.map((t) => [t.id, t])),
      outcomes: Object.fromEntries(state.outcomes.map((o) => [outcomeKey(o.themeId, o.code), o])),
    };
  },
};

// ---------------- Sınıflar ----------------
const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const classes = {
  async listMine() {
    const me = requireUser();
    return clone(state.classes.filter((c) => c.teacherId === me));
  },
  async create({ name, subjectId, grade }) {
    let joinCode;
    do joinCode = Array.from({ length: 6 }, () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]).join('');
    while (state.classes.some((c) => c.joinCode === joinCode));
    const c = { id: uid('c'), teacherId: requireUser(), name, subjectId, grade, joinCode, studentIds: [], createdAt: now() };
    state.classes.push(c);
    persist();
    return clone(c);
  },
  async remove(id) {
    state.classes = state.classes.filter((c) => c.id !== id);
    persist();
  },
  async students(classId) {
    const c = state.classes.find((x) => x.id === classId);
    return clone(state.profiles.filter((p) => c?.studentIds.includes(p.id)).map((p) => ({ id: p.id, fullName: p.fullName, grade: p.grade })));
  },
  async removeStudent(classId, studentId) {
    const c = state.classes.find((x) => x.id === classId);
    c.studentIds = c.studentIds.filter((id) => id !== studentId);
    persist();
  },
  async join(code) {
    const me = requireUser();
    const c = state.classes.find((x) => x.joinCode === String(code).trim().toUpperCase());
    if (!c) throw new Error('Bu sınıf kodu bulunamadı.');
    if (!c.studentIds.includes(me)) c.studentIds.push(me);
    persist();
    return clone(c);
  },
  async listJoined() {
    const me = requireUser();
    return clone(state.classes.filter((c) => c.studentIds.includes(me)));
  },
};

// ---------------- Soru havuzu ----------------
function matchesFilters(q, f) {
  if (f.subjectId && q.subjectId !== f.subjectId) return false;
  if (f.grade && q.grade !== Number(f.grade)) return false;
  if (f.themeId && q.themeId !== f.themeId) return false;
  if (f.outcomeCode && !q.outcomeCodes.includes(f.outcomeCode)) return false;
  if (f.difficulty && q.difficulty !== f.difficulty) return false;
  if (f.type && q.type !== f.type) return false;
  if (f.bloom && q.bloom !== f.bloom) return false;
  if (f.status && q.status !== f.status) return false;
  if (f.statusIn && !f.statusIn.includes(q.status)) return false;
  if (f.search) {
    const needle = normalizeTr(f.search);
    if (!normalizeTr(`${q.stem} ${q.context ?? ''}`).includes(needle)) return false;
  }
  return true;
}

export const questions = {
  async list(filters = {}) {
    const me = requireUser();
    return clone(
      state.questions
        .filter((q) => q.ownerId === me || q.visibility === 'public')
        .filter((q) => matchesFilters(q, filters))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  },
  async get(id) {
    return clone(state.questions.find((q) => q.id === id) ?? null);
  },
  async getMany(ids) {
    const set = new Set(ids);
    return clone(state.questions.filter((q) => set.has(q.id)));
  },
  async save(input) {
    const me = requireUser();
    const existing = input.id ? state.questions.find((q) => q.id === input.id) : null;
    if (existing) {
      if (existing.ownerId !== me) throw new Error('Yalnızca kendi sorularınızı düzenleyebilirsiniz.');
      state.revisions.push({ id: uid('rev'), questionId: existing.id, version: existing.version, data: clone(existing), editedBy: me, editedAt: now() });
      Object.assign(existing, input, { version: existing.version + 1, updatedAt: now() });
      persist();
      return clone(existing);
    }
    const created = {
      status: 'draft', visibility: 'private', source: 'manual', reportCount: 0, context: '', skills: {}, outcomeCodes: [],
      ...input,
      id: uid('q'), ownerId: me, version: 1, createdAt: now(), updatedAt: now(),
    };
    state.questions.push(created);
    persist();
    return clone(created);
  },
  async setStatus(id, status) {
    const q = state.questions.find((x) => x.id === id);
    if (!q) throw new Error('Soru bulunamadı.');
    q.status = status;
    q.updatedAt = now();
    persist();
    return clone(q);
  },
  async remove(id) {
    const used = state.usages.some((u) => u.questionId === id);
    const inExam = state.exams.some((e) => e.sections.some((s) => s.items.some((i) => i.questionId === id)));
    if (used || inExam) throw new Error('Bu soru bir sınavda yer aldığı için silinemez. Arşivleyebilirsiniz.');
    state.questions = state.questions.filter((q) => q.id !== id);
    persist();
  },
  async stats() {
    const me = requireUser();
    const mine = state.questions.filter((q) => q.ownerId === me);
    const count = (status) => mine.filter((q) => q.status === status).length;
    return { total: mine.length, active: count('active'), draft: count('draft'), quarantined: count('quarantined') };
  },
};

// ---------------- Sınavlar ----------------
export const exams = {
  async listMine() {
    const me = requireUser();
    return clone(state.exams.filter((e) => e.ownerId === me).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  },
  async get(id) {
    return clone(state.exams.find((e) => e.id === id) ?? null);
  },
  async create(input) {
    const me = requireUser();
    const exam = {
      kind: 'written', title: 'Yeni Yazılı', grade: null, subjectId: null, classIds: [], examDate: todayIso(),
      header: { schoolName: '', academicYear: '', term: '', durationMin: 40, instructions: '' },
      sections: [{ id: uid('s'), title: 'Sorular', items: [] }],
      ...input,
      id: uid('e'), ownerId: me, status: 'draft', finalizedAt: null, createdAt: now(), updatedAt: now(),
    };
    state.exams.push(exam);
    persist();
    return clone(exam);
  },
  async save(input) {
    const exam = state.exams.find((e) => e.id === input.id);
    if (!exam) throw new Error('Sınav bulunamadı.');
    if (exam.status !== 'draft') throw new Error('Kesinleşmiş sınav düzenlenemez.');
    Object.assign(exam, input, { updatedAt: now() });
    persist();
    return clone(exam);
  },
  async remove(id) {
    const exam = state.exams.find((e) => e.id === id);
    if (exam?.status === 'finalized') throw new Error('Kesinleşmiş sınav silinemez; önce kesinleştirmeyi geri alın ya da arşivleyin.');
    state.exams = state.exams.filter((e) => e.id !== id);
    persist();
  },
  /**
   * Sınavı kesinleştirir ve KULLANILMIŞ SORU kayıtlarını yazar.
   * Supabase'de bu işlem tek bir transaction içinde finalize_exam() RPC fonksiyonuyla yapılacak.
   */
  async finalize(id) {
    const me = requireUser();
    const exam = state.exams.find((e) => e.id === id);
    if (!exam || exam.ownerId !== me) throw new Error('Sınav bulunamadı.');
    if (exam.status !== 'draft') throw new Error('Sınav zaten kesinleşmiş.');
    const items = exam.sections.flatMap((s) => s.items);
    if (!items.length) throw new Error('Sınavda hiç soru yok.');
    if (!exam.examDate) throw new Error('Sınav tarihi girilmelidir.');

    for (const item of items) {
      const q = state.questions.find((x) => x.id === item.questionId);
      item.snapshot = clone(q); // soru sonradan düzenlense de bu sınavın içeriği korunur
      state.usages = state.usages.filter((u) => !(u.examId === exam.id && u.questionId === item.questionId));
      state.usages.push({
        teacherId: me, questionId: item.questionId, examId: exam.id, examTitle: exam.title,
        examKind: exam.kind, examDate: exam.examDate, classIds: [...exam.classIds], createdAt: now(),
      });
    }
    exam.status = 'finalized';
    exam.finalizedAt = now();
    exam.updatedAt = now();
    persist();
    return clone(exam);
  },
  async unfinalize(id) {
    const exam = state.exams.find((e) => e.id === id);
    if (!exam || exam.status !== 'finalized') throw new Error('Sınav kesinleşmiş değil.');
    state.usages = state.usages.filter((u) => u.examId !== id);
    exam.status = 'draft';
    exam.finalizedAt = null;
    exam.sections.forEach((s) => s.items.forEach((i) => delete i.snapshot));
    exam.updatedAt = now();
    persist();
    return clone(exam);
  },
  async duplicate(id) {
    const src = state.exams.find((e) => e.id === id);
    if (!src) throw new Error('Sınav bulunamadı.');
    const copy = clone(src);
    copy.sections.forEach((s) => s.items.forEach((i) => delete i.snapshot));
    return exams.create({ ...copy, title: `${src.title} (kopya)`, examDate: todayIso(), id: undefined });
  },
};

// ---------------- Kullanılmış soru kayıtları ----------------
export const usages = {
  /**
   * Öğretmenin tüm kullanım kayıtlarını soru bazında gruplar.
   * Dönen Map: questionId → kayıtlar (en yeni tarih başta).
   */
  async mySummary() {
    const me = requireUser();
    const map = new Map();
    for (const u of state.usages.filter((x) => x.teacherId === me)) {
      if (!map.has(u.questionId)) map.set(u.questionId, []);
      map.get(u.questionId).push(clone(u));
    }
    for (const list of map.values()) list.sort((a, b) => b.examDate.localeCompare(a.examDate));
    return map;
  },
};

// ---------------- Yapay zeka (Demo Modu'nda kapalı) ----------------
export const ai = {
  available: false,
  async generate() {
    throw new Error('Yapay zeka ile soru üretimi Demo Modu\'nda kullanılamaz. Supabase ve Claude API bağlandığında etkinleşir.');
  },
};
