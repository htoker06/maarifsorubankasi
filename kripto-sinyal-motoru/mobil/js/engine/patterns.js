// Formasyon tanıma motoru (patterns.py'nin birebir karşılığı).
// Pivotlar sağdaki bar sayısı kadar sonra onaylanır; kırılım "tutunmuş" olmalıdır.

import { argmax, argmin, isNum, linspace, nanmax, nanmin, polyfit1, polyfit2, clip, maxBy, lexGreater } from './math.js';
import { tail } from './indicators.js';

const line = (slope, intercept) => ({ slope, intercept, at: (x) => slope * x + intercept });
const lineThrough = (x1, y1, x2, y2) => {
  const s = (y2 - y1) / (x2 - x1);
  return line(s, y1 - s * x1);
};

export function findPivots(series, left, right, kind) {
  const out = [];
  for (let i = left; i < series.length - right; i++) {
    const idx = kind === 'high' ? argmax(series, i - left, i + right + 1) : argmin(series, i - left, i + right + 1);
    if (idx === i) out.push(i);
  }
  return out;
}

/** Seviyenin yukarı kırılıp tutunduğu bar sayısı (0 = son mum); yoksa null. */
export function breakoutAge(close, level, start) {
  const n = close.length;
  const above = close.map((c, i) => isNum(level[i]) && c > level[i]);
  if (n === 0 || !above[n - 1]) return null;
  let j = n - 1;
  while (j - 1 >= start && above[j - 1]) j--;
  if (j <= start || !isNum(level[j - 1])) return null;
  return n - 1 - j;
}

export const breakdownAge = (close, level, start) =>
  breakoutAge(close.map((v) => -v), level.map((v) => -v), start);

function envelope(x, y, upper) {
  let [slope, intercept] = polyfit1(x, y);
  const resid = y.map((v, i) => v - (slope * x[i] + intercept));
  intercept += upper ? Math.max(...resid) : Math.min(...resid);
  return line(slope, intercept);
}

function touches(ln, x, y, tol = 0.015) {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(y[i] - ln.at(x[i])) / Math.abs(y[i]) <= tol) n++;
  return n;
}

const better = (m, best) => best === null || lexGreater([m.broken, m.quality], [best.broken, best.quality]);

function match(o) {
  return { bullish: true, meta: {}, ...o, broken: o.breakout_age !== null && o.breakout_age !== undefined };
}

const levelFrom = (n, from, valueFn) => Array.from({ length: n }, (_, i) => (i >= from ? valueFn(i) : NaN));

export class PatternEngine {
  constructor(cfg) { this.cfg = cfg; }

  detect(df) {
    const c = this.cfg;
    const data = tail(df, Math.max(c.pattern_lookback, c.donchian_period + 5));
    if (data.close.length < 40) return [];
    const { high: h, low: l, close: cl, open: o } = data;
    const ph = findPivots(h, c.pivot_left, c.pivot_right, 'high');
    const pl = findPivots(l, c.pivot_left, c.pivot_right, 'low');
    const found = [];
    const fns = [
      () => this.inverseHeadShoulders(h, l, cl, ph, pl),
      () => this.multipleBottom(h, l, cl, ph, pl),
      () => this.roundingBottom(h, l, cl),
      () => this.wedgesAndPennants(h, l, cl, ph, pl),
      () => this.descendingTrendline(h, l, cl, ph, pl),
      () => this.marketStructureShift(h, l, cl, o, ph),
      () => this.donchian(h, l, cl),
    ];
    for (const fn of fns) {
      const res = fn();
      if (res === null || res === undefined) continue;
      if (Array.isArray(res)) found.push(...res); else found.push(res);
    }
    return found;
  }

  inverseHeadShoulders(h, l, c, ph, pl) {
    const cfg = this.cfg;
    let best = null;
    const cand = pl.slice(-7);
    for (let k = 0; k < cand.length - 2; k++) {
      const [ls, hd, rs] = [cand[k], cand[k + 1], cand[k + 2]];
      const [lsV, hdV, rsV] = [l[ls], l[hd], l[rs]];
      const floor = Math.min(lsV, rsV);
      if (hdV >= floor * (1 - cfg.min_head_depth)) continue;
      if (Math.abs(lsV - rsV) / floor > cfg.shoulder_tolerance) continue;
      if (nanmin(l, rs) < hdV) continue;
      const p1 = argmax(h, ls, hd + 1);
      const p2 = argmax(h, hd, rs + 1);
      if (p1 === p2) continue;
      const neck = lineThrough(p1, h[p1], p2, h[p2]);
      if (Math.abs(neck.slope) / h[p2] > 0.01) continue;
      const level = levelFrom(c.length, rs + 1, (i) => neck.at(i));
      const age = breakoutAge(c, level, rs + 1);
      const symmetry = 1 - Math.abs(lsV - rsV) / floor / cfg.shoulder_tolerance;
      const depth = Math.min(1, (floor - hdV) / floor / 0.15);
      const m = match({
        name: 'TOBO', breakout_level: neck.at(c.length - 1), breakout_age: age, invalidation: rsV,
        height: neck.at(hd) - hdV, quality: clip(0.5 * symmetry + 0.5 * depth, 0, 1),
        meta: { left_shoulder: lsV, head: hdV, right_shoulder: rsV },
      });
      if (better(m, best)) best = m;
    }
    return best;
  }

  multipleBottom(h, l, c, ph, pl) {
    const cfg = this.cfg;
    let best = null;
    const cand = pl.slice(-5);
    const combos = [];
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        combos.push([cand[i], cand[j]]);
        for (let k = j + 1; k < cand.length; k++) combos.push([cand[i], cand[j], cand[k]]);
      }
    }
    for (const combo of combos) {
      const lows = combo.map((i) => l[i]);
      const floor = Math.min(...lows), top = Math.max(...lows);
      if (top / floor - 1 > cfg.bottom_tolerance) continue;
      let sepOk = true;
      for (let i = 1; i < combo.length; i++) if (combo[i] - combo[i - 1] < cfg.min_bottom_separation) sepOk = false;
      if (!sepOk) continue;
      const first = combo[0], last = combo[combo.length - 1];
      if (nanmin(l, first) < floor * (1 - cfg.bottom_tolerance / 2)) continue;
      const neckLevel = nanmax(h, first, last + 1);
      const depth = neckLevel / floor - 1;
      if (depth < 0.08) continue;
      const level = levelFrom(c.length, last + 1, () => neckLevel);
      const age = breakoutAge(c, level, last + 1);
      const tightness = 1 - (top / floor - 1) / cfg.bottom_tolerance;
      const m = match({
        name: combo.length === 3 ? 'Üçlü Dip' : 'İkili Dip', breakout_level: neckLevel, breakout_age: age,
        invalidation: floor, height: neckLevel - floor,
        quality: clip(0.6 * tightness + 0.4 * Math.min(1, depth / 0.3) + (combo.length === 3 ? 0.1 : 0), 0, 1),
        meta: { bottoms: lows },
      });
      if (better(m, best)) best = m;
    }
    return best;
  }

  roundingBottom(h, l, c) {
    const cfg = this.cfg;
    let best = null;
    const n = c.length;
    for (const w of [60, 90, 120, 160]) {
      const end = n - 4;
      const start = end - w;
      if (start < 0) continue;
      const y = c.slice(start, end).map(Math.log);
      const x = linspace(-1, 1, w);
      const [a, b, cc] = polyfit2(x, y);
      const fit = x.map((xi) => a * xi * xi + b * xi + cc);
      const mean = y.reduce((s, v) => s + v, 0) / w;
      let ssRes = 0, ssTot = 0;
      for (let i = 0; i < w; i++) { ssRes += (y[i] - fit[i]) ** 2; ssTot += (y[i] - mean) ** 2; }
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      if (a <= 0 || r2 < cfg.rounding_min_r2) continue;
      const vertex = -b / (2 * a);
      if (vertex < -0.4 || vertex > 0.4) continue;
      const rim = nanmax(c, start, start + Math.max(5, Math.floor(w / 7)));
      const bottom = nanmin(l, start, end);
      if (rim / bottom - 1 < 0.15) continue;
      const from = end - Math.floor(w / 4);
      const level = levelFrom(n, from, () => rim);
      const m = match({
        name: 'Çanak Dip', breakout_level: rim, breakout_age: breakoutAge(c, level, from),
        invalidation: nanmin(l, start + Math.floor(w / 2), end), height: rim - bottom,
        quality: clip(r2, 0, 1), meta: { window: w, r2 },
      });
      if (better(m, best)) best = m;
    }
    return best;
  }

  wedgesAndPennants(h, l, c, ph, pl) {
    const cfg = this.cfg;
    const n = c.length;
    const out = [];
    for (const w of [45, 90, 140]) {
      const start = Math.max(0, n - w);
      const hx = ph.filter((i) => i >= start);
      const lx = pl.filter((i) => i >= start);
      if (hx.length < cfg.wedge_min_touches || lx.length < cfg.wedge_min_touches) continue;
      const hy = hx.map((i) => h[i]), ly = lx.map((i) => l[i]);
      const up = envelope(hx, hy, true);
      const lo = envelope(lx, ly, false);
      const x0 = Math.min(hx[0], lx[0]);
      const xEnd = Math.max(hx[hx.length - 1], lx[lx.length - 1]);
      const width0 = up.at(x0) - lo.at(x0);
      const width1 = up.at(xEnd) - lo.at(xEnd);
      if (width0 <= 0 || width1 <= 0 || width1 > 0.75 * width0) continue;
      if (touches(up, hx, hy) < 2 || touches(lo, lx, ly) < 2) continue;
      const relUp = up.slope / c[x0], relLo = lo.slope / c[x0];
      const upperLevel = levelFrom(n, xEnd + 1, (i) => up.at(i));
      const lowerLevel = levelFrom(n, xEnd + 1, (i) => lo.at(i));
      const meta = { upper: [up.slope, up.intercept], lower: [lo.slope, lo.intercept], window: w };
      const lastLowPivot = l[lx[lx.length - 1]];
      const q = clip(1 - width1 / width0, 0, 1);
      if (relUp < 0 && relLo < 0 && up.slope < lo.slope) {
        out.push(match({ name: 'Düşen Kama', breakout_level: up.at(n - 1), breakout_age: breakoutAge(c, upperLevel, xEnd + 1),
          invalidation: lastLowPivot, height: width0, quality: q, meta }));
      } else if (relUp > 0 && relLo > 0 && lo.slope > up.slope) {
        out.push(match({ name: 'Yükselen Kama', breakout_level: lo.at(n - 1), breakout_age: breakdownAge(c, lowerLevel, xEnd + 1),
          invalidation: up.at(n - 1), height: width0, quality: q, bullish: false, meta }));
      } else if (relUp < 0 && relLo > 0) {
        const poleStart = Math.max(0, x0 - 15);
        const pole = x0 > poleStart ? c[x0] / c[poleStart] - 1 : 0;
        out.push(match({ name: pole >= 0.15 ? 'Flama' : 'Simetrik Üçgen', breakout_level: up.at(n - 1),
          breakout_age: breakoutAge(c, upperLevel, xEnd + 1), invalidation: lastLowPivot,
          height: Math.max(width0, c[x0] - c[poleStart]), quality: q, meta: { ...meta, pole } }));
      }
    }
    const best = new Map();
    for (const m of out) {
      const cur = best.get(m.name);
      if (cur === undefined || lexGreater([m.broken, m.quality], [cur.broken, cur.quality])) best.set(m.name, m);
    }
    return [...best.values()];
  }

  descendingTrendline(h, l, c, ph, pl) {
    const n = c.length;
    const start = Math.max(0, n - this.cfg.trendline_lookback);
    const hx = ph.filter((i) => i >= start);
    if (hx.length < 2) return null;
    const anchor = hx[argmax(hx.map((i) => h[i]))];
    const later = hx.filter((i) => i > anchor);
    if (!later.length) return null;
    const slopes = later.map((i) => (h[i] - h[anchor]) / (i - anchor));
    const k = argmax(slopes);
    const ln = line(slopes[k], h[anchor] - slopes[k] * anchor);
    if (ln.slope >= 0) return null;
    const lastTouch = later[k];
    for (let i = anchor; i <= lastTouch; i++) if (c[i] > ln.at(i) * 1.005) return null;
    const level = levelFrom(n, lastTouch + 1, (i) => ln.at(i));
    const age = breakoutAge(c, level, lastTouch + 1);
    const hxa = hx.filter((i) => i >= anchor);
    const tch = touches(ln, hxa, hxa.map((i) => h[i]));
    const lowsAfter = pl.filter((i) => i > lastTouch);
    const invalid = lowsAfter.length ? l[lowsAfter[lowsAfter.length - 1]] : nanmin(l, lastTouch);
    return match({
      name: 'Düşen Trend Kırılımı', breakout_level: ln.at(n - 1), breakout_age: age, invalidation: invalid,
      height: h[anchor] - nanmin(l, anchor), quality: clip(0.4 + 0.2 * tch, 0, 1),
      meta: { anchor_high: h[anchor], touches: tch, slope: ln.slope },
    });
  }

  marketStructureShift(h, l, c, o, ph) {
    if (ph.length < 2) return null;
    const n = c.length;
    for (let i = ph.length - 1; i > 0; i--) {
      const prev = ph[i - 1], cur = ph[i];
      if (h[cur] >= h[prev]) continue;
      const level = levelFrom(n, cur + 1, () => h[cur]);
      const age = breakoutAge(c, level, cur + 1);
      if (age === null) return null;
      const j = n - 1 - age;
      const rng = h[j] - l[j];
      const body = rng > 0 ? Math.abs(c[j] - o[j]) / rng : 0;
      if (body < 0.6) return null;
      return match({
        name: 'MSS (ChoCh)', breakout_level: h[cur], breakout_age: age,
        invalidation: nanmin(l, cur, j + 1), height: h[prev] - nanmin(l, cur, j + 1),
        quality: clip(body, 0, 1), meta: { lower_high: h[cur], previous_high: h[prev] },
      });
    }
    return null;
  }

  donchian(h, l, c) {
    const p = this.cfg.donchian_period;
    const n = c.length;
    if (n <= p + 1) return null;
    const upper = new Array(n).fill(NaN);
    for (let i = p; i < n; i++) upper[i] = nanmax(h, i - p, i); // shift(1).rolling(p).max()
    for (let j = n - 1; j > Math.max(p, n - 15); j--) {
      if (c[j] > upper[j] && c[j - 1] <= upper[j - 1]) {
        let held = true;
        for (let k = j; k < n; k++) if (!(c[k] > upper[j])) held = false;
        if (held) {
          return match({ name: `Donchian ${p}G Kırılımı`, breakout_level: upper[j], breakout_age: n - 1 - j,
            invalidation: l[j], height: upper[j] - nanmin(l, j - p, j), quality: 0.5 });
        }
      }
    }
    return match({ name: `Donchian ${p}G Kırılımı`, breakout_level: upper[n - 1], breakout_age: null,
      invalidation: l[n - 1], height: upper[n - 1] - nanmin(l, n - p), quality: 0.5 });
  }
}

export { maxBy };
