// numpy/pandas davranışını taklit eden küçük yardımcılar. NaN kuralları pandas ile aynıdır.

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const clip01 = (x) => (isNum(x) ? clip(x, 0, 1) : 0);

/** NaN'ları atlayan min/max (pandas .min()/.max()); hiç değer yoksa NaN. */
export function nanmin(arr, from = 0, to = arr.length) {
  let m = Infinity;
  for (let i = Math.max(0, from); i < Math.min(arr.length, to); i++) if (arr[i] < m) m = arr[i];
  return m === Infinity ? NaN : m;
}
export function nanmax(arr, from = 0, to = arr.length) {
  let m = -Infinity;
  for (let i = Math.max(0, from); i < Math.min(arr.length, to); i++) if (arr[i] > m) m = arr[i];
  return m === -Infinity ? NaN : m;
}
export function nanmean(arr, from = 0, to = arr.length) {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i < Math.min(arr.length, to); i++) if (isNum(arr[i])) { s += arr[i]; n++; }
  return n ? s / n : NaN;
}
export function nanmedian(arr, from = 0, to = arr.length) {
  const v = [];
  for (let i = Math.max(0, from); i < Math.min(arr.length, to); i++) if (isNum(arr[i])) v.push(arr[i]);
  return median(v);
}
export function median(v) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** İlk en büyük elemanın indeksi (np.argmax). */
export function argmax(arr, from = 0, to = arr.length) {
  let best = from;
  for (let i = from + 1; i < to; i++) if (arr[i] > arr[best]) best = i;
  return best;
}
export function argmin(arr, from = 0, to = arr.length) {
  let best = from;
  for (let i = from + 1; i < to; i++) if (arr[i] < arr[best]) best = i;
  return best;
}
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));

/** En küçük kareler doğrusu: [eğim, kesişim] (np.polyfit(x, y, 1)). */
export function polyfit1(x, y) {
  const n = x.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return [slope, my - slope * mx];
}

/** İkinci derece en küçük kareler: [a, b, c] (np.polyfit(x, y, 2)). */
export function polyfit2(x, y) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], x2 = xi * xi;
    s0 += 1; s1 += xi; s2 += x2; s3 += x2 * xi; s4 += x2 * x2;
    t0 += y[i]; t1 += xi * y[i]; t2 += x2 * y[i];
  }
  // [s4 s3 s2][a]   [t2]
  // [s3 s2 s1][b] = [t1]
  // [s2 s1 s0][c]   [t0]
  const M = [[s4, s3, s2, t2], [s3, s2, s1, t1], [s2, s1, s0, t0]];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** Pearson korelasyonu (np.corrcoef(a, b)[0, 1]). */
export function corr(a, b) {
  const n = a.length;
  const ma = sum(a) / n, mb = sum(b) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** max(iterable, key) gibi: anahtar dizilerini sözlük sırasıyla karşılaştırır, eşitlikte ilkini döndürür. */
export function maxBy(items, keyFn) {
  let best = null, bestKey = null;
  for (const it of items) {
    const k = keyFn(it);
    if (best === null || lexGreater(k, bestKey)) { best = it; bestKey = k; }
  }
  return best;
}
export function lexGreater(a, b) {
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
