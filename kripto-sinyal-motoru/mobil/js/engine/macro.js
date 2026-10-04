// Piyasa rejimi ve sistem kilidi (macro.py karşılığı).
// BTC.D / USDT.D / TOTAL3, en büyük coinlerin günlük kapanışlarıyla vekil endeks olarak kurulur.

import { isNum } from './math.js';
import { ema, sma } from './indicators.js';

export const STABLES = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD']);

/**
 * closes: { BASE: { times: number[], close: number[] } }
 * Dönen: { times, total, total3, btc_d, usdt_d }
 */
export function buildProxyIndices(closes, caps, stableCaps) {
  const names = Object.keys(closes);
  if (!names.includes('BTC')) throw new Error('Endeks için BTC gerekli');
  const times = [...new Set(names.flatMap((b) => closes[b].times))].sort((a, b) => a - b);
  // ffill + dropna(how='any')
  const cols = {};
  for (const b of names) {
    const map = new Map(closes[b].times.map((t, i) => [t, closes[b].close[i]]));
    let last = NaN;
    cols[b] = times.map((t) => { if (map.has(t)) last = map.get(t); return last; });
  }
  const keep = times.map((_, i) => names.every((b) => isNum(cols[b][i])));
  const T = times.filter((_, i) => keep[i]);
  for (const b of names) cols[b] = cols[b].filter((_, i) => keep[i]);
  if (!T.length) throw new Error('Ortak geçmiş yok');
  const lastIdx = T.length - 1;
  const used = names.filter((b) => (caps[b] || 0) > 0);
  const implied = {};
  for (const b of used) implied[b] = cols[b].map((v) => (caps[b] * v) / cols[b][lastIdx]);
  const stableTotal = Object.values(stableCaps).reduce((a, v) => a + v, 0);
  const total = T.map((_, i) => used.reduce((a, b) => a + implied[b][i], 0) + stableTotal);
  const alts = used.filter((b) => b !== 'BTC' && b !== 'ETH');
  const total3 = T.map((_, i) => (alts.length ? alts.reduce((a, b) => a + implied[b][i], 0) : NaN));
  const btcD = T.map((_, i) => implied.BTC[i] / total[i]);
  const usdtCap = stableCaps.USDT ?? stableTotal;
  const usdtD = T.map((_, i) => (stableTotal > 0 ? usdtCap / total[i] : NaN));
  return { times: T, total, total3, btc_d: btcD, usdt_d: usdtD };
}

function slopeDir(series, cfg) {
  const s = series.filter((v) => isNum(v) && v !== 0);
  if (s.length < cfg.ema_slow + cfg.slope_lookback) return { slope: NaN, fastAbove: false };
  const f = ema(s, cfg.ema_fast), sl = ema(s, cfg.ema_slow);
  const n = s.length - 1;
  return { slope: f[n] / f[n - cfg.slope_lookback] - 1, fastAbove: f[n] > sl[n] };
}

export function evaluateRegime(btcClose, indices, cfg, globalSnapshot) {
  const notes = [];
  const sf = sma(btcClose, cfg.btc_ma_fast), ss = sma(btcClose, cfg.btc_ma_slow);
  const n = btcClose.length - 1;
  const c = btcClose[n], f = sf[n], s = ss[n];
  let score = 0;
  const aboveSlow = c > s;
  if (aboveSlow) score += 25; else notes.push('BTC 200 günlük ortalamanın altında');
  if (c > f) score += 15; else notes.push('BTC 50 günlük ortalamanın altında');
  if (f > s) score += 10;

  let btcD = NaN, usdtD = NaN, t3 = NaN, usdtRising = false;
  if (indices && indices.times.length) {
    const u = slopeDir(indices.usdt_d, cfg);
    usdtD = u.slope;
    if (u.slope < 0 && !u.fastAbove) score += 20;
    usdtRising = u.slope > 0 && u.fastAbove;
    if (usdtRising) notes.push('USDT.D yükselişte (paradan kaçış / risk-off)');
    const t = slopeDir(indices.total3, cfg);
    t3 = t.slope;
    if (t.slope > 0 && t.fastAbove) score += 20;
    else if (t.slope < 0 && !t.fastAbove) notes.push('TOTAL3 düşüş trendinde');
    btcD = slopeDir(indices.btc_d, cfg).slope;
    if (btcD < 0) score += 10; else if (c > f) score += 5;
  } else {
    notes.push('Endeks verisi yok: makro skor yalnızca BTC trendinden');
    score = (score / 50) * 100;
  }

  let ch24 = NaN, btcDomNow = null, usdtDomNow = null;
  if (globalSnapshot) {
    ch24 = Number(globalSnapshot.market_cap_change_percentage_24h_usd ?? NaN) / 100;
    const pct = globalSnapshot.market_cap_percentage || {};
    btcDomNow = pct.btc ?? null;
    usdtDomNow = pct.usdt ?? null;
  } else if (indices && indices.times.length > 1) {
    const m = indices.total3.length;
    if (indices.total3[m - 2] > 0) ch24 = indices.total3[m - 1] / indices.total3[m - 2] - 1;
  }

  let locked = false;
  if (score < cfg.risk_off_threshold) {
    locked = true;
    notes.push(`Makro skor ${score.toFixed(0)} < ${cfg.risk_off_threshold}: SİSTEM KİLİTLİ`);
  }
  if (!aboveSlow && usdtRising) {
    locked = true;
    notes.push('BTC < SMA200 ve USDT.D yükselişte: SİSTEM KİLİTLİ (Hard Stop)');
  }
  if (isNum(ch24) && ch24 <= -0.08) {
    locked = true;
    notes.push(`Piyasa 24 saatte %${(ch24 * 100).toFixed(1)} düştü: SİSTEM KİLİTLİ`);
  }
  const regime = locked ? 'RİSKLİ' : score >= cfg.risk_on_threshold ? 'GÜVENLİ' : 'NÖTR';
  return {
    regime, score, locked, btc_close: c, btc_sma_fast: f, btc_sma_slow: s,
    btc_dom_slope: btcD, usdt_dom_slope: usdtD, total3_slope: t3, total3_change_24h: ch24,
    btc_dom_now: btcDomNow, usdt_dom_now: usdtDomNow, notes,
  };
}

export const neutralMacro = () => ({ regime: 'NÖTR', score: 50, locked: false, notes: ['Makro veri kullanılmadı'] });
