/**
 * Otomatik yazılı oluşturma: zorluk oranlarına ve temalara dengeli dağılımla soru seçer.
 * @param {Array} pool  Aday sorular (aktif, filtrelenmiş)
 * @param {object} opts { count, ratios: {kolay, orta, zor}, excludeIds: Set, random }
 * @returns {{ selected: Array, shortage: number, plan: object }}
 */
export function autoSelect(pool, { count, ratios, excludeIds = new Set(), random = Math.random }) {
  const candidates = pool.filter((q) => !excludeIds.has(q.id));
  const levels = ['kolay', 'orta', 'zor'];
  const ratioSum = levels.reduce((a, l) => a + (Number(ratios[l]) || 0), 0) || 1;

  // Hedef sayılar (en büyük kalan yöntemiyle toplam = count)
  const raw = levels.map((l) => ((Number(ratios[l]) || 0) / ratioSum) * count);
  const plan = Object.fromEntries(levels.map((l, i) => [l, Math.floor(raw[i])]));
  let rest = count - Object.values(plan).reduce((a, b) => a + b, 0);
  levels
    .map((l, i) => ({ l, frac: raw[i] - Math.floor(raw[i]) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ l }) => {
      if (rest > 0) (plan[l] += 1), (rest -= 1);
    });

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Temalar arasında sırayla seçim (round-robin) → kapsam dengesi
  const pickBalanced = (list, n) => {
    const byTheme = new Map();
    for (const q of shuffle(list)) {
      if (!byTheme.has(q.themeId)) byTheme.set(q.themeId, []);
      byTheme.get(q.themeId).push(q);
    }
    const queues = shuffle([...byTheme.values()]);
    const out = [];
    while (out.length < n && queues.some((qq) => qq.length)) {
      for (const qq of queues) if (qq.length && out.length < n) out.push(qq.shift());
    }
    return out;
  };

  const selected = [];
  for (const level of levels) {
    selected.push(...pickBalanced(candidates.filter((q) => q.difficulty === level), plan[level]));
  }
  // Bir zorlukta yeterli soru yoksa diğerlerinden tamamla
  if (selected.length < count) {
    const chosen = new Set(selected.map((q) => q.id));
    selected.push(...pickBalanced(candidates.filter((q) => !chosen.has(q.id)), count - selected.length));
  }
  return { selected, shortage: Math.max(0, count - selected.length), plan };
}

/** Toplam puanı sorulara dağıtır; açık uçlu sorulara ağırlık verir, toplam her zaman tam tutar. */
export function distributePoints(questions, total) {
  if (!questions.length) return [];
  const weight = (q) => (q.type === 'open_ended' ? 2 : q.type === 'matching' ? 1.5 : 1);
  const weights = questions.map(weight);
  const sum = weights.reduce((a, b) => a + b, 0);
  const pts = weights.map((w) => Math.floor((w / sum) * total));
  let rest = total - pts.reduce((a, b) => a + b, 0);
  for (let i = pts.length - 1; rest > 0; i = (i - 1 + pts.length) % pts.length) {
    pts[i] += 1;
    rest -= 1;
  }
  return pts;
}
