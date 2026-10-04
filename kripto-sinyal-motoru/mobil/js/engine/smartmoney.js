// Akıllı para izi: OBV/CMF pozitif uyumsuzluğu ve hacim profili (smart_money.py karşılığı).

import { clip, isNum, linspace, median, nanmin, nanmax, polyfit1, argmax } from './math.js';
import { normalizedSlope } from './indicators.js';

export function hiddenAccumulation(df, endIdx, cfg) {
  const start = Math.max(0, endIdx - cfg.divergence_window);
  const len = endIdx - start;
  if (len < 20) return { price_slope: NaN, obv_slope: NaN, cmf_mean: NaN, cmf_rising: false, divergence: false, score: 0 };
  const close = df.close.slice(start, endIdx);
  const obv = df.obv.slice(start, endIdx);
  const vol = df.volume.slice(start, endIdx);
  const priceSlope = normalizedSlope(close);
  const avgVol = vol.reduce((a, b) => a + b, 0) / vol.length || 1;
  const [obvRaw] = polyfit1(obv.map((_, i) => i), obv);
  const obvSlope = obvRaw / avgVol;
  const cmf = df.cmf.slice(start, endIdx).filter(isNum);
  const cmfMean = cmf.length ? cmf.reduce((a, b) => a + b, 0) / cmf.length : 0;
  const half = Math.floor(cmf.length / 2);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const cmfRising = cmf.length > 10 && mean(cmf.slice(half)) > mean(cmf.slice(0, half));
  const flat = priceSlope <= 0.002;
  const divergence = flat && obvSlope > 0.05 && (cmfMean > 0 || cmfRising);
  let score = 0;
  if (flat) score += 0.25;
  score += 0.35 * clip(obvSlope / 0.25, 0, 1);
  score += 0.25 * clip((cmfMean + 0.05) / 0.2, 0, 1);
  score += 0.15 * (cmfRising ? 1 : 0);
  return { price_slope: priceSlope, obv_slope: obvSlope, cmf_mean: cmfMean, cmf_rising: cmfRising, divergence, score: clip(score, 0, 1) };
}

/** np.searchsorted(edges, v, side='right') */
function searchRight(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo;
}
/** np.searchsorted(arr, v, side='left') */
function searchLeft(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
}

export function volumeProfile(df, endIdx, cfg) {
  const start = Math.max(0, endIdx + 1 - cfg.profile_days);
  if (endIdx + 1 - start < 30) return null;
  const loAll = nanmin(df.low, start, endIdx + 1), hiAll = nanmax(df.high, start, endIdx + 1);
  if (!(hiAll > loAll)) return null;
  const bins = cfg.profile_bins;
  const edges = linspace(loAll, hiAll, bins + 1);
  const centers = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
  const hist = new Array(bins).fill(0);
  for (let k = start; k <= endIdx; k++) {
    const i0 = clip(searchRight(edges, df.low[k]) - 1, 0, bins - 1);
    const i1 = clip(searchRight(edges, df.high[k]) - 1, 0, bins - 1);
    for (let i = i0; i <= i1; i++) hist[i] += df.volume[k] / (i1 - i0 + 1);
  }
  const pocI = argmax(hist);
  const poc = centers[pocI];
  const order = hist.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).map((x) => x[1]);
  const total = hist.reduce((a, b) => a + b, 0);
  const cum = [];
  let acc = 0;
  for (const i of order) { acc += hist[i]; cum.push(acc / total); }
  const va = order.slice(0, searchLeft(cum, 0.70) + 1);
  const val = edges[Math.min(...va)], vah = edges[Math.max(...va) + 1];

  const { close, open, volume, vol_avg_poc: volAvg } = df;
  let crossAge = null, crossMult = 0;
  for (let j = endIdx; j >= Math.max(0, endIdx - cfg.poc_cross_max_age); j--) {
    const prevClose = j > 0 ? close[j - 1] : close[close.length - 1];
    if (close[j] > poc && (open[j] < poc || prevClose < poc)) {
      crossAge = endIdx - j;
      crossMult = volAvg[j] > 0 ? volume[j] / volAvg[j] : 0;
      break;
    }
  }
  const price = close[endIdx];
  const med = median(hist);
  const peaks = [];
  for (let i = 1; i < bins - 1; i++) {
    if (centers[i] > price * 1.02 && hist[i] >= hist[i - 1] && hist[i] >= hist[i + 1] && hist[i] > med) peaks.push(centers[i]);
  }
  return {
    poc, val, vah, above_poc: price > poc, poc_cross_age: crossAge, poc_cross_vol_mult: crossMult,
    strong_poc_cross: crossAge !== null && crossMult >= cfg.poc_volume_mult, resistances: peaks,
  };
}
