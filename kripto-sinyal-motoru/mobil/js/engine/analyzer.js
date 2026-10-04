// Sinyal çekirdeği: kesişim şartları + Kesinlik Skoru (analyzer.py'nin birebir karşılığı).

import { clip01, isNum, maxBy, nanmax, nanmin } from './math.js';
import { addIndicators } from './indicators.js';
import { buildReport, orderBookStats } from './manipulation.js';
import { PatternEngine } from './patterns.js';
import { buildPlan } from './risk.js';
import { hiddenAccumulation, volumeProfile } from './smartmoney.js';

const PATTERN_TIER = {
  TOBO: 3, 'Üçlü Dip': 3, 'İkili Dip': 3, 'Çanak Dip': 3, 'Düşen Kama': 3, Flama: 3,
  'Simetrik Üçgen': 2, 'Düşen Trend Kırılımı': 2, 'MSS (ChoCh)': 2,
};

export function maCrossAge(close, ma) {
  const n = close.length;
  if (!isNum(ma[n - 1]) || close[n - 1] <= ma[n - 1]) return null;
  let j = n - 1;
  while (j - 1 >= 0 && isNum(ma[j - 1]) && close[j - 1] > ma[j - 1]) j--;
  if (j === 0 || !isNum(ma[j - 1])) return null;
  return n - 1 - j;
}

export function baseDuration(df, endIdx, maxRange, maxDays) {
  let hi = -Infinity, lo = Infinity, days = 0;
  for (let k = endIdx; k > Math.max(-1, endIdx - maxDays); k--) {
    const nh = Math.max(hi, df.high[k]), nl = Math.min(lo, df.low[k]);
    if (nh / nl - 1 > maxRange) break;
    hi = nh; lo = nl; days++;
  }
  return { days, range: days ? hi / lo - 1 : NaN };
}

export function selectPrimary(patterns, maxAge) {
  const fresh = patterns.filter((p) => p.bullish && p.broken && p.breakout_age <= maxAge);
  if (!fresh.length) return null;
  return maxBy(fresh, (p) => [PATTERN_TIER[p.name] ?? 1, p.quality, -p.breakout_age]);
}

const pct = (x, d = 0) => `%${(x * 100).toFixed(d)}`;
const sig = (x) => (isNum(x) ? Number(x.toPrecision(6)).toString() : '—');
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export class SignalAnalyzer {
  constructor(cfg) {
    this.cfg = cfg;
    this.patterns = new PatternEngine(cfg.pattern);
  }

  /**
   * md: { symbol, exchange, daily, quote_volume_24h, last_price, order_books, trades }
   * daily: { time[], open[], high[], low[], close[], volume[], quote_volume[], trades[], taker_buy_quote[] }
   */
  analyze(md, macro, deriv = null) {
    const cfg = this.cfg, st = cfg.setup, mc = cfg.manipulation;
    const gates = [];
    const gate = (name, ok, detail = '') => gates.push({ name, passed: Boolean(ok), detail });

    const df = addIndicators(md.daily, cfg);
    const n = df.close.length;
    const idx = n - 1;
    const close = df.close[idx];

    gate('Makro Kilit', !macro.locked, `${macro.regime} (skor ${Math.round(macro.score)})`);
    gate('Likidite (24s hacim)', md.quote_volume_24h >= cfg.liquidity.min_quote_volume_24h,
      `${(md.quote_volume_24h / 1e6).toFixed(1)}M USD`);
    const book = orderBookStats(md.order_books || [], cfg.liquidity, mc);
    if (!book) gate('Emir Defteri Derinliği', !mc.strict_missing_data, 'emir defteri verisi yok');
    else {
      const liq = cfg.liquidity;
      const ok = book.bid_depth_usd >= liq.min_depth_usd_each_side && book.ask_depth_usd >= liq.min_depth_usd_each_side
        && book.spread_pct <= liq.max_spread_pct && book.buy_slippage_pct <= liq.max_slippage_pct;
      gate('Emir Defteri Derinliği', ok,
        `±%2 alış ${(book.bid_depth_usd / 1e3).toFixed(0)}k / satış ${(book.ask_depth_usd / 1e3).toFixed(0)}k USD, `
        + `spread ${pct(book.spread_pct, 2)}, kayma ${pct(book.buy_slippage_pct, 2)}`);
    }
    gate('Yeterli Geçmiş', n >= st.min_history_bars, `${n} gün`);
    if (n < Math.max(st.min_history_bars, st.ma_period + 5)) return this.empty(md, gates, close);

    // Formasyon
    const patterns = this.patterns.detect(df);
    const primary = selectPrimary(patterns, st.breakout_max_age);
    gate('Formasyon Kırılımı', primary !== null, primary ? primary.name : `taze (≤${st.breakout_max_age} gün) kırılım yok`);
    const bearish = patterns.filter((p) => !p.bullish && p.broken);
    gate('Ayı Formasyonu Yok', !bearish.length, bearish.map((p) => p.name).join(', ') || 'temiz');
    const bIdx = idx - (primary ? primary.breakout_age : 0);

    // Akümülasyon
    const base = baseDuration(df, bIdx - 1, st.base_max_range, st.base_max_days);
    gate('Konsolidasyon Süresi', base.days >= st.base_min_days,
      base.days ? `${base.days} gün, bant ${pct(base.range)}` : 'taban yok');
    const sqLo = Math.max(0, bIdx - st.squeeze_window);
    const minRank = bIdx > sqLo ? nanmin(df.bbw_rank, sqLo, bIdx) : NaN;
    gate('Bollinger Sıkışması', isNum(minRank) && minRank <= st.bbw_max_percentile,
      isNum(minRank) ? `BBW en düşük yüzdelik ${pct(minRank)}` : 'veri yok');
    const baseStart = Math.max(0, bIdx - Math.max(base.days, st.base_min_days));
    const ath = nanmax(df.high, 0, baseStart + 1);
    const baseLow = nanmin(df.low, baseStart, bIdx + 1);
    const drawdown = ath > 0 ? 1 - baseLow / ath : 0;
    gate("ATH'den Düşüş", drawdown >= st.ath_min_drawdown || !st.require_ath_drawdown,
      `${pct(drawdown)} (ATH ${sig(ath)}, dip ${sig(baseLow)})`);

    // MA200
    const ages = [maCrossAge(df.close, df.sma200), maCrossAge(df.close, df.ema200)].filter((a) => a !== null);
    const maAge = ages.length ? Math.min(...ages) : null;
    const maDist = close / df.sma200[idx] - 1;
    gate('MA200 Kırılımı (1-5 gün)', maAge !== null && maAge <= st.ma_cross_max_age && maAge + 1 >= st.ma_hold_bars,
      maAge !== null ? `${maAge} gün önce` : 'fiyat MA200 altında / kesişim yok');
    gate("MA200'den Aşırı Uzaklaşmamış", maDist <= st.max_extension_above_ma, `%${(maDist * 100 >= 0 ? '+' : '') + (maDist * 100).toFixed(1)}`);

    // Momentum
    const rsi = df.rsi[idx];
    const rsiCap = bIdx === idx ? st.rsi_breakout_day_max : st.rsi_max;
    const rsiPrev = df.rsi[bIdx - 1];
    gate(`RSI ${st.rsi_min}-${rsiCap}`, st.rsi_min <= rsi && rsi <= rsiCap && rsiPrev <= st.rsi_max,
      `${rsi.toFixed(1)} (kırılım öncesi ${rsiPrev.toFixed(1)})`);
    const m = df.macd;
    const win = m.slice(-st.macd_zero_cross_lookback - 1);
    const macdCross = m[n - 1] > 0 && win.slice(0, -1).some((v) => v <= 0);
    let macdAge = null;
    if (macdCross) {
      let lastNonPos = -1;
      win.forEach((v, i) => { if (v <= 0) lastNonPos = i; });
      macdAge = win.length - 1 - lastNonPos - 1;
    }
    gate('MACD Sıfır Kesişimi', macdCross, macdCross ? `${macdAge} gün önce` : `MACD ${Number(m[n - 1].toPrecision(4))}`);

    // Hacim
    const vm = [df.vol_mult[bIdx], df.vol_mult[idx]].filter(isNum);
    const volMult = vm.length ? Math.max(...vm) : NaN;
    gate('Hacim Anomalisi', volMult >= st.volume_spike_mult, `${volMult.toFixed(1)}x (${st.volume_avg_period}G ort.)`);
    gate('VWAP Üstü', close > df.vwap[idx], `VWAP ${sig(df.vwap[idx])}`);
    const vp = volumeProfile(df, idx, cfg.smart_money);
    gate('POC Üstü', vp !== null && vp.above_poc, vp ? `POC ${sig(vp.poc)}` : 'profil yok');
    const accum = hiddenAccumulation(df, bIdx, cfg.smart_money);

    // Anti-manipülasyon
    const manip = buildReport(df, bIdx, mc, md.trades, deriv, book);
    gate('Mum Anatomisi (gövde ≥%75)', manip.candle_ok, `gövde ${pct(manip.body_ratio)}, üst fitil ${pct(manip.upper_wick_ratio)}`);
    gate('Sahte Hacim Filtresi', manip.wash_risk <= mc.max_wash_risk, `risk ${pct(manip.wash_risk)}`);
    const derivMissing = !deriv || deriv.funding_rate === null || deriv.funding_rate === undefined;
    gate('Türev Tuzağı Yok', !manip.derivatives_trap, derivMissing ? 'vadeli yok' : `fonlama ${pct(deriv.funding_rate, 3)}`);
    gate('Spoofing Yok', !manip.spoof_detected, manip.spoof_detected ? 'tespit edildi' : 'temiz');
    gate('Tuzak Riski', manip.trap_risk <= mc.max_trap_risk, pct(manip.trap_risk));

    // Skor
    const comps = this.components(df, primary, patterns, volMult, vp, accum, manip, base.days, minRank, drawdown,
      maAge, maDist, rsi, macdAge, macro);
    const sc = cfg.scoring;
    const baseScore = 100 * (sc.w_volume * comps.hacim + sc.w_accumulation * comps['akümülasyon']
      + sc.w_ma200 * comps.ma200 + sc.w_momentum * comps.momentum + sc.w_macro * comps.makro);
    const score = baseScore * (1 - sc.trap_penalty * Math.max(0, manip.trap_risk - 0.15));

    let plan = null;
    if (primary) {
      plan = buildPlan(df, bIdx, primary, cfg.risk, vp ? vp.resistances : null);
      gate('Risk/Ödül', plan.rr_ok, `risk ${pct(plan.risk_pct, 1)}`);
    }
    gate(`Kesinlik Skoru ≥ ${sc.min_score}`, score >= sc.min_score, score.toFixed(1));

    const brokenBullish = patterns.filter((p) => p.broken && p.bullish).map((p) => p.name);
    return {
      symbol: md.symbol, exchange: md.exchange, price: close, score, base_score: baseScore, components: comps,
      patterns: patterns.filter((p) => p.broken), primary, gates, manipulation: manip, plan,
      ma200_distance: maDist, volume_mult: volMult, rsi, quote_volume_24h: md.quote_volume_24h, liquidity: book,
      volume_profile: vp, timestamp: md.daily.time ? md.daily.time[idx] : Date.now(),
      pattern_label: brokenBullish.length ? [...brokenBullish, 'MA200 Kırılımı'].join(' + ') : '—',
      passed: gates.every((g) => g.passed),
    };
  }

  components(df, primary, patterns, volMult, vp, accum, manip, baseDays, minRank, drawdown, maAge, maDist, rsi, macdAge, macro) {
    const st = this.cfg.setup;
    const pocS = vp && vp.strong_poc_cross ? 1 : vp && vp.above_poc ? 0.5 : 0;
    const volume = 0.40 * clip01((volMult - 1) / 3) + 0.20 * pocS + 0.25 * accum.score + 0.15 * (manip.spot_led ? 1 : 0);
    const bullish = patterns.filter((p) => p.bullish && p.broken && p.breakout_age <= st.breakout_max_age);
    const pq = primary ? primary.quality : 0;
    const patternS = clip01(pq + 0.15 * (bullish.length - 1));
    const accumulation = 0.30 * clip01(1 - minRank / 0.30) + 0.25 * clip01(baseDays / 90)
      + 0.20 * clip01((drawdown - 0.5) / 0.35) + 0.25 * patternS;
    let ma200 = 0;
    if (maAge !== null) {
      const fresh = clip01(1 - maAge / (st.ma_cross_max_age + 1));
      const prox = maDist >= 0 && maDist <= 0.08 ? 1 : clip01(1 - (maDist - 0.08) / (st.max_extension_above_ma - 0.08));
      ma200 = 0.5 * fresh + 0.5 * prox;
    }
    const mid = (st.rsi_min + st.rsi_max) / 2;
    const rsiS = clip01(1 - Math.abs(rsi - mid) / ((st.rsi_max - st.rsi_min) / 2 + 3));
    const macdS = macdAge !== null ? clip01(1 - macdAge / st.macd_zero_cross_lookback) : 0;
    const h = df.hist, n = h.length;
    const histS = h[n - 1] > 0 && h[n - 1] >= h[n - 2] ? 1 : h[n - 1] > 0 ? 0.5 : 0;
    const momentum = 0.5 * rsiS + 0.3 * macdS + 0.2 * histS;
    return { hacim: r4(volume), 'akümülasyon': r4(accumulation), ma200: r4(ma200), momentum: r4(momentum), makro: r4(macro.score / 100) };
  }

  empty(md, gates, close) {
    return {
      symbol: md.symbol, exchange: md.exchange, price: close, score: 0, base_score: 0, components: {}, patterns: [],
      primary: null, gates, manipulation: null, plan: null, ma200_distance: NaN, volume_mult: NaN, rsi: NaN,
      quote_volume_24h: md.quote_volume_24h, liquidity: null, volume_profile: null, timestamp: Date.now(),
      pattern_label: '—', passed: false,
    };
  }
}
