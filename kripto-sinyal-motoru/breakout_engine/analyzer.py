"""Sinyal çekirdeği: kesişim şartları (gates) + Kesinlik Skoru.

Akış (tek bir sembol için, ağ erişimi yok, tamamen deterministik):

  1. İndikatörler hesaplanır (yalnızca kapanmış günlük mumlar).
  2. Formasyonlar taranır, en kaliteli taze kırılım "birincil formasyon" seçilir.
  3. Kesişim şartları değerlendirilir. Biri bile başarısızsa sinyal YOKTUR.
  4. 5 bileşenli ağırlıklı skor hesaplanır, tuzak riski ile cezalandırılır.
  5. Risk planı (alım bölgesi, stop, hedefler) çıkarılır.

Aynı fonksiyon geriye dönük testte de kullanılır; canlı ve test mantığı aynıdır.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import EngineConfig
from .indicators import add_indicators
from .manipulation import build_report, order_book_stats
from .models import DerivativesStats, Gate, MacroState, MarketData, PatternMatch, Signal
from .patterns import PatternEngine
from .risk import build_plan
from .smart_money import hidden_accumulation, volume_profile


def _clip01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0)) if np.isfinite(x) else 0.0


def ma_cross_age(close: np.ndarray, ma: np.ndarray) -> int | None:
    """Fiyat MA'nın üstüne kaç bar önce geçti (o zamandan beri hep üstünde)."""
    if np.isnan(ma[-1]) or close[-1] <= ma[-1]:
        return None
    j = len(close) - 1
    while j - 1 >= 0 and not np.isnan(ma[j - 1]) and close[j - 1] > ma[j - 1]:
        j -= 1
    if j == 0 or np.isnan(ma[j - 1]):
        return None
    return len(close) - 1 - j


def base_duration(df: pd.DataFrame, end_idx: int, max_range: float, max_days: int) -> tuple[int, float]:
    """``end_idx``'ten geriye, (tepe/dip - 1) <= max_range kaldıkça uzanan taban süresi."""
    hi, lo = -np.inf, np.inf
    days = 0
    highs, lows = df["high"].to_numpy(float), df["low"].to_numpy(float)
    for k in range(end_idx, max(-1, end_idx - max_days), -1):
        nh, nl = max(hi, highs[k]), min(lo, lows[k])
        if nh / nl - 1 > max_range:
            break
        hi, lo, days = nh, nl, days + 1
    return days, (hi / lo - 1) if days else np.nan


# Klasik dip formasyonları > trend çizgisi / yapı kırılımı > kanal kırılımı
PATTERN_TIER = {
    "TOBO": 3, "Üçlü Dip": 3, "İkili Dip": 3, "Çanak Dip": 3, "Düşen Kama": 3, "Flama": 3,
    "Simetrik Üçgen": 2, "Düşen Trend Kırılımı": 2, "MSS (ChoCh)": 2,
}


def select_primary(patterns: list[PatternMatch], max_age: int) -> PatternMatch | None:
    fresh = [p for p in patterns if p.bullish and p.broken and p.breakout_age <= max_age]
    if not fresh:
        return None
    return max(fresh, key=lambda p: (PATTERN_TIER.get(p.name, 1), p.quality, -p.breakout_age))


class SignalAnalyzer:
    def __init__(self, cfg: EngineConfig) -> None:
        self.cfg = cfg
        self.patterns = PatternEngine(cfg.pattern)

    def analyze(self, md: MarketData, macro: MacroState, deriv: DerivativesStats | None = None) -> Signal:
        cfg = self.cfg
        st, mc = cfg.setup, cfg.manipulation
        gates: list[Gate] = []

        def gate(name: str, ok: bool, detail: str = "") -> None:
            gates.append(Gate(name, bool(ok), detail))

        df = add_indicators(md.daily, st, cfg.risk, cfg.smart_money)
        n = len(df)
        idx = n - 1
        last = df.iloc[idx]
        close = float(last["close"])

        # ---------------------------------------------------- 1. makro ve likidite
        gate("Makro Kilit", not macro.locked, f"{macro.regime.value} (skor {macro.score:.0f})")
        gate("Likidite (24s hacim)", md.quote_volume_24h >= cfg.liquidity.min_quote_volume_24h,
             f"{md.quote_volume_24h / 1e6:.1f}M USD")
        book = order_book_stats(md.order_books or [], cfg.liquidity, mc)
        if book is None:
            gate("Emir Defteri Derinliği", not mc.strict_missing_data, "emir defteri verisi yok")
        else:
            liq = cfg.liquidity
            ok = (book.bid_depth_usd >= liq.min_depth_usd_each_side
                  and book.ask_depth_usd >= liq.min_depth_usd_each_side
                  and book.spread_pct <= liq.max_spread_pct
                  and book.buy_slippage_pct <= liq.max_slippage_pct)
            gate("Emir Defteri Derinliği", ok,
                 f"±%2 alış {book.bid_depth_usd / 1e3:.0f}k / satış {book.ask_depth_usd / 1e3:.0f}k USD, "
                 f"spread %{book.spread_pct * 100:.2f}, kayma %{book.buy_slippage_pct * 100:.2f}")

        gate("Yeterli Geçmiş", n >= st.min_history_bars, f"{n} gün")
        if n < max(st.min_history_bars, st.ma_period + 5):
            return self._empty(md, gates, close)

        # ---------------------------------------------------- 2. formasyon
        patterns = self.patterns.detect(df)
        primary = select_primary(patterns, st.breakout_max_age)
        gate("Formasyon Kırılımı", primary is not None,
             primary.name if primary else "taze (≤%d gün) kırılım yok" % st.breakout_max_age)
        bearish = [p for p in patterns if not p.bullish and p.broken]
        gate("Ayı Formasyonu Yok", not bearish, ", ".join(p.name for p in bearish) or "temiz")
        b_idx = idx - (primary.breakout_age if primary else 0)

        # ---------------------------------------------------- 3. akümülasyon / dip
        base_days, base_range = base_duration(df, b_idx - 1, st.base_max_range, st.base_max_days)
        gate("Konsolidasyon Süresi", base_days >= st.base_min_days,
             f"{base_days} gün, bant %{base_range * 100:.0f}" if base_days else "taban yok")
        sq_lo = max(0, b_idx - st.squeeze_window)
        min_rank = float(df["bbw_rank"].iloc[sq_lo:b_idx].min()) if b_idx > sq_lo else np.nan
        gate("Bollinger Sıkışması", np.isfinite(min_rank) and min_rank <= st.bbw_max_percentile,
             f"BBW en düşük yüzdelik %{min_rank * 100:.0f}" if np.isfinite(min_rank) else "veri yok")
        base_start = max(0, b_idx - max(base_days, st.base_min_days))
        ath = float(df["high"].iloc[: base_start + 1].max())
        base_low = float(df["low"].iloc[base_start:b_idx + 1].min())
        drawdown = 1 - base_low / ath if ath > 0 else 0.0
        gate("ATH'den Düşüş", drawdown >= st.ath_min_drawdown or not st.require_ath_drawdown,
             f"%{drawdown * 100:.0f} (ATH {ath:.6g}, dip {base_low:.6g})")

        # ---------------------------------------------------- 4. MA200
        c_arr = df["close"].to_numpy(float)
        ages = [a for a in (ma_cross_age(c_arr, df["sma200"].to_numpy(float)),
                            ma_cross_age(c_arr, df["ema200"].to_numpy(float))) if a is not None]
        ma_age = min(ages) if ages else None
        ma_val = float(last["sma200"])
        ma_dist = close / ma_val - 1
        gate("MA200 Kırılımı (1-5 gün)",
             ma_age is not None and ma_age <= st.ma_cross_max_age and ma_age + 1 >= st.ma_hold_bars,
             f"{ma_age} gün önce" if ma_age is not None else "fiyat MA200 altında / kesişim yok")
        gate("MA200'den Aşırı Uzaklaşmamış", ma_dist <= st.max_extension_above_ma, f"%{ma_dist * 100:+.1f}")

        # ---------------------------------------------------- 5. momentum
        rsi = float(last["rsi"])
        rsi_cap = st.rsi_breakout_day_max if b_idx == idx else st.rsi_max
        rsi_prev = float(df["rsi"].iloc[b_idx - 1])
        gate(f"RSI {st.rsi_min:.0f}-{rsi_cap:.0f}", st.rsi_min <= rsi <= rsi_cap and rsi_prev <= st.rsi_max,
             f"{rsi:.1f} (kırılım öncesi {rsi_prev:.1f})")
        macd = df["macd"].to_numpy(float)
        win = macd[-st.macd_zero_cross_lookback - 1 :]
        macd_cross = bool(macd[-1] > 0 and (win[:-1] <= 0).any())
        macd_age = int(len(win) - 1 - np.where(win <= 0)[0].max() - 1) if macd_cross else None
        gate("MACD Sıfır Kesişimi", macd_cross,
             f"{macd_age} gün önce" if macd_cross else f"MACD {macd[-1]:.4g}")

        # ---------------------------------------------------- 6. hacim
        vol_mult = float(np.nanmax([df["vol_mult"].iloc[b_idx], last["vol_mult"]]))
        gate("Hacim Anomalisi", vol_mult >= st.volume_spike_mult, f"{vol_mult:.1f}x ({st.volume_avg_period}G ort.)")
        gate("VWAP Üstü", close > float(last["vwap"]), f"VWAP {float(last['vwap']):.6g}")
        vp = volume_profile(df, idx, cfg.smart_money)
        gate("POC Üstü", vp is not None and vp.above_poc, f"POC {vp.poc:.6g}" if vp else "profil yok")
        accum = hidden_accumulation(df, b_idx, cfg.smart_money)

        # ---------------------------------------------------- 7. anti-manipülasyon
        manip = build_report(df, b_idx, mc, md.trades, deriv, book)
        gate("Mum Anatomisi (gövde ≥%75)", manip.candle_ok,
             f"gövde %{manip.body_ratio * 100:.0f}, üst fitil %{manip.upper_wick_ratio * 100:.0f}")
        gate("Sahte Hacim Filtresi", manip.wash_risk <= mc.max_wash_risk, f"risk %{manip.wash_risk * 100:.0f}")
        deriv_missing = deriv is None or deriv.funding_rate is None
        gate("Türev Tuzağı Yok", not manip.derivatives_trap,
             "vadeli yok" if deriv_missing else f"fonlama %{deriv.funding_rate * 100:.3f}")
        gate("Spoofing Yok", not manip.spoof_detected, "temiz" if not manip.spoof_detected else "tespit edildi")
        gate("Tuzak Riski", manip.trap_risk <= mc.max_trap_risk, f"%{manip.trap_risk * 100:.0f}")

        # ---------------------------------------------------- 8. skor
        comps = self._components(df, idx, b_idx, primary, patterns, vol_mult, vp, accum, manip,
                                 base_days, min_rank, drawdown, ma_age, ma_dist, rsi, macd_age, macro)
        sc = cfg.scoring
        base = 100 * (sc.w_volume * comps["hacim"] + sc.w_accumulation * comps["akümülasyon"]
                      + sc.w_ma200 * comps["ma200"] + sc.w_momentum * comps["momentum"]
                      + sc.w_macro * comps["makro"])
        # Düşük seviyeli kaçınılmaz gürültü (≤%15) cezalandırılmaz.
        score = base * (1 - sc.trap_penalty * max(0.0, manip.trap_risk - 0.15))

        # ---------------------------------------------------- 9. risk planı
        plan = None
        if primary is not None:
            plan = build_plan(df, b_idx, primary, cfg.risk, vp.resistances if vp else None)
            gate("Risk/Ödül", plan.rr_ok, f"risk %{plan.risk_pct * 100:.1f}")
        gate(f"Kesinlik Skoru ≥ {sc.min_score:.0f}", score >= sc.min_score, f"{score:.1f}")

        ts = df.index[idx] if isinstance(df.index, pd.DatetimeIndex) else pd.Timestamp.utcnow()
        return Signal(
            symbol=md.symbol, exchange=md.exchange, price=close, score=float(score), base_score=float(base),
            components=comps, patterns=[p for p in patterns if p.broken], gates=gates, manipulation=manip,
            plan=plan, ma200_distance=float(ma_dist), volume_mult=vol_mult, rsi=rsi,
            quote_volume_24h=md.quote_volume_24h, liquidity=book, timestamp=ts,
        )

    # ------------------------------------------------------------------ bileşenler
    def _components(self, df, idx, b_idx, primary, patterns, vol_mult, vp, accum, manip,
                    base_days, min_rank, drawdown, ma_age, ma_dist, rsi, macd_age, macro) -> dict[str, float]:
        st = self.cfg.setup
        # Hacim + akıllı para (%30)
        poc_s = 1.0 if (vp and vp.strong_poc_cross) else (0.5 if (vp and vp.above_poc) else 0.0)
        volume = (0.40 * _clip01((vol_mult - 1) / (4.0 - 1))
                  + 0.20 * poc_s
                  + 0.25 * accum.score
                  + 0.15 * (1.0 if manip.spot_led else 0.0))
        # Akümülasyon + formasyon kalitesi (%25)
        bullish = [p for p in patterns if p.bullish and p.broken and p.breakout_age <= st.breakout_max_age]
        pq = primary.quality if primary else 0.0
        pattern_s = _clip01(pq + 0.15 * (len(bullish) - 1))
        accumulation = (0.30 * _clip01(1 - min_rank / 0.30)
                        + 0.25 * _clip01(base_days / 90)
                        + 0.20 * _clip01((drawdown - 0.5) / 0.35)
                        + 0.25 * pattern_s)
        # MA200 tazelik + yakınlık (%20)
        fresh = _clip01(1 - (ma_age or 0) / (st.ma_cross_max_age + 1)) if ma_age is not None else 0.0
        prox = 1.0 if 0 <= ma_dist <= 0.08 else _clip01(1 - (ma_dist - 0.08) / (st.max_extension_above_ma - 0.08))
        ma200 = 0.5 * fresh + 0.5 * prox if ma_age is not None else 0.0
        # Momentum (%15): RSI bandın ortasına yakınlık + MACD tazeliği + histogram
        mid = (st.rsi_min + st.rsi_max) / 2
        rsi_s = _clip01(1 - abs(rsi - mid) / ((st.rsi_max - st.rsi_min) / 2 + 3))
        macd_s = _clip01(1 - macd_age / st.macd_zero_cross_lookback) if macd_age is not None else 0.0
        hist = df["hist"].to_numpy(float)
        hist_s = 1.0 if hist[-1] > 0 and hist[-1] >= hist[-2] else (0.5 if hist[-1] > 0 else 0.0)
        momentum = 0.5 * rsi_s + 0.3 * macd_s + 0.2 * hist_s
        return {
            "hacim": round(volume, 4),
            "akümülasyon": round(accumulation, 4),
            "ma200": round(ma200, 4),
            "momentum": round(momentum, 4),
            "makro": round(macro.score / 100, 4),
        }

    def _empty(self, md: MarketData, gates: list[Gate], close: float) -> Signal:
        return Signal(
            symbol=md.symbol, exchange=md.exchange, price=close, score=0.0, base_score=0.0, components={},
            patterns=[], gates=gates, manipulation=None, plan=None, ma200_distance=float("nan"),
            volume_mult=float("nan"), rsi=float("nan"), quote_volume_24h=md.quote_volume_24h,
            liquidity=None, timestamp=pd.Timestamp.utcnow(),
        )
