"""Piyasa Rejimi Motoru (Market Gatekeeper / Sistem Kilidi).

BTC.D, USDT.D ve TOTAL3'ün tarihsel serileri ücretsiz API'lerde yok. Bu yüzden
borsadaki en büyük N coinin günlük kapanışları ve CoinGecko'dan alınan güncel
piyasa değerleri ile **piyasa değeri ağırlıklı vekil (proxy) endeksler** kurulur:

    cap_i(t)   = cap_i(bugün) * fiyat_i(t) / fiyat_i(bugün)     (arz sabit varsayımı)
    TOTAL(t)   = Σ cap_i(t) + stabil coin piyasa değeri
    BTC.D(t)   = cap_BTC(t) / TOTAL(t)
    USDT.D(t)  = cap_USDT / TOTAL(t)
    TOTAL3(t)  = Σ cap_i(t)   (BTC, ETH ve stabil coinler hariç)

Bu yaklaşım EMA20/50 eğimlerinin YÖNÜNÜ doğru verir (mutlak değerler TradingView ile
birebir aynı değildir). CoinGecko'ya erişilemezse işlem hacmi ağırlığı kullanılır.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import MacroConfig
from .indicators import ema, sma
from .models import MacroState, Regime

STABLES = {"USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD", "USD1", "BUSD"}


def build_proxy_indices(
    closes: dict[str, pd.Series], caps: dict[str, float], stable_caps: dict[str, float]
) -> pd.DataFrame:
    """Coin kapanışlarından TOTAL, TOTAL3, BTC.D ve USDT.D vekil serilerini kurar."""
    frame = pd.DataFrame(closes).sort_index().ffill().dropna(how="any")
    if frame.empty or "BTC" not in frame:
        raise ValueError("Endeks için BTC dahil ortak geçmişe sahip seriler gerekli")
    last = frame.iloc[-1]
    implied = pd.DataFrame(
        {b: caps.get(b, 0.0) * frame[b] / last[b] for b in frame.columns if caps.get(b, 0.0) > 0}
    )
    stable_total = float(sum(stable_caps.values()))
    total = implied.sum(axis=1) + stable_total
    alts = implied.drop(columns=[c for c in ("BTC", "ETH") if c in implied])
    total3 = alts.sum(axis=1) if not alts.empty else pd.Series(np.nan, index=implied.index)
    out = pd.DataFrame({"total": total, "total3": total3, "btc_d": implied["BTC"] / total})
    out["usdt_d"] = stable_caps.get("USDT", stable_total) / total if stable_total > 0 else np.nan
    return out


def _slope_dir(s: pd.Series, cfg: MacroConfig) -> tuple[float, bool, bool]:
    """(EMA_fast eğimi, EMA_fast > EMA_slow, EMA_slow eğimi > 0)."""
    s = s.replace(0.0, np.nan).dropna()
    if len(s) < cfg.ema_slow + cfg.slope_lookback:
        return float("nan"), False, False
    f, sl = ema(s, cfg.ema_fast), ema(s, cfg.ema_slow)
    slope = float(f.iloc[-1] / f.iloc[-1 - cfg.slope_lookback] - 1)
    slow_slope = float(sl.iloc[-1] / sl.iloc[-1 - cfg.slope_lookback] - 1)
    return slope, bool(f.iloc[-1] > sl.iloc[-1]), slow_slope > 0


def evaluate_regime(
    btc: pd.DataFrame,
    indices: pd.DataFrame | None,
    cfg: MacroConfig,
    global_snapshot: dict | None = None,
) -> MacroState:
    """Makro skoru (0-100) ve kilit durumunu hesaplar.

    Puan dağılımı:
      BTC > SMA200: 25 | BTC > SMA50: 15 | SMA50 > SMA200: 10
      USDT.D düşüyor (EMA20 eğimi < 0 ve EMA20 < EMA50): 20
      TOTAL3 yükseliyor (EMA20 eğimi > 0 ve EMA20 > EMA50): 20
      BTC.D düşüyor (altcoinlere para akışı): 10 (BTC.D yükselse de BTC yükseliyorsa 5)
    """
    notes: list[str] = []
    close = btc["close"]
    s_fast, s_slow = sma(close, cfg.btc_ma_fast), sma(close, cfg.btc_ma_slow)
    c, f, s = float(close.iloc[-1]), float(s_fast.iloc[-1]), float(s_slow.iloc[-1])
    score = 0.0
    above_slow = c > s
    if above_slow:
        score += 25
    else:
        notes.append("BTC 200 günlük ortalamanın altında")
    if c > f:
        score += 15
    else:
        notes.append("BTC 50 günlük ortalamanın altında")
    if f > s:
        score += 10

    btc_d_slope = usdt_d_slope = total3_slope = float("nan")
    usdt_rising = False
    if indices is not None and not indices.empty:
        usdt_d_slope, usdt_up, _ = _slope_dir(indices["usdt_d"], cfg)
        if usdt_d_slope < 0 and not usdt_up:
            score += 20
        usdt_rising = usdt_d_slope > 0 and usdt_up
        if usdt_rising:
            notes.append("USDT.D yükselişte (paradan kaçış / risk-off)")
        total3_slope, t3_up, _ = _slope_dir(indices["total3"], cfg)
        if total3_slope > 0 and t3_up:
            score += 20
        elif total3_slope < 0 and not t3_up:
            notes.append("TOTAL3 düşüş trendinde")
        btc_d_slope, _, _ = _slope_dir(indices["btc_d"], cfg)
        if btc_d_slope < 0:
            score += 10
        elif c > f:
            score += 5
    else:
        notes.append("Endeks verisi yok: makro skor yalnızca BTC trendinden")
        score = score / 50 * 100  # sadece BTC bileşeni 50 puan üzerinden ölçeklenir

    total3_24h = float("nan")
    btc_dom_now = usdt_dom_now = None
    if global_snapshot:
        total3_24h = float(global_snapshot.get("market_cap_change_percentage_24h_usd", np.nan)) / 100
        pct = global_snapshot.get("market_cap_percentage", {})
        btc_dom_now, usdt_dom_now = pct.get("btc"), pct.get("usdt")
    elif indices is not None and len(indices) > 1 and indices["total3"].iloc[-2] > 0:
        total3_24h = float(indices["total3"].iloc[-1] / indices["total3"].iloc[-2] - 1)

    locked = False
    if score < cfg.risk_off_threshold:
        locked = True
        notes.append(f"Makro skor {score:.0f} < {cfg.risk_off_threshold:.0f}: SİSTEM KİLİTLİ")
    if not above_slow and usdt_rising:
        locked = True
        notes.append("BTC < SMA200 ve USDT.D yükselişte: SİSTEM KİLİTLİ (Hard Stop)")
    if np.isfinite(total3_24h) and total3_24h <= -0.08:
        locked = True
        notes.append(f"Piyasa 24 saatte %{total3_24h * 100:.1f} düştü: SİSTEM KİLİTLİ")

    if locked:
        regime = Regime.RISK_OFF
    elif score >= cfg.risk_on_threshold:
        regime = Regime.RISK_ON
    else:
        regime = Regime.NEUTRAL
    return MacroState(
        regime=regime, score=float(score), locked=locked, btc_close=c, btc_sma_fast=f, btc_sma_slow=s,
        btc_dom_slope=btc_d_slope, usdt_dom_slope=usdt_d_slope, total3_slope=total3_slope,
        total3_change_24h=total3_24h, btc_dom_now=btc_dom_now, usdt_dom_now=usdt_dom_now, notes=notes,
    )
