// İndikatörler. pandas'taki karşılıklarıyla aynı NaN/başlangıç davranışını üretir (bkz. indicators.py).

import { isNum, polyfit1 } from './math.js';

const nanArr = (n) => new Array(n).fill(NaN);

/** pandas rolling(n, min_periods=minP) üzerinde bir fonksiyon. NaN'lar sayılmaz. */
function rolling(s, n, minP, fn) {
  const out = nanArr(s.length);
  for (let i = 0; i < s.length; i++) {
    const from = Math.max(0, i - n + 1);
    const win = [];
    for (let j = from; j <= i; j++) if (isNum(s[j])) win.push(s[j]);
    if (win.length >= minP) out[i] = fn(win, from, i);
  }
  return out;
}

export function sma(s, n) {
  // min_periods = n: pencerede NaN varsa sonuç NaN
  const out = nanArr(s.length);
  let acc = 0, valid = 0;
  for (let i = 0; i < s.length; i++) {
    if (isNum(s[i])) { acc += s[i]; valid++; }
    if (i >= n) { if (isNum(s[i - n])) { acc -= s[i - n]; valid--; } }
    if (i >= n - 1 && valid === n) out[i] = acc / n;
  }
  return out;
}

/** ewm(alpha, adjust=False, min_periods): baştaki NaN'ları atlar. */
export function ewm(s, alpha, minPeriods) {
  const out = nanArr(s.length);
  let y = NaN, count = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (isNum(x)) {
      y = isNum(y) ? alpha * x + (1 - alpha) * y : x;
      count++;
    }
    if (count >= minPeriods && isNum(y)) out[i] = y;
  }
  return out;
}

export const ema = (s, n) => ewm(s, 2 / (n + 1), n);
const wilder = (s, n) => ewm(s, 1 / n, n);

export function rsi(close, n = 14) {
  const len = close.length;
  const gainIn = nanArr(len), lossIn = nanArr(len);
  for (let i = 1; i < len; i++) {
    const d = close[i] - close[i - 1];
    gainIn[i] = Math.max(d, 0);
    lossIn[i] = Math.max(-d, 0);
  }
  const gain = wilder(gainIn, n), loss = wilder(lossIn, n);
  const out = nanArr(len);
  for (let i = 0; i < len; i++) {
    if (!isNum(gain[i])) continue;
    out[i] = loss[i] === 0 ? 100 : 100 - 100 / (1 + gain[i] / loss[i]);
  }
  return out;
}

export function macd(close, fast = 12, slow = 26, signal = 9) {
  const ef = ema(close, fast), es = ema(close, slow);
  const line = close.map((_, i) => ef[i] - es[i]);
  const sig = ewm(line, 2 / (signal + 1), signal);
  return { macd: line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

export function bollingerBandwidth(close, n = 20, k = 2) {
  const mid = sma(close, n);
  const out = nanArr(close.length);
  for (let i = n - 1; i < close.length; i++) {
    if (!isNum(mid[i])) continue;
    let ss = 0;
    for (let j = i - n + 1; j <= i; j++) ss += (close[j] - mid[i]) ** 2;
    const std = Math.sqrt(ss / n);
    out[i] = (2 * k * std) / mid[i];
  }
  return out;
}

export function atr(df, n = 14) {
  const { high: h, low: l, close: c } = df;
  const tr = h.map((_, i) => (i === 0 ? h[i] - l[i]
    : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
  return wilder(tr, n);
}

export function obv(df) {
  const out = new Array(df.close.length);
  let acc = 0;
  for (let i = 0; i < df.close.length; i++) {
    if (i > 0) acc += Math.sign(df.close[i] - df.close[i - 1]) * df.volume[i];
    out[i] = acc;
  }
  return out;
}

export function cmf(df, n = 20) {
  const len = df.close.length;
  const mfv = new Array(len);
  for (let i = 0; i < len; i++) {
    const rng = df.high[i] - df.low[i];
    const mfm = rng === 0 ? 0 : ((df.close[i] - df.low[i]) - (df.high[i] - df.close[i])) / rng;
    mfv[i] = mfm * df.volume[i];
  }
  const a = sma(mfv, n), b = sma(df.volume, n);
  return a.map((v, i) => v / b[i]);
}

export function rollingVwap(df, n = 20) {
  const tp = df.close.map((c, i) => ((df.high[i] + df.low[i] + c) / 3) * df.volume[i]);
  const a = sma(tp, n), b = sma(df.volume, n);
  return a.map((v, i) => v / b[i]);
}

export function percentileRank(s, lookback) {
  const minP = Math.max(30, Math.floor(lookback / 4));
  return rolling(s, lookback, minP, (_win, from, i) => {
    const last = s[i];
    const valid = [];
    for (let j = from; j <= i; j++) if (isNum(s[j])) valid.push(s[j]);
    if (!isNum(last) || valid.length < 2) return NaN;
    let below = 0;
    for (const v of valid) if (v < last) below++;
    return below / (valid.length - 1);
  });
}

export function normalizedSlope(values) {
  const y = values.filter(isNum);
  if (y.length < 3) return NaN;
  const x = y.map((_, i) => i);
  const [slope] = polyfit1(x, y);
  const denom = y.reduce((a, b) => a + Math.abs(b), 0) / y.length;
  return denom > 0 ? slope / denom : 0;
}

const shiftedSma = (s, n) => {
  const shifted = [NaN, ...s.slice(0, -1)];
  return sma(shifted, n);
};

/** Tarayıcının ihtiyaç duyduğu tüm sütunları ekler (yeni nesne döndürür). */
export function addIndicators(df, cfg) {
  const st = cfg.setup, sm = cfg.smart_money;
  const c = df.close;
  const out = { ...df };
  out.sma200 = sma(c, st.ma_period);
  out.ema200 = ema(c, st.ma_period);
  out.rsi = rsi(c, st.rsi_period);
  Object.assign(out, macd(c));
  out.bbw = bollingerBandwidth(c, st.bb_period, st.bb_std);
  out.bbw_rank = percentileRank(out.bbw, st.bbw_percentile_lookback);
  out.atr = atr(df, cfg.risk.atr_period);
  out.obv = obv(df);
  out.cmf = cmf(df, sm.cmf_period);
  out.vwap = rollingVwap(df, st.vwap_period);
  out.vol_avg = shiftedSma(df.volume, st.volume_avg_period);
  out.vol_avg_poc = shiftedSma(df.volume, sm.poc_volume_avg_period);
  out.vol_mult = df.volume.map((v, i) => v / out.vol_avg[i]);
  return out;
}

export const length = (df) => df.close.length;

/** İlk n satırı alır (df.iloc[:n]). */
export function head(df, n) {
  const out = {};
  for (const [k, v] of Object.entries(df)) out[k] = Array.isArray(v) ? v.slice(0, n) : v;
  return out;
}

/** Son n satırı alır (df.tail(n)). */
export function tail(df, n) {
  const len = length(df);
  const from = Math.max(0, len - n);
  const out = {};
  for (const [k, v] of Object.entries(df)) out[k] = Array.isArray(v) ? v.slice(from) : v;
  return out;
}
