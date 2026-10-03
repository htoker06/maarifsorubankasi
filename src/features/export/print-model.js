// PDF ve Word çıktılarının ortak içerik modeli: aynı sınav her iki formatta birebir aynı numaralanır.
import { numberedItems, buildAnswerKey, totalPoints } from '../exam-builder/answer-key.js';
import { matchingLayout } from '../../ui/components.js';
import { formatDate } from '../../lib/format.js';

export function buildPrintModel({ exam, questionsById, lookup }) {
  const subject = lookup.subjects[exam.subjectId];
  const h = exam.header ?? {};
  const headerLines = [
    h.schoolName,
    [h.academicYear && `${h.academicYear} Eğitim-Öğretim Yılı`, h.term].filter(Boolean).join(' '),
    [subject && `${subject.gradeId}. Sınıf ${subject.name}`, exam.title].filter(Boolean).join(' — '),
  ].filter(Boolean);

  const sections = exam.sections.map((s) => ({ id: s.id, title: s.title, rows: [] }));
  for (const row of numberedItems(exam, questionsById)) {
    const q = row.question;
    if (!q) continue;
    const entry = { no: row.no, points: Number(row.item.points) || 0, type: q.type, context: q.context || '', stem: q.stem };
    if (q.type === 'multiple_choice') entry.options = q.body.options.map((o) => `${o.key}) ${o.text}`);
    if (q.type === 'matching') entry.matching = matchingLayout(q);
    if (q.type === 'fill_blank') entry.stem = q.stem.replace(/_{3,}/g, '……………………');
    sections.find((s) => s.id === row.sectionId).rows.push(entry);
  }

  return {
    title: exam.title,
    headerLines,
    date: formatDate(exam.examDate),
    durationMin: h.durationMin,
    instructions: h.instructions,
    total: totalPoints(exam),
    sections: sections.filter((s) => s.rows.length),
    showSectionTitles: exam.sections.length > 1,
    answerKey: buildAnswerKey(exam, questionsById),
  };
}

// Bazı tarayıcılar Türkçe karakterli indirme adlarını "download" olarak değiştirir; bu yüzden ASCII'ye çevrilir.
const TR_ASCII = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };

export function fileName(exam, suffix) {
  const base =
    exam.title
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c])
      .normalize('NFD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'sinav';
  return `${base}${suffix}`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
