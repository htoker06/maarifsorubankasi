import { describe, it, expect } from 'vitest';
import { buildAnswerKey, totalPoints } from '../src/features/exam-builder/answer-key.js';
import { matchingLayout } from '../src/ui/components.js';

const qs = {
  mc: { id: 'mc', type: 'multiple_choice', body: { options: [{ key: 'A', text: '6/8' }, { key: 'B', text: '4/3' }] }, answer: 'A' },
  tf: { id: 'tf', type: 'true_false', body: {}, answer: false },
  fb: { id: 'fb', type: 'fill_blank', body: {}, answer: ['yoğunluk', 'özkütle'] },
  oe: { id: 'oe', type: 'open_ended', body: { rubric: [{ criterion: 'Yöntem', points: 3 }, { criterion: 'Sonuç', points: 7 }] }, answer: '12 cm' },
  mt: { id: 'mt', type: 'matching', body: { pairs: [{ left: '2³', right: '8' }, { left: '3²', right: '9' }, { left: '5²', right: '25' }] }, answer: null },
};

const exam = {
  sections: [
    { id: 's1', title: 'A', items: [{ questionId: 'mc', points: 10 }, { questionId: 'tf', points: 5 }] },
    { id: 's2', title: 'B', items: [{ questionId: 'fb', points: 5 }, { questionId: 'oe', points: 20 }, { questionId: 'mt', points: 6 }] },
  ],
};

describe('buildAnswerKey', () => {
  const key = buildAnswerKey(exam, qs);

  it('bölümler boyunca sürekli numaralandırır', () => {
    expect(key.map((r) => r.no)).toEqual([1, 2, 3, 4, 5]);
  });

  it('her soru tipi için okunur cevap üretir', () => {
    expect(key[0].answer).toBe('A) 6/8');
    expect(key[1].answer).toBe('Yanlış');
    expect(key[2].answer).toBe('yoğunluk / özkütle');
    expect(key[3].answer).toBe('12 cm');
  });

  it('açık uçlu rubrik puanlarını soru puanına oranlar', () => {
    expect(key[3].rubric).toEqual([{ criterion: 'Yöntem', points: 6 }, { criterion: 'Sonuç', points: 14 }]);
  });

  it('eşleştirme anahtarı karıştırılmış sağ sütunla tutarlıdır', () => {
    const layout = matchingLayout(qs.mt);
    layout.key.forEach((pair, i) => {
      const letter = pair.split('-')[1];
      const right = layout.right.find((r) => r.letter === letter);
      expect(right.text).toBe(qs.mt.body.pairs[i].right);
    });
  });

  it('toplam puanı hesaplar', () => {
    expect(totalPoints(exam)).toBe(46);
  });

  it('kesinleşmiş sınavda sorunun anlık görüntüsünü kullanır', () => {
    const snapExam = { sections: [{ id: 's', items: [{ questionId: 'mc', points: 5, snapshot: { ...qs.mc, answer: 'B' } }] }] };
    expect(buildAnswerKey(snapExam, qs)[0].answer).toBe('B) 4/3');
  });
});
