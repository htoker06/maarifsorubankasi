// Anti-Manipülasyon ve Tuzak Kalkanı (manipulation.py karşılığı).

import { clip, corr, isNum, median, nanmean, nanmedian, nanmin } from './math.js';

export function candleAnatomy(df, i) {
  const o = df.open[i], h = df.high[i], l = df.low[i], c = df.close[i];
  const rng = h - l;
  if (rng <= 0) return { body: 0, upper: 0, pos: 0.5 };
  return { body: Math.abs(c - o) / rng, upper: (h - Math.max(c, o)) / rng, pos: (c - l) / rng };
}

export function candleOk(df, i, cfg) {
  const { body, upper, pos } = candleAnatomy(df, i);
  const notes = [];
  if (df.close[i] <= df.open[i]) notes.push('Kırılım mumu kırmızı');
  if (body < cfg.min_body_ratio) notes.push(`Gövde oranı %${Math.round(body * 100)} < %${Math.round(cfg.min_body_ratio * 100)}`);
  if (upper > cfg.max_upper_wick_ratio) notes.push(`Üst fitil %${Math.round(upper * 100)} (satış baskısı / stop avı)`);
  if (pos < cfg.close_position_min) notes.push('Kapanış mumun tepesinden uzak');
  return { ok: notes.length === 0, notes };
}

export function liquiditySweep(df, breakoutIdx, cfg) {
  const { low: lo, high: hi, close: cl, open: op } = df;
  const start = Math.max(31, breakoutIdx - cfg.sweep_lookback);
  for (let k = start; k < breakoutIdx; k++) {
    const support = nanmin(lo, k - 30, k);
    const rng = hi[k] - lo[k];
    if (rng <= 0) continue;
    const lowerWick = (Math.min(op[k], cl[k]) - lo[k]) / rng;
    if (lo[k] < support && cl[k] > support && lowerWick >= cfg.sweep_min_lower_wick) {
      let after = Infinity;
      for (let j = k + 1; j <= breakoutIdx; j++) after = Math.min(after, lo[j]);
      if (after > lo[k]) return true;
    }
  }
  return false;
}

export function klineWashRisk(df, idx, cfg) {
  const tr = df.trades, qv = df.quote_volume;
  if (!tr) return { risk: null, notes: ['İşlem sayısı verisi yok'] };
  for (let i = Math.max(0, idx - 30); i <= idx; i++) if (!isNum(tr[i])) return { risk: null, notes: ['İşlem sayısı verisi yok'] };
  const h0 = Math.max(0, idx - 30);
  if (nanmin(tr, h0, idx) <= 0) return { risk: null, notes: ['İşlem sayısı verisi bozuk'] };
  const avgSize = qv.map((v, i) => (tr[i] > 0 ? v / tr[i] : NaN));
  const sizeSpike = avgSize[idx] / nanmedian(avgSize, h0, idx);
  const volGrowth = qv[idx] / nanmean(qv, h0, idx);
  const tradeGrowth = tr[idx] / nanmean(tr, h0, idx);
  const notes = [];
  let risk = 0;
  if (sizeSpike > cfg.trade_size_spike_max) {
    risk += 0.5;
    notes.push(`Ortalama işlem büyüklüğü ${sizeSpike.toFixed(1)}x (hacim birkaç dev işlemde)`);
  }
  if (volGrowth >= 2 && tradeGrowth < cfg.min_trades_growth) {
    risk += 0.4;
    notes.push(`Hacim ${volGrowth.toFixed(1)}x, işlem sayısı sadece ${tradeGrowth.toFixed(1)}x`);
  }
  const w0 = Math.max(0, idx - 60);
  const r = idx >= 20 ? corr(qv.slice(w0, idx + 1), tr.slice(w0, idx + 1)) : 1;
  if (isNum(r) && r < 0.5) {
    risk += 0.2;
    notes.push(`Hacim-işlem sayısı korelasyonu zayıf (${r.toFixed(2)})`);
  }
  return { risk: Math.min(1, risk), notes };
}

export function tradeTapeStats(trades) {
  if (!trades || !trades.length) return null;
  const notional = trades.map((t) => Number(t.cost || t.price * t.amount));
  const total = notional.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const hhi = notional.reduce((a, v) => a + (v / total) ** 2, 0);
  const k = Math.max(1, Math.ceil(trades.length * 0.01));
  const top = [...notional].sort((a, b) => a - b).slice(-k).reduce((a, b) => a + b, 0) / total;
  const amounts = trades.map((t) => Math.round(Number(t.amount) * 1e8) / 1e8);
  const counts = new Map();
  for (const a of amounts) counts.set(a, (counts.get(a) || 0) + 1);
  const topCount = Math.max(...counts.values());
  let pairs = 0;
  for (let i = 1; i < trades.length; i++) {
    const a = trades[i - 1].side, b = trades[i].side;
    if (amounts[i] === amounts[i - 1] && a && b && a !== b) pairs++;
  }
  const buys = trades.filter((t) => t.side === 'buy').length;
  return {
    n_trades: trades.length, hhi, top1pct_share: top, repeat_size_share: topCount / trades.length,
    buy_ratio: buys / trades.length, ping_pong_share: pairs / Math.max(1, trades.length - 1),
  };
}

export function tapeWashRisk(s, cfg) {
  let risk = 0;
  const notes = [];
  if (s.hhi > cfg.max_trade_hhi) { risk += 0.35; notes.push(`İşlem yoğunlaşması yüksek (HHI ${s.hhi.toFixed(3)})`); }
  if (s.top1pct_share > cfg.max_top1pct_share) { risk += 0.35; notes.push(`En büyük %1 işlem hacmin %${Math.round(s.top1pct_share * 100)}'i`); }
  if (s.repeat_size_share > cfg.max_repeat_size_share) {
    risk += 0.5; notes.push(`Tek bir işlem miktarı tekrar ediyor: işlemlerin %${Math.round(s.repeat_size_share * 100)}'i (bot)`);
  }
  if (s.ping_pong_share > cfg.max_ping_pong_share) {
    risk += 0.5; notes.push(`Aynı miktarla art arda al-sat (ping-pong) %${Math.round(s.ping_pong_share * 100)}`);
  }
  return { risk: Math.min(1, risk), notes };
}

export function spotLed(df, idx, cfg) {
  const buy = df.taker_buy_quote, qv = df.quote_volume;
  if (!buy || !isNum(buy[idx])) return { led: null, notes: ['Taker alış verisi yok'] };
  const from = Math.max(0, idx - 30);
  const cvd = [];
  let acc = 0;
  for (let i = from; i <= idx; i++) { acc += 2 * buy[i] - qv[i]; cvd.push(acc); }
  const ratio = qv[idx] > 0 ? buy[idx] / qv[idx] : 0;
  let rising;
  if (cvd.length > 10) {
    let prevMax = -Infinity;
    for (let i = 0; i < cvd.length - 10; i++) prevMax = Math.max(prevMax, cvd[i]);
    rising = cvd[cvd.length - 1] > prevMax;
  } else rising = 2 * buy[idx] - qv[idx] > 0;
  const notes = [];
  if (ratio < cfg.min_taker_buy_ratio) notes.push(`Kırılım mumunda taker alış oranı %${Math.round(ratio * 100)}`);
  if (!rising) notes.push('Spot CVD yükselişi desteklemiyor');
  return { led: notes.length === 0, notes };
}

export function derivativesCheck(stats, cfg) {
  if (!stats || stats.funding_rate === null || stats.funding_rate === undefined) {
    return { trap: null, notes: ['Vadeli verisi yok (spot-only varlık)'] };
  }
  const notes = [];
  let trap = false;
  if (stats.funding_rate > cfg.max_funding_rate) {
    trap = true;
    notes.push(`Fonlama %${(stats.funding_rate * 100).toFixed(3)} > %${(cfg.max_funding_rate * 100).toFixed(2)}`);
  }
  if (stats.oi_change !== null && stats.oi_change !== undefined && stats.oi_change > cfg.max_oi_growth_with_hot_funding
      && stats.funding_rate > cfg.max_funding_rate / 2) {
    trap = true;
    notes.push(`OI %${Math.round(stats.oi_change * 100)} arttı ve fonlama ısınıyor (kaldıraçlı coşku)`);
  }
  return { trap, notes };
}

const depth = (levels, lo, hi) => levels.reduce((a, [p, q]) => (p >= lo && p <= hi ? a + p * q : a), 0);

function buySlippage(asks, usd) {
  if (!asks.length) return Infinity;
  const best = asks[0][0];
  let remaining = usd, cost = 0, qty = 0;
  for (const [p, a] of asks) {
    const take = Math.min(remaining, p * a);
    cost += take; qty += take / p; remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return Infinity;
  return cost / qty / best - 1;
}

function findWall(side, lo, hi, mult, margin = 0.03) {
  const levels = side.filter(([p]) => p >= lo * (1 - margin) && p <= hi * (1 + margin)).map(([p, a]) => [p, p * a]);
  if (levels.length < 5) return null;
  const med = median(levels.map((x) => x[1]));
  const zone = levels.filter(([p]) => p >= lo && p <= hi);
  if (!zone.length || med <= 0) return null;
  let best = zone[0];
  for (const z of zone) if (z[1] > best[1]) best = z;
  return best[1] >= mult * med ? best : null;
}

const notionalNear = (levels, price, tol = 0.001) =>
  levels.reduce((a, [p, q]) => (Math.abs(p / price - 1) <= tol ? a + p * q : a), 0);

export function orderBookStats(books, liq, cfg) {
  books = (books || []).filter((b) => b && b.bids && b.bids.length && b.asks && b.asks.length);
  if (!books.length) return null;
  const first = books[0], last = books[books.length - 1];
  const bid = last.bids[0][0], ask = last.asks[0][0];
  const mid = (bid + ask) / 2;
  const lo = mid * (1 - liq.depth_pct), hi = mid * (1 + liq.depth_pct);
  const stats = {
    mid, spread_pct: (ask - bid) / mid,
    bid_depth_usd: depth(last.bids, lo, mid), ask_depth_usd: depth(last.asks, mid, hi),
    buy_slippage_pct: buySlippage(last.asks, liq.slippage_probe_usd),
    wall_price: null, wall_usd: null, wall_persistence: null, spoof_detected: false, notes: [],
  };
  stats.depth_ratio = stats.ask_depth_usd > 0 ? stats.bid_depth_usd / stats.ask_depth_usd : Infinity;
  const wall = findWall(first.asks, mid, hi, cfg.wall_mult);
  if (wall) {
    [stats.wall_price, stats.wall_usd] = wall;
    const later = books.slice(1).map((b) => notionalNear(b.asks, wall[0]));
    stats.wall_persistence = later.length ? Math.min(...later) / wall[1] : 1;
    if (later.length && stats.wall_persistence < cfg.wall_vanish_ratio) {
      stats.spoof_detected = true;
      stats.notes.push(`Satış duvarı ${wall[0].toPrecision(6)} seviyesinde belirip kayboldu (spoof)`);
    }
    if (stats.depth_ratio < cfg.min_bid_ask_depth_ratio) {
      stats.spoof_detected = true;
      stats.notes.push(`${Math.round(wall[1]).toLocaleString('tr-TR')} USD satış duvarı + boş alış tarafı (oran ${stats.depth_ratio.toFixed(2)})`);
    }
  }
  const bwall = findWall(first.bids, lo, mid, cfg.wall_mult);
  if (bwall && books.length > 1) {
    const remain = Math.min(...books.slice(1).map((b) => notionalNear(b.bids, bwall[0]))) / bwall[1];
    if (remain < cfg.wall_vanish_ratio) {
      stats.spoof_detected = true;
      stats.notes.push(`Alış duvarı ${bwall[0].toPrecision(6)} belirip kayboldu (yalancı destek)`);
    }
  }
  return stats;
}

export function buildReport(df, breakoutIdx, cfg, trades, deriv, book) {
  const { body, upper, pos } = candleAnatomy(df, breakoutIdx);
  const { ok, notes } = candleOk(df, breakoutIdx, cfg);
  const sweep = liquiditySweep(df, breakoutIdx, cfg);
  if (sweep) notes.push('Likidite süpürmesi (sweep) sonrası toparlanma: pozitif teyit');
  const parts = [];
  const k = klineWashRisk(df, breakoutIdx, cfg);
  notes.push(...k.notes);
  if (k.risk !== null) parts.push(k.risk);
  const tape = tradeTapeStats(trades || []);
  if (tape) {
    const t = tapeWashRisk(tape, cfg);
    parts.push(t.risk);
    notes.push(...t.notes);
  }
  const wash = parts.length ? Math.max(...parts) : (cfg.strict_missing_data ? 0.5 : 0.2);
  const s = spotLed(df, breakoutIdx, cfg);
  notes.push(...s.notes);
  const d = derivativesCheck(deriv, cfg);
  notes.push(...d.notes);
  const spoof = Boolean(book && book.spoof_detected);
  if (book) notes.push(...book.notes);
  const risk = 0.35 * wash + 0.20 * (ok ? 0 : 1) + 0.20 * (d.trap ? 1 : 0) + 0.15 * (spoof ? 1 : 0)
    + 0.10 * (s.led ? 0 : 1) - (sweep ? 0.10 : 0);
  return {
    body_ratio: body, upper_wick_ratio: upper, close_position: pos, candle_ok: ok, sweep_detected: sweep,
    wash_risk: wash, derivatives_trap: Boolean(d.trap), spot_led: Boolean(s.led), spoof_detected: spoof,
    trap_risk: clip(risk, 0, 1), notes, tape,
  };
}
