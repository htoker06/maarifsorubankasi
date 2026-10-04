// Tarama orkestratörü (scanner.py karşılığı) + mobil veri tasarrufu için "aşama 0".
//
//  Aşama 0: tüm likit coinler için son 30 günlük mum -> hacim artışı olmayanlar elenir
//  Aşama 1: kalanlar için 1000 günlük geçmiş -> çekirdek şartlar (formasyon, MA200, hacim, mum)
//  Aşama 2: kalanlar için emir defteri (3 görüntü), son işlemler, vadeli -> tam analiz

import { SignalAnalyzer } from './engine/analyzer.js';
import { buildProxyIndices, evaluateRegime, STABLES } from './engine/macro.js';
import { BinanceData, CoinGecko, volumeSpikeCandidate } from './data.js';

export const PREFILTER_GATES = new Set([
  'Likidite (24s hacim)', 'Yeterli Geçmiş', 'Formasyon Kırılımı', 'MA200 Kırılımı (1-5 gün)',
  'Hacim Anomalisi', 'Mum Anatomisi (gövde ≥%75)',
]);

const series = (df) => ({ times: df.time, close: df.close });

export async function macroState(cfg, data, cg) {
  const q = cfg.exchange.quote;
  const mc = cfg.macro;
  const [btc, snapshot, capsRaw, tickers] = await Promise.all([
    data.klines(`BTC${q}`, 400), cg.global(), cg.marketCaps(100), data.universe(0),
  ]);
  let indices = null;
  try {
    const listed = new Set(tickers.map((t) => t.base));
    let caps = capsRaw, stableCaps = {};
    if (!Object.keys(caps).length) { // CoinGecko yoksa hacim ağırlığı
      caps = Object.fromEntries(tickers.slice(0, mc.index_components).map((t) => [t.base, t.qv]));
    } else {
      stableCaps = Object.fromEntries(Object.entries(caps).filter(([k]) => STABLES.has(k)));
    }
    const comps = Object.keys(caps).filter((b) => !STABLES.has(b) && listed.has(b)).slice(0, mc.index_components);
    if (!comps.includes('BTC')) comps.unshift('BTC');
    const frames = await Promise.allSettled(comps.map((b) => (b === 'BTC' ? btc : data.klines(b + q, 400))));
    const closes = {};
    comps.forEach((b, i) => {
      const r = frames[i];
      if (r.status === 'fulfilled' && r.value.close.length >= mc.ema_slow + 10) closes[b] = series(r.value);
    });
    const usedCaps = Object.fromEntries(Object.keys(closes).filter((b) => b in caps).map((b) => [b, caps[b]]));
    indices = buildProxyIndices(closes, usedCaps, stableCaps);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.warn('Makro endeks kurulamadı', e);
  }
  return evaluateRegime(btc.close, indices, mc, snapshot);
}

/**
 * onProgress({stage, done, total, text})
 * Dönen: { macro, signals, candidates, scanned, errors, finishedAt }
 */
export async function runScan(cfg, { signal, onProgress = () => {}, ignoreLock = false, fetchImpl } = {}) {
  const data = new BinanceData(cfg, { signal, fetchImpl });
  const cg = new CoinGecko({ signal, fetchImpl });
  const analyzer = new SignalAnalyzer(cfg);
  const st = cfg.setup;
  const result = { macro: null, signals: [], candidates: [], scanned: 0, errors: 0, stageCounts: {} };

  onProgress({ stage: 'makro', done: 0, total: 1, text: 'Piyasa rejimi hesaplanıyor…' });
  const macro = await macroState(cfg, data, cg);
  result.macro = macro;
  if (macro.locked && !ignoreLock) {
    result.finishedAt = Date.now();
    return result;
  }

  const universe = await data.universe(cfg.liquidity.min_quote_volume_24h);
  result.scanned = universe.length;

  // Aşama 0
  let done = 0;
  const stage0 = await Promise.all(universe.map(async (u) => {
    try {
      const short = await data.klines(u.id, 30);
      return volumeSpikeCandidate(short, st.volume_avg_period, st.volume_spike_mult) ? u : null;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.errors++;
      return null;
    } finally {
      onProgress({ stage: 'hacim', done: ++done, total: universe.length, text: `Hacim taraması: ${done}/${universe.length}` });
    }
  }));
  const s0 = stage0.filter(Boolean);

  // Aşama 1
  done = 0;
  const s1 = (await Promise.all(s0.map(async (u) => {
    try {
      const daily = await data.klines(u.id, cfg.exchange.history_days);
      const sig = analyzer.analyze({ symbol: u.symbol, exchange: 'binance', daily, quote_volume_24h: u.qv, last_price: u.last }, macro);
      return sig.gates.every((g) => !PREFILTER_GATES.has(g.name) || g.passed) ? { u, daily } : null;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.errors++;
      return null;
    } finally {
      onProgress({ stage: 'formasyon', done: ++done, total: s0.length, text: `Formasyon analizi: ${done}/${s0.length}` });
    }
  }))).filter(Boolean);

  // Aşama 2
  done = 0;
  const mc = cfg.manipulation;
  const full = (await Promise.all(s1.map(async ({ u, daily }) => {
    try {
      const [books, trades, deriv] = await Promise.all([
        data.orderBooks(u.id, mc.book_snapshots, mc.book_snapshot_interval_s), data.trades(u.id), data.derivatives(u.base),
      ]);
      return analyzer.analyze({ symbol: u.symbol, exchange: 'binance', daily, quote_volume_24h: u.qv, last_price: u.last,
        order_books: books, trades }, macro, deriv);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      result.errors++;
      return null;
    } finally {
      onProgress({ stage: 'kalkan', done: ++done, total: s1.length, text: `Manipülasyon kontrolü: ${done}/${s1.length}` });
    }
  }))).filter(Boolean);

  full.sort((a, b) => b.score - a.score);
  result.stageCounts = { evren: universe.length, hacim: s0.length, formasyon: s1.length };
  result.candidates = full;
  result.signals = full.filter((s) => s.passed);
  result.finishedAt = Date.now();
  return result;
}

/** Tek bir coinin tüm şartlarını gösterir (sonuç ne olursa olsun). */
export async function analyzeOne(cfg, input, { signal, macro, fetchImpl } = {}) {
  const q = cfg.exchange.quote;
  let base = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (base.endsWith(q) && base.length > q.length) base = base.slice(0, -q.length);
  const id = base + q;
  const data = new BinanceData(cfg, { signal, fetchImpl });
  const cg = new CoinGecko({ signal, fetchImpl });
  const mc = cfg.manipulation;
  const [m, daily, tick, books, trades, deriv] = await Promise.all([
    macro ? Promise.resolve(macro) : macroState(cfg, data, cg),
    data.klines(id, cfg.exchange.history_days), data.ticker(id),
    data.orderBooks(id, mc.book_snapshots, mc.book_snapshot_interval_s), data.trades(id), data.derivatives(base),
  ]);
  const sig = new SignalAnalyzer(cfg).analyze({ symbol: `${base}/${q}`, exchange: 'binance', daily,
    quote_volume_24h: tick.qv, last_price: tick.last, order_books: books, trades }, m, deriv);
  return { macro: m, signal: sig };
}
