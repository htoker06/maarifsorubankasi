import { formatDate } from '../../lib/format.js';

/**
 * Bir sorunun daha önce kullanılıp kullanılmadığını değerlendirir.
 * @param {Array} entries  Bu soruya ait kullanım kayıtları (en yeni tarih başta)
 * @param {object} exam    Üzerinde çalışılan sınav ({ id, classIds })
 * @returns {null | { level: 'danger'|'warning', ref, count, message, sameClass }}
 *   danger  → aynı sınıfta daha önce kullanılmış (kırmızı uyarı)
 *   warning → başka bir sınıfta / sınıf belirtilmeden kullanılmış (turuncu uyarı)
 */
export function evaluateUsage(entries, exam) {
  const past = (entries ?? []).filter((e) => e.examId !== exam?.id);
  if (!past.length) return null;
  const examClasses = exam?.classIds ?? [];
  const sameClassEntry = past.find((e) => (e.classIds ?? []).some((c) => examClasses.includes(c)));
  const ref = sameClassEntry ?? past[0];
  return {
    level: sameClassEntry ? 'danger' : 'warning',
    sameClass: Boolean(sameClassEntry),
    ref,
    count: past.length,
    message: `Bu soruyu ${formatDate(ref.examDate)} tarihli "${ref.examTitle}" sınavında kullandınız!`,
  };
}

/** Soru, kesinleşmemiş başka bir taslak sınavda da var mı? (yumuşak bilgi notu) */
export function draftConflicts(questionId, exam, allExams) {
  return allExams.filter(
    (e) => e.id !== exam.id && e.status === 'draft' && e.sections.some((s) => s.items.some((i) => i.questionId === questionId)),
  );
}
