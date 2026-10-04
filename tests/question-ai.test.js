import { describe, it, expect } from 'vitest';
import { convertGenerated, validateRequest, buildUserPrompt, labelsFor, isDuplicate, QUESTIONS_SCHEMA } from '../api/_lib/question-ai.js';
import { MAARIF_DIMENSIONS } from '../src/data/constants.js';

const allowed = { conceptual: MAARIF_DIMENSIONS.conceptual.options, values: MAARIF_DIMENSIONS.values.options, literacies: MAARIF_DIMENSIONS.literacies.options, sel: MAARIF_DIMENSIONS.sel.options };
const ctx = {
  subjectName: 'Fen Bilimleri',
  theme: { name: 'Güneş Sistemi ve Tutulmalar', meta: { keyConcepts: ['gezegen'], fieldSkills: ['FBAB2. Sınıflandırma'] } },
  outcomes: [{ code: 'FB.6.1.1', text: 'Gezegenleri sınıflandırabilme', processComponents: ['a) Nitelikleri belirler.'] }],
  existingStems: ['Güneşe en yakın gezegen hangisidir?'],
};
const base = { grade: 6, subjectId: 'g6-fen-bilimleri', themeId: 'g6-fen-bilimleri-t1', bloom: 'analiz', difficulty: 'orta', count: 1 };
const empty = { context: '', options: [], true_false_answer: false, blank_answers: [], pairs: [], rubric: [], model_answer: '', solution: 'Çözüm', skills: { conceptual: ['Sınıflandırma', 'Uydurma beceri'], values: [], literacies: [], sel: [] }, self_check: 'ok' };

describe('validateRequest', () => {
  it('geçerli isteği kabul eder, sayıyı sınırlar', () => {
    expect(validateRequest({ ...base, type: 'multiple_choice', count: 5 }).errors).toEqual([]);
    expect(validateRequest({ ...base, type: 'multiple_choice', count: 50 }).errors[0]).toContain('1-10');
  });
  it('geçersiz tip ve eksik temayı reddeder', () => {
    const { errors } = validateRequest({ ...base, themeId: '', type: 'essay' });
    expect(errors).toHaveLength(2);
  });
});

describe('convertGenerated', () => {
  it('çoktan seçmeliyi harfli seçeneklere ve doğru cevaba çevirir', () => {
    const g = { ...empty, outcome_code: 'FB.6.1.1', stem: 'Hangi gezegen gazsal değildir?', options: [
      { text: 'Jüpiter', is_correct: false, rationale: 'Büyük gezegeni karasal sanma' },
      { text: 'Mars', is_correct: true, rationale: '' },
      { text: 'Satürn', is_correct: false, rationale: 'Halkalı gezegeni karasal sanma' },
      { text: 'Neptün', is_correct: false, rationale: 'Uzak gezegeni karasal sanma' },
    ] };
    const r = convertGenerated(g, { ...base, type: 'multiple_choice' }, ctx, allowed);
    expect(r.ok).toBe(true);
    expect(r.question.answer).toBe('B');
    expect(r.question.body.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.question.body.options[1].rationale).toBeNull();
    expect(r.question.skills.conceptual).toEqual(['Sınıflandırma']); // listede olmayan etiket atılır
    expect(r.question.status).toBe('draft');
  });

  it('birden fazla doğru seçeneği, eksik seçeneği ve "Hepsi"yi reddeder', () => {
    const g = { ...empty, outcome_code: 'FB.6.1.1', stem: 'Hangisi gezegendir?', options: [
      { text: 'Mars', is_correct: true, rationale: '' }, { text: 'Venüs', is_correct: true, rationale: '' }, { text: 'Hepsi', is_correct: false, rationale: '' },
    ] };
    const r = convertGenerated(g, { ...base, type: 'multiple_choice' }, ctx, allowed);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Seçenek sayısı/);
    expect(r.errors.join(' ')).toMatch(/bir doğru/);
    expect(r.errors.join(' ')).toMatch(/Hepsi/);
  });

  it('ilkokulda 3 seçenek ister', () => {
    const g = { ...empty, outcome_code: 'FB.6.1.1', stem: 'Hangisi gezegendir?', options: [
      { text: 'Mars', is_correct: true, rationale: '' }, { text: 'Ay', is_correct: false, rationale: 'x' }, { text: 'Güneş', is_correct: false, rationale: 'y' },
    ] };
    expect(convertGenerated(g, { ...base, grade: 3, type: 'multiple_choice' }, ctx, allowed).ok).toBe(true);
  });

  it('boşluk doldurmada ____ ve cevap ister', () => {
    expect(convertGenerated({ ...empty, outcome_code: 'FB.6.1.1', stem: 'Güneşe en yakın gezegen Merkürdür.', blank_answers: [] }, { ...base, type: 'fill_blank' }, ctx, allowed).errors).toHaveLength(2);
    const ok = convertGenerated({ ...empty, outcome_code: 'FB.6.1.1', stem: 'Halkalarıyla bilinen gezegen ____ gezegenidir.', blank_answers: ['Satürn', 'satürn ', 'Satürn'] }, { ...base, type: 'fill_blank' }, ctx, allowed);
    expect(ok.question.answer).toEqual(['Satürn', 'satürn']);
  });

  it('eşleştirmede tekrar eden sağ öğeyi, açık uçluda rubriksizliği reddeder', () => {
    const pairs = [{ left: 'Mars', right: 'Karasal' }, { left: 'Venüs', right: 'Karasal' }, { left: 'Jüpiter', right: 'Gazsal' }];
    expect(convertGenerated({ ...empty, outcome_code: 'FB.6.1.1', stem: 'Eşleştiriniz.', pairs }, { ...base, type: 'matching' }, ctx, allowed).ok).toBe(false);
    expect(convertGenerated({ ...empty, outcome_code: 'FB.6.1.1', stem: 'Açıklayınız.', rubric: [] }, { ...base, type: 'open_ended' }, ctx, allowed).ok).toBe(false);
    const oe = convertGenerated({ ...empty, outcome_code: 'FB.6.1.1', stem: 'Açıklayınız.', rubric: [{ criterion: 'Doğru sınıflama', points: 6 }, { criterion: 'Gerekçe', points: 4 }], model_answer: 'Örnek' }, { ...base, type: 'open_ended' }, ctx, allowed);
    expect(oe.question.defaultPoints).toBe(10);
  });

  it('bilinmeyen kazanım kodunu tek kazanım varsa düzeltir, birden çok varsa reddeder', () => {
    const g = { ...empty, outcome_code: 'YANLIS', stem: 'Mars karasal bir gezegendir.', true_false_answer: true };
    expect(convertGenerated(g, { ...base, type: 'true_false' }, ctx, allowed).question.outcomeCodes).toEqual(['FB.6.1.1']);
    const ctx2 = { ...ctx, outcomes: [...ctx.outcomes, { code: 'FB.6.1.2', text: 'Model', processComponents: [] }] };
    expect(convertGenerated(g, { ...base, type: 'true_false' }, ctx2, allowed).ok).toBe(false);
  });
});

describe('istem ve şema', () => {
  it('istem kazanımları, süreç bileşenlerini ve mevcut soruları içerir', () => {
    const p = buildUserPrompt({ ...base, type: 'multiple_choice', count: 3, focus: { conceptual: [], values: ['Sorumluluk'] }, notes: 'Günlük hayattan' }, ctx, labelsFor({ ...base, type: 'multiple_choice' }, MAARIF_DIMENSIONS));
    expect(p).toContain('FB.6.1.1: Gezegenleri sınıflandırabilme');
    expect(p).toContain('a) Nitelikleri belirler.');
    expect(p).toContain('tam olarak 4 seçenek');
    expect(p).toContain('Güneşe en yakın gezegen hangisidir?');
    expect(p).toContain('Sorumluluk');
  });
  it('şemada her nesne kapalı ve tüm alanlar zorunlu', () => {
    const walk = (s) => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
        Object.values(s.properties).forEach(walk);
      }
      if (s.type === 'array') walk(s.items);
    };
    walk(QUESTIONS_SCHEMA);
  });
  it('neredeyse aynı soruları yakalar', () => {
    expect(isDuplicate('Güneşe en yakın gezegen hangisidir?', ctx.existingStems)).toBe(true);
    expect(isDuplicate('Halkaları olan gezegen hangisidir?', ctx.existingStems)).toBe(false);
  });
});
