// Demo Modu veri deposu: Supabase bağlanana kadar tüm veriler tarayıcının localStorage'ında tutulur.
// Fonksiyonlar Supabase sürümüyle aynı imzaya sahiptir (async), böylece Adım 3'te yalnızca bu katman değişir.

import { createSeed } from '../data/demo-seed.js';
import { readJson, writeJson, removeKey } from '../lib/storage.js';
import { normalizeTr, todayIso, uid } from '../lib/format.js';

const KEY = 'sbm-demo-db-v1';

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
  /** Tüm müfredatı tek seferde (küçük veri) — etiket gösterimi için sözlükler. */
  async lookup() {
    return {
      subjects: Object.fromEntries(state.subjects.map((s) => [s.id, s])),
      themes: Object.fromEntries(state.themes.map((t) => [t.id, t])),
      outcomes: Object.fromEntries(state.outcomes.map((o) => [o.code, o])),
    };
  },
};

// ---------------- Sınıflar ----------------
export const classes = {
  async listMine() {
    const me = requireUser();
    return clone(state.classes.filter((c) => c.teacherId === me));
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
