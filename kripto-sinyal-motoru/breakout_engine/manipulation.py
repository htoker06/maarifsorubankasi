"""Anti-Manipülasyon ve Tuzak Kalkanı.

Her kontrol 0-1 arası bir risk ya da kesin red (veto) üretir:
- Mum anatomisi: kırılım mumu gövdesi >= %75, uzun üst fitil -> red.
- Likidite süpürmesi (sweep): önceki dibin altına iğne atıp geri toplanma -> pozitif teyit.
- Sahte hacim (wash trading): işlem sayısı / ortalama işlem büyüklüğü / işlem dağılımı.
- Türev uyumsuzluğu: aşırı fonlama + hızlı OI artışı -> kaldıraçlı tuzak.
- Spot CVD: yükseliş spot alıcı (taker buy) baskısıyla desteklenmeli.
- Spoofing: kırılım seviyesinin hemen üstünde sahte satış duvarı + boş alış tarafı.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
import pandas as pd

from .config import LiquidityConfig, ManipulationConfig
from .models import DerivativesStats, ManipulationReport, OrderBookStats, TradeTapeStats


# --------------------------------------------------------------------------- mum anatomisi
def candle_anatomy(row: pd.Series) -> tuple[float, float, float]:
    """(gövde oranı, üst fitil oranı, kapanışın aralıktaki konumu)."""
    rng = float(row["high"] - row["low"])
    if rng <= 0:
        return 0.0, 0.0, 0.5
    body = abs(float(row["close"] - row["open"])) / rng
    upper = float(row["high"] - max(row["close"], row["open"])) / rng
    pos = float(row["close"] - row["low"]) / rng
    return body, upper, pos


def candle_ok(row: pd.Series, cfg: ManipulationConfig) -> tuple[bool, list[str]]:
    body, upper, pos = candle_anatomy(row)
    notes: list[str] = []
    if row["close"] <= row["open"]:
        notes.append("Kırılım mumu kırmızı")
    if body < cfg.min_body_ratio:
        notes.append(f"Gövde oranı %{body * 100:.0f} < %{cfg.min_body_ratio * 100:.0f}")
    if upper > cfg.max_upper_wick_ratio:
        notes.append(f"Üst fitil %{upper * 100:.0f} (satış baskısı / stop avı)")
    if pos < cfg.close_position_min:
        notes.append("Kapanış mumun tepesinden uzak")
    return not notes, notes


def liquidity_sweep(df: pd.DataFrame, breakout_idx: int, cfg: ManipulationConfig) -> bool:
    """Kırılımdan önceki ``sweep_lookback`` barda dip süpürmesi var mı?

    Süpürme: mumun dibi önceki 30 günün dibinin altına iner, kapanış o dibin üstünde
    olur ve alt fitil mumun önemli bir kısmıdır (likidite alındı, fiyat geri toplandı).
    """
    lo = df["low"].to_numpy(float)
    hi = df["high"].to_numpy(float)
    cl = df["close"].to_numpy(float)
    op = df["open"].to_numpy(float)
    start = max(31, breakout_idx - cfg.sweep_lookback)
    for k in range(start, breakout_idx):
        support = lo[k - 30 : k].min()
        rng = hi[k] - lo[k]
        if rng <= 0:
            continue
        lower_wick = (min(op[k], cl[k]) - lo[k]) / rng
        if lo[k] < support and cl[k] > support and lower_wick >= cfg.sweep_min_lower_wick:
            # Süpürmeden sonra yeni dip yapılmamış olmalı.
            if lo[k + 1 : breakout_idx + 1].min(initial=np.inf) > lo[k]:
                return True
    return False


# --------------------------------------------------------------------------- sahte hacim
def kline_wash_risk(df: pd.DataFrame, idx: int, cfg: ManipulationConfig) -> tuple[float | None, list[str]]:
    """Mum verisindeki işlem sayısıyla hacim/işlem ilişkisini sınar.

    Gerçek talep: hacim artarken işlem sayısı da artar (tabana yayılmış katılım).
    Sahte hacim: hacim patlar ama işlem sayısı yerinde sayar -> az sayıda dev işlem.
    """
    if "trades" not in df.columns or df["trades"].isna().iloc[max(0, idx - 30) : idx + 1].any():
        return None, ["İşlem sayısı verisi yok"]
    qv = df["quote_volume"].to_numpy(float)
    tr = df["trades"].to_numpy(float)
    hist = slice(max(0, idx - 30), idx)
    if tr[hist].min() <= 0:
        return None, ["İşlem sayısı verisi bozuk"]
    avg_size = qv / np.where(tr > 0, tr, np.nan)
    size_spike = avg_size[idx] / np.nanmedian(avg_size[hist])
    vol_growth = qv[idx] / np.nanmean(qv[hist])
    trade_growth = tr[idx] / np.nanmean(tr[hist])
    notes: list[str] = []
    risk = 0.0
    if size_spike > cfg.trade_size_spike_max:
        risk += 0.5
        notes.append(f"Ortalama işlem büyüklüğü {size_spike:.1f}x (hacim birkaç dev işlemde)")
    if vol_growth >= 2 and trade_growth < cfg.min_trades_growth:
        risk += 0.4
        notes.append(f"Hacim {vol_growth:.1f}x, işlem sayısı sadece {trade_growth:.1f}x")
    # Son 30 günde hacim ile işlem sayısı korelasyonu çok düşükse botlar hacmi şişiriyor olabilir.
    window = slice(max(0, idx - 60), idx + 1)
    corr = np.corrcoef(qv[window], tr[window])[0, 1] if idx >= 20 else 1.0
    if np.isfinite(corr) and corr < 0.5:
        risk += 0.2
        notes.append(f"Hacim-işlem sayısı korelasyonu zayıf ({corr:.2f})")
    return float(min(1.0, risk)), notes


def trade_tape_stats(trades: list[dict[str, Any]]) -> TradeTapeStats | None:
    if not trades:
        return None
    notional = np.array([float(t.get("cost") or t["price"] * t["amount"]) for t in trades])
    total = notional.sum()
    if total <= 0:
        return None
    shares = notional / total
    k = max(1, int(np.ceil(len(notional) * 0.01)))
    top = np.sort(notional)[-k:].sum() / total
    amounts = [round(float(t["amount"]), 8) for t in trades]
    top_size_count = Counter(amounts).most_common(1)[0][1]
    # "Ping-pong": aynı miktarın art arda ters yönde işlem görmesi (kendi kendine al-sat)
    pairs = sum(
        1 for a, b, ta, tb in zip(amounts, amounts[1:], trades, trades[1:])
        if a == b and ta.get("side") and tb.get("side") and ta.get("side") != tb.get("side")
    )
    buys = sum(1 for t in trades if t.get("side") == "buy")
    return TradeTapeStats(
        n_trades=len(trades),
        hhi=float((shares**2).sum()),
        top1pct_share=float(top),
        repeat_size_share=top_size_count / len(trades),
        buy_ratio=buys / len(trades),
        ping_pong_share=pairs / max(1, len(trades) - 1),
    )


def tape_wash_risk(stats: TradeTapeStats, cfg: ManipulationConfig) -> tuple[float, list[str]]:
    risk, notes = 0.0, []
    if stats.hhi > cfg.max_trade_hhi:
        risk += 0.35
        notes.append(f"İşlem yoğunlaşması yüksek (HHI {stats.hhi:.3f})")
    if stats.top1pct_share > cfg.max_top1pct_share:
        risk += 0.35
        notes.append(f"En büyük %1 işlem hacmin %{stats.top1pct_share * 100:.0f}'i")
    if stats.repeat_size_share > cfg.max_repeat_size_share:
        risk += 0.5
        notes.append(f"Tek bir işlem miktarı tekrar ediyor: işlemlerin %{stats.repeat_size_share * 100:.0f}'i (bot)")
    if stats.ping_pong_share > cfg.max_ping_pong_share:
        risk += 0.5
        notes.append(f"Aynı miktarla art arda al-sat (ping-pong) %{stats.ping_pong_share * 100:.0f}")
    return min(1.0, risk), notes


# --------------------------------------------------------------------------- spot CVD
def spot_led(df: pd.DataFrame, idx: int, cfg: ManipulationConfig) -> tuple[bool | None, list[str]]:
    """Taker alış hacmi ile spot CVD kontrolü."""
    if "taker_buy_quote" not in df.columns or pd.isna(df["taker_buy_quote"].iloc[idx]):
        return None, ["Taker alış verisi yok"]
    buy = df["taker_buy_quote"].to_numpy(float)
    qv = df["quote_volume"].to_numpy(float)
    delta = 2 * buy - qv  # alış - satış
    cvd = np.cumsum(delta[max(0, idx - 30) : idx + 1])
    ratio = buy[idx] / qv[idx] if qv[idx] > 0 else 0.0
    cvd_rising = cvd[-1] > cvd[:-10].max(initial=-np.inf) if len(cvd) > 10 else delta[idx] > 0
    notes = []
    if ratio < cfg.min_taker_buy_ratio:
        notes.append(f"Kırılım mumunda taker alış oranı %{ratio * 100:.0f}")
    if not cvd_rising:
        notes.append("Spot CVD yükselişi desteklemiyor")
    return (not notes), notes


# --------------------------------------------------------------------------- türev
def derivatives_check(stats: DerivativesStats | None, cfg: ManipulationConfig) -> tuple[bool | None, list[str]]:
    """True = kaldıraçlı tuzak. None = veri yok."""
    if stats is None or stats.funding_rate is None:
        return None, ["Vadeli verisi yok (spot-only varlık)"]
    notes: list[str] = []
    trap = False
    if stats.funding_rate > cfg.max_funding_rate:
        trap = True
        notes.append(f"Fonlama %{stats.funding_rate * 100:.3f} > %{cfg.max_funding_rate * 100:.2f}")
    if stats.oi_change is not None and stats.oi_change > cfg.max_oi_growth_with_hot_funding and stats.funding_rate > cfg.max_funding_rate / 2:
        trap = True
        notes.append(f"OI %{stats.oi_change * 100:.0f} arttı ve fonlama ısınıyor (kaldıraçlı coşku)")
    return trap, notes


# --------------------------------------------------------------------------- emir defteri
def _depth(levels: list[list[float]], lo: float, hi: float) -> float:
    return float(sum(p * a for p, a, *_ in levels if lo <= p <= hi))


def _buy_slippage(asks: list[list[float]], usd: float) -> float:
    if not asks:
        return float("inf")
    best = asks[0][0]
    remaining, cost, qty = usd, 0.0, 0.0
    for p, a, *_ in asks:
        take = min(remaining, p * a)
        cost += take
        qty += take / p
        remaining -= take
        if remaining <= 0:
            break
    if remaining > 0:
        return float("inf")
    return (cost / qty) / best - 1


def _find_wall(
    book_side: list[list[float]], lo: float, hi: float, mult: float, margin: float = 0.03
) -> tuple[float, float] | None:
    """[lo, hi] aralığında, çevresindeki medyan seviyenin ``mult`` katı büyüklükte emir var mı?"""
    levels = [(p, p * a) for p, a, *_ in book_side if lo * (1 - margin) <= p <= hi * (1 + margin)]
    if len(levels) < 5:
        return None
    med = float(np.median([n for _, n in levels]))
    in_zone = [(p, n) for p, n in levels if lo <= p <= hi]
    if not in_zone or med <= 0:
        return None
    p, n = max(in_zone, key=lambda x: x[1])
    return (p, n) if n >= mult * med else None


def _notional_near(levels: list[list[float]], price: float, tol: float = 0.001) -> float:
    return float(sum(p * a for p, a, *_ in levels if abs(p / price - 1) <= tol))


def order_book_stats(
    books: list[dict[str, Any]], liq: LiquidityConfig, cfg: ManipulationConfig
) -> OrderBookStats | None:
    """Birden çok emir defteri görüntüsünden derinlik, kayma ve spoofing analizi."""
    books = [b for b in books if b and b.get("bids") and b.get("asks")]
    if not books:
        return None
    first, last = books[0], books[-1]
    bid, ask = last["bids"][0][0], last["asks"][0][0]
    mid = (bid + ask) / 2
    lo, hi = mid * (1 - liq.depth_pct), mid * (1 + liq.depth_pct)
    stats = OrderBookStats(
        mid=mid,
        spread_pct=(ask - bid) / mid,
        bid_depth_usd=_depth(last["bids"], lo, mid),
        ask_depth_usd=_depth(last["asks"], mid, hi),
        buy_slippage_pct=_buy_slippage(last["asks"], liq.slippage_probe_usd),
    )
    wall = _find_wall(first["asks"], mid, hi, cfg.wall_mult)
    if wall:
        stats.wall_price, stats.wall_usd = wall
        later = [_notional_near(b["asks"], wall[0]) for b in books[1:]]
        stats.wall_persistence = min(later) / wall[1] if later else 1.0
        if later and stats.wall_persistence < cfg.wall_vanish_ratio:
            stats.spoof_detected = True
            stats.notes.append(f"Satış duvarı {wall[0]:.6g} seviyesinde belirip kayboldu (spoof)")
        if stats.depth_ratio < cfg.min_bid_ask_depth_ratio:
            stats.spoof_detected = True
            stats.notes.append(
                f"{wall[1]:,.0f} USD satış duvarı + boş alış tarafı (alış/satış derinlik oranı {stats.depth_ratio:.2f})"
            )
    # Sahte alış duvarı (yalancı destek) da kayboluyorsa işaretle.
    bwall = _find_wall(first["bids"], lo, mid, cfg.wall_mult)
    if bwall and len(books) > 1:
        price = bwall[0]
        remain = min(_notional_near(b["bids"], price) for b in books[1:]) / bwall[1]
        if remain < cfg.wall_vanish_ratio:
            stats.spoof_detected = True
            stats.notes.append(f"Alış duvarı {price:.6g} belirip kayboldu (yalancı destek)")
    return stats


# --------------------------------------------------------------------------- birleştirici
def build_report(
    df: pd.DataFrame,
    breakout_idx: int,
    cfg: ManipulationConfig,
    trades: list[dict[str, Any]] | None,
    deriv: DerivativesStats | None,
    book: OrderBookStats | None,
) -> ManipulationReport:
    row = df.iloc[breakout_idx]
    body, upper, pos = candle_anatomy(row)
    ok, notes = candle_ok(row, cfg)
    sweep = liquidity_sweep(df, breakout_idx, cfg)
    if sweep:
        notes.append("Likidite süpürmesi (sweep) sonrası toparlanma: pozitif teyit")

    wash_parts: list[float] = []
    k_risk, k_notes = kline_wash_risk(df, breakout_idx, cfg)
    notes += k_notes
    if k_risk is not None:
        wash_parts.append(k_risk)
    tape = trade_tape_stats(trades or [])
    if tape is not None:
        t_risk, t_notes = tape_wash_risk(tape, cfg)
        wash_parts.append(t_risk)
        notes += t_notes
    missing_penalty = 0.5 if cfg.strict_missing_data else 0.2
    wash = max(wash_parts) if wash_parts else missing_penalty

    led, led_notes = spot_led(df, breakout_idx, cfg)
    notes += led_notes
    trap, d_notes = derivatives_check(deriv, cfg)
    notes += d_notes
    spoof = bool(book and book.spoof_detected)
    if book:
        notes += book.notes

    risk = (
        0.35 * wash
        + 0.20 * (0.0 if ok else 1.0)
        + 0.20 * (1.0 if trap else 0.0)
        + 0.15 * (1.0 if spoof else 0.0)
        + 0.10 * (0.0 if led else 1.0)
        - (0.10 if sweep else 0.0)
    )
    return ManipulationReport(
        body_ratio=body,
        upper_wick_ratio=upper,
        close_position=pos,
        candle_ok=ok,
        sweep_detected=sweep,
        wash_risk=wash,
        derivatives_trap=bool(trap),
        spot_led=bool(led),
        spoof_detected=spoof,
        trap_risk=float(np.clip(risk, 0.0, 1.0)),
        notes=notes,
    )
