const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "2026-11-12" ya da Date → "12.11.2026" */
export function formatDate(value) {
  if (!value) return '—';
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function uid(prefix = 'id') {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function truncate(text, max = 120) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Türkçe büyük/küçük harf ve aksan duyarsız arama için normalleştirme. */
export function normalizeTr(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Tohum değerine göre her seferinde aynı sonucu veren karıştırma (eşleştirme sütunları, A/B kitapçık). */
export function seededShuffle(items, seedText) {
  let seed = 0;
  for (const ch of String(seedText)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
