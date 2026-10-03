import { describe, it, expect } from 'vitest';
import { autoSelect, distributePoints } from '../src/features/exam-builder/auto-select.js';

const make = (n, difficulty, themeId) => Array.from({ length: n }, (_, i) => ({ id: `${difficulty}-${themeId}-${i}`, difficulty, themeId, type: 'multiple_choice' }));
const pool = [...make(5, 'kolay', 't1'), ...make(5, 'kolay', 't2'), ...make(5, 'orta', 't1'), ...make(5, 'orta', 't2'), ...make(3, 'zor', 't1')];

let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('autoSelect', () => {
  it('zorluk oranlarına uyar', () => {
    const { selected, shortage } = autoSelect(pool, { count: 10, ratios: { kolay: 30, orta: 50, zor: 20 }, random });
    const count = (d) => selected.filter((q) => q.difficulty === d).length;
    expect(shortage).toBe(0);
    expect([count('kolay'), count('orta'), count('zor')]).toEqual([3, 5, 2]);
  });

  it('temalara dengeli dağıtır', () => {
    const { selected } = autoSelect(pool, { count: 10, ratios: { kolay: 100, orta: 0, zor: 0 }, random });
    expect(selected.filter((q) => q.themeId === 't1')).toHaveLength(5);
    expect(selected.filter((q) => q.themeId === 't2')).toHaveLength(5);
  });

  it('hariç tutulan (kullanılmış) soruları seçmez', () => {
    const excludeIds = new Set(pool.filter((q) => q.difficulty === 'zor').map((q) => q.id));
    const { selected } = autoSelect(pool, { count: 5, ratios: { kolay: 0, orta: 0, zor: 100 }, excludeIds, random });
    expect(selected.some((q) => excludeIds.has(q.id))).toBe(false);
    expect(selected).toHaveLength(5); // eksik zor sorular diğer zorluklardan tamamlanır
  });

  it('havuz yetmezse eksik sayısını bildirir', () => {
    const { selected, shortage } = autoSelect(pool.slice(0, 4), { count: 10, ratios: { kolay: 1, orta: 1, zor: 1 }, random });
    expect(selected).toHaveLength(4);
    expect(shortage).toBe(6);
  });

  it('aynı soruyu iki kez seçmez', () => {
    const { selected } = autoSelect(pool, { count: 23, ratios: { kolay: 1, orta: 1, zor: 1 }, random });
    expect(new Set(selected.map((q) => q.id)).size).toBe(selected.length);
  });
});

describe('distributePoints', () => {
  it('toplamı her zaman tam tutturur', () => {
    const qs = [{ type: 'multiple_choice' }, { type: 'open_ended' }, { type: 'true_false' }];
    for (const total of [100, 99, 7]) expect(distributePoints(qs, total).reduce((a, b) => a + b, 0)).toBe(total);
  });
  it('açık uçlu soruya daha fazla puan verir', () => {
    const [mc, oe] = distributePoints([{ type: 'multiple_choice' }, { type: 'open_ended' }], 30);
    expect(oe).toBeGreaterThan(mc);
  });
});
