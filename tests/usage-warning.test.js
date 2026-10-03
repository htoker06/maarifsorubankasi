import { describe, it, expect } from 'vitest';
import { evaluateUsage, draftConflicts } from '../src/features/exam-builder/usage-warning.js';

const entries = [
  { examId: 'e2', examTitle: 'Ünite Tarama', examDate: '2026-09-29', classIds: ['6B'] },
  { examId: 'e1', examTitle: '6-A 1. Yazılı', examDate: '2026-03-18', classIds: ['6A'] },
];

describe('evaluateUsage', () => {
  it('hiç kullanılmamış soru için uyarı vermez', () => {
    expect(evaluateUsage(undefined, { id: 'x', classIds: [] })).toBeNull();
    expect(evaluateUsage([], { id: 'x', classIds: [] })).toBeNull();
  });

  it('başka sınıfta kullanılmışsa turuncu uyarı ve en son sınavı verir', () => {
    const w = evaluateUsage(entries, { id: 'new', classIds: ['6C'] });
    expect(w.level).toBe('warning');
    expect(w.count).toBe(2);
    expect(w.message).toBe('Bu soruyu 29.09.2026 tarihli "Ünite Tarama" sınavında kullandınız!');
  });

  it('aynı sınıfta kullanılmışsa kırmızı uyarı ve o sınavı gösterir', () => {
    const w = evaluateUsage(entries, { id: 'new', classIds: ['6A'] });
    expect(w.level).toBe('danger');
    expect(w.sameClass).toBe(true);
    expect(w.message).toContain('18.03.2026');
    expect(w.message).toContain('6-A 1. Yazılı');
  });

  it('sorunun bu sınavın kendisindeki kaydını saymaz', () => {
    expect(evaluateUsage([entries[0]], { id: 'e2', classIds: ['6B'] })).toBeNull();
  });
});

describe('draftConflicts', () => {
  it('sorunun bulunduğu diğer taslak sınavları bulur', () => {
    const exams = [
      { id: 'a', status: 'draft', sections: [{ items: [{ questionId: 'q1' }] }] },
      { id: 'b', status: 'finalized', sections: [{ items: [{ questionId: 'q1' }] }] },
      { id: 'c', status: 'draft', sections: [{ items: [{ questionId: 'q2' }] }] },
    ];
    expect(draftConflicts('q1', { id: 'self' }, exams).map((e) => e.id)).toEqual(['a']);
  });
});
