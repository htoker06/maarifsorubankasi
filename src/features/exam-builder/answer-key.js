import { answerText } from '../../ui/components.js';

/** Sınavdaki soruları bölüm sırasına göre numaralandırır: [{ no, sectionTitle, item, question }] */
export function numberedItems(exam, questionsById) {
  let no = 0;
  return exam.sections.flatMap((section) =>
    section.items.map((item) => {
      no += 1;
      const question = item.snapshot ?? questionsById[item.questionId];
      return { no, sectionId: section.id, sectionTitle: section.title, item, question };
    }),
  );
}

export function totalPoints(exam) {
  return exam.sections.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (Number(i.points) || 0), 0), 0);
}

/**
 * Cevap anahtarı ve puanlama baremi.
 * Açık uçlu sorularda ölçütlerin puanı, soruya verilen puana oranlanır.
 */
export function buildAnswerKey(exam, questionsById) {
  return numberedItems(exam, questionsById)
    .filter((row) => row.question)
    .map(({ no, item, question }) => {
      const points = Number(item.points) || 0;
      let rubric = null;
      if (question.type === 'open_ended' && question.body?.rubric?.length) {
        const rubricTotal = question.body.rubric.reduce((a, r) => a + (Number(r.points) || 0), 0) || 1;
        rubric = question.body.rubric.map((r) => ({
          criterion: r.criterion,
          points: Math.round(((Number(r.points) || 0) / rubricTotal) * points * 10) / 10,
        }));
      }
      return { no, questionId: question.id, type: question.type, answer: answerText(question), solution: question.solution ?? '', points, rubric };
    });
}
