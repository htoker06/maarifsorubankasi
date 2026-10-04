// Veritabanı (snake_case) ↔ uygulama (camelCase) dönüşümleri. Hem tarayıcıda hem sunucu fonksiyonlarında kullanılır.

export function questionFromRow(r) {
  if (!r) return null;
  return {
    id: r.id, ownerId: r.owner_id, grade: r.grade, subjectId: r.subject_id, themeId: r.theme_id,
    outcomeCodes: r.outcome_codes ?? [], type: r.type, difficulty: r.difficulty, bloom: r.bloom,
    skills: r.skills ?? {}, stem: r.stem, context: r.context ?? '', media: r.media ?? [], body: r.body ?? {},
    answer: r.answer, solution: r.solution ?? '', defaultPoints: Number(r.default_points ?? 5), status: r.status,
    visibility: r.visibility, source: r.source, aiMeta: r.ai_meta, reportCount: r.report_count ?? 0,
    version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const QUESTION_WRITABLE = {
  grade: 'grade', subjectId: 'subject_id', themeId: 'theme_id', outcomeCodes: 'outcome_codes', type: 'type',
  difficulty: 'difficulty', bloom: 'bloom', skills: 'skills', stem: 'stem', context: 'context', media: 'media',
  body: 'body', answer: 'answer', solution: 'solution', defaultPoints: 'default_points', status: 'status',
  visibility: 'visibility', source: 'source', aiMeta: 'ai_meta',
};

export function questionToRow(q) {
  const row = {};
  for (const [k, col] of Object.entries(QUESTION_WRITABLE)) if (q[k] !== undefined) row[col] = q[k];
  return row;
}

export function examFromRow(r) {
  if (!r) return null;
  return {
    id: r.id, ownerId: r.owner_id, kind: r.kind, title: r.title, grade: r.grade, subjectId: r.subject_id,
    classIds: r.class_ids ?? [], examDate: r.exam_date, status: r.status, header: r.header ?? {},
    sections: r.sections ?? [], finalizedAt: r.finalized_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function examToRow(e) {
  const map = { kind: 'kind', title: 'title', grade: 'grade', subjectId: 'subject_id', classIds: 'class_ids', examDate: 'exam_date', header: 'header', sections: 'sections' };
  const row = {};
  for (const [k, col] of Object.entries(map)) if (e[k] !== undefined) row[col] = e[k];
  return row;
}

export const usageFromRow = (r) => ({
  teacherId: r.teacher_id, questionId: r.question_id, examId: r.exam_id, examTitle: r.exam_title,
  examKind: r.exam_kind, examDate: r.exam_date, classIds: r.class_ids ?? [], createdAt: r.created_at,
});

export const profileFromRow = (r) =>
  r && { id: r.id, role: r.role, fullName: r.full_name, schoolName: r.school_name, grade: r.grade, createdAt: r.created_at };

export const classFromRow = (r) => ({
  id: r.id, teacherId: r.teacher_id, name: r.name, grade: r.grade, subjectId: r.subject_id, joinCode: r.join_code,
  studentIds: (r.class_members ?? []).map((m) => m.student_id), createdAt: r.created_at,
});

export const teacherRequestFromRow = (r) => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, email: r.email, schoolName: r.school_name, branch: r.branch,
  note: r.note, status: r.status, reason: r.reason, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, createdAt: r.created_at,
});
