// Tarayıcıdan Binance ve CoinGecko'ya doğrudan bağlanan veri katmanı (exchange.py karşılığı).
// Sunucu yok: istekler telefonun kendi internet bağlantısından gider.

const SPOT_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const FUTURES = 'https://fapi.binance.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const DAY_MS = 86_400_000;
const LEVERAGED = /^(.+)(UP|DOWN|BULL|BEAR|[235]L|[235]S)$/;

export class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status}: ${url}`); this.status = status; }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('İptal', 'AbortError')); }, { once: true });
});

/** Eşzamanlı istek sınırlayıcı. */
export class Limiter {
  constructor(max) { this.max = max; this.active = 0; this.queue = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.active++;
        try { resolve(await fn()); } catch (e) { reject(e); } finally {
          this.active--;
          if (this.queue.length) this.queue.shift()();
        }
      };
      if (this.active < this.max) task(); else this.queue.push(task);
    });
  }
}

export async function getJSON(url, { retries = 3, signal, fetchImpl = fetch } = {}) {
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetchImpl(url, { signal });
      if (r.ok) return await r.json();
      const retryable = r.status === 429 || r.status === 418 || r.status >= 500;
      if (!retryable || attempt >= retries) throw new HttpError(r.status, url);
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof HttpError || attempt >= retries) throw e;
    }
    await sleep(delay, signal);
    delay *= 2;
  }
}

/** Binance ham kline -> sütunlu veri; açık (kapanmamış) günlük mum atılır. */
export function parseKlines(rows, now = Date.now()) {
  const df = { time: [], open: [], high: [], low: [], close: [], volume: [], quote_volume: [], trades: [], taker_buy_quote: [] };
  for (const k of rows) {
    if (Number(k[0]) + DAY_MS > now) continue;
    df.time.push(Number(k[0]));
    df.open.push(+k[1]); df.high.push(+k[2]); df.low.push(+k[3]); df.close.push(+k[4]);
    df.volume.push(+k[5]); df.quote_volume.push(+k[7]); df.trades.push(+k[8]); df.taker_buy_quote.push(+k[10]);
  }
  return df;
}

/**
 * Hacim gate'inin gerekli koşulu: son 4 kapanmış mumdan birinde hacim, önceki 20 günün
 * ortalamasının en az ``mult`` katı olmalı (kırılım en fazla 3 gün önce olabilir).
 * Bu koşulu sağlamayan coin için 1000 günlük geçmiş indirilmez (mobil veri tasarrufu).
 */
export function volumeSpikeCandidate(df, period, mult, lookbackBars = 4) {
  const v = df.volume, n = v.length;
  if (n < period + lookbackBars) return true; // emin olamıyorsak elemeyiz
  for (let i = n - lookbackBars; i < n; i++) {
    let s = 0;
    for (let j = i - period; j < i; j++) s += v[j];
    if (v[i] >= (mult * s) / period) return true;
  }
  return false;
}

export class BinanceData {
  constructor(cfg, { signal, fetchImpl } = {}) {
    this.cfg = cfg;
    this.signal = signal;
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.hostIdx = 0;
    this.limiter = new Limiter(cfg.exchange.max_concurrency);
    this.fundingMap = undefined;
  }

  async spot(path) {
    let lastErr;
    for (let i = this.hostIdx; i < SPOT_HOSTS.length; i++) {
      try {
        const res = await this.limiter.run(() => getJSON(SPOT_HOSTS[i] + path,
          { retries: this.cfg.exchange.max_retries, signal: this.signal, fetchImpl: this.fetchImpl }));
        this.hostIdx = i;
        return res;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        // Ağ hatası ya da bölge engeli (451/403): yedek adrese geç.
        if (e instanceof HttpError && ![403, 451].includes(e.status)) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async universe(minQv) {
    const q = this.cfg.exchange.quote;
    const excluded = new Set(this.cfg.exchange.excluded_bases);
    const rows = await this.spot('/api/v3/ticker/24hr');
    const now = Date.now();
    return rows
      .filter((t) => t.symbol.endsWith(q))
      .map((t) => ({ id: t.symbol, base: t.symbol.slice(0, -q.length), qv: +t.quoteVolume, last: +t.lastPrice, closeTime: +t.closeTime, count: +t.count }))
      .filter((t) => t.base && !excluded.has(t.base) && !LEVERAGED.test(t.base) && t.last > 0 && t.count > 0
        && now - t.closeTime < 26 * 3600_000 && t.qv >= minQv)
      .map((t) => ({ ...t, symbol: `${t.base}/${q}` }))
      .sort((a, b) => b.qv - a.qv);
  }

  async ticker(id) {
    const t = await this.spot(`/api/v3/ticker/24hr?symbol=${id}`);
    return { qv: +t.quoteVolume, last: +t.lastPrice };
  }

  async klines(id, limit = 1000) {
    return parseKlines(await this.spot(`/api/v3/klines?symbol=${id}&interval=1d&limit=${limit}`));
  }

  async orderBooks(id, snapshots, intervalS) {
    const books = [];
    for (let i = 0; i < snapshots; i++) {
      const b = await this.spot(`/api/v3/depth?symbol=${id}&limit=1000`);
      books.push({ bids: b.bids.map(([p, q]) => [+p, +q]), asks: b.asks.map(([p, q]) => [+p, +q]) });
      if (i < snapshots - 1) await sleep(intervalS * 1000, this.signal);
    }
    return books;
  }

  async trades(id) {
    const rows = await this.spot(`/api/v3/trades?symbol=${id}&limit=1000`);
    // isBuyerMaker = true -> agresif taraf satıcı
    return rows.map((t) => ({ price: +t.price, amount: +t.qty, cost: +t.quoteQty, side: t.isBuyerMaker ? 'sell' : 'buy' }));
  }

  async futures(path) {
    return this.limiter.run(() => getJSON(FUTURES + path, { retries: 1, signal: this.signal, fetchImpl: this.fetchImpl }));
  }

  /** Vadeli verisi: {funding_rate, oi_change}; vadeli piyasaya erişilemezse null. */
  async derivatives(base) {
    const id = base + this.cfg.exchange.quote;
    if (this.fundingMap === undefined) {
      try {
        const all = await this.futures('/fapi/v1/premiumIndex');
        this.fundingMap = new Map(all.map((r) => [r.symbol, +r.lastFundingRate]));
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        this.fundingMap = null;
      }
    }
    if (this.fundingMap === null) return null;
    if (!this.fundingMap.has(id)) return { funding_rate: null, oi_change: null };
    let oi = null;
    try {
      const hist = await this.futures(`/futures/data/openInterestHist?symbol=${id}&period=1d&limit=8`);
      const vals = hist.map((h) => +h.sumOpenInterestValue).filter((v) => v > 0);
      if (vals.length >= 2) oi = vals[vals.length - 1] / vals[0] - 1;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
    return { funding_rate: this.fundingMap.get(id), oi_change: oi };
  }
}

export class CoinGecko {
  constructor({ signal, fetchImpl } = {}) {
    this.signal = signal;
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
  }

  async global() {
    try {
      return (await getJSON(`${COINGECKO}/global`, { retries: 2, signal: this.signal, fetchImpl: this.fetchImpl })).data;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return null;
    }
  }

  async marketCaps(n = 100) {
    try {
      const rows = await getJSON(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1`,
        { retries: 2, signal: this.signal, fetchImpl: this.fetchImpl });
      const caps = {};
      for (const r of rows) {
        const s = String(r.symbol).toUpperCase();
        if (!(s in caps) && r.market_cap) caps[s] = +r.market_cap;
      }
      return caps;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return {};
    }
  }
}
