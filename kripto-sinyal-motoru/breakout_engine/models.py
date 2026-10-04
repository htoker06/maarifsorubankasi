"""Motorun veri modelleri."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import pandas as pd


class Regime(str, Enum):
    RISK_ON = "GÜVENLİ"
    NEUTRAL = "NÖTR"
    RISK_OFF = "RİSKLİ"


@dataclass
class MacroState:
    regime: Regime
    score: float  # 0-100
    locked: bool  # True -> hiçbir alım sinyali üretilmez (Hard Stop)
    btc_close: float = float("nan")
    btc_sma_fast: float = float("nan")
    btc_sma_slow: float = float("nan")
    btc_dom_slope: float = float("nan")  # >0 BTC.D yükseliyor
    usdt_dom_slope: float = float("nan")  # >0 USDT.D yükseliyor (risk-off)
    total3_slope: float = float("nan")
    total3_change_24h: float = float("nan")
    btc_dom_now: float | None = None
    usdt_dom_now: float | None = None
    notes: list[str] = field(default_factory=list)


@dataclass
class Gate:
    """Kesişim (confluence) şartı. Biri bile geçmezse sinyal yoktur."""

    name: str
    passed: bool
    detail: str = ""


@dataclass
class PatternMatch:
    name: str
    breakout_level: float  # kırılan seviye (boyun çizgisi, trend çizgisi...)
    breakout_age: int | None  # kırılım kaç bar önce (0 = son kapanan mum); None = kırılmadı
    invalidation: float  # formasyonun geçersizleştiği fiyat (stop adayı)
    height: float  # ölçülen hareket (hedef için)
    quality: float  # 0-1
    bullish: bool = True
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def broken(self) -> bool:
        return self.breakout_age is not None


@dataclass
class OrderBookStats:
    mid: float
    spread_pct: float
    bid_depth_usd: float
    ask_depth_usd: float
    buy_slippage_pct: float
    wall_price: float | None = None
    wall_usd: float | None = None
    wall_persistence: float | None = None  # 1 = duvar tüm görüntülerde aynen duruyor
    spoof_detected: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def depth_ratio(self) -> float:
        return self.bid_depth_usd / self.ask_depth_usd if self.ask_depth_usd > 0 else float("inf")


@dataclass
class TradeTapeStats:
    """Son işlemlerin dağılımı (sahte hacim analizi)."""

    n_trades: int
    hhi: float
    top1pct_share: float
    repeat_size_share: float  # en sık görülen tek işlem miktarının payı
    buy_ratio: float
    ping_pong_share: float = 0.0


@dataclass
class DerivativesStats:
    funding_rate: float | None
    oi_change: float | None  # son ~7 günde OI % değişimi
    notes: list[str] = field(default_factory=list)


@dataclass
class ManipulationReport:
    body_ratio: float
    upper_wick_ratio: float
    close_position: float
    candle_ok: bool
    sweep_detected: bool
    wash_risk: float  # 0-1
    derivatives_trap: bool
    spot_led: bool
    spoof_detected: bool
    trap_risk: float  # 0-1 (birleşik)
    notes: list[str] = field(default_factory=list)


@dataclass
class TradePlan:
    entry_ref: float
    buy_zone: tuple[float, float]
    tranches: list[tuple[float, float]]  # (fiyat, ağırlık)
    avg_entry: float
    stop: float
    risk_pct: float
    targets: list[tuple[str, float, float]]  # (etiket, fiyat, R katı)
    rr_ok: bool


@dataclass
class MarketData:
    """Bir sembol için toplanan ham veri. Eksik alanlar None olabilir."""

    symbol: str
    exchange: str
    daily: pd.DataFrame  # sadece KAPANMIŞ günlük mumlar
    quote_volume_24h: float
    last_price: float
    order_books: list[dict[str, Any]] | None = None
    trades: list[dict[str, Any]] | None = None
    funding_rate: float | None = None
    oi_history: list[float] | None = None
    derivatives_listed: bool = False


@dataclass
class Signal:
    symbol: str
    exchange: str
    price: float
    score: float
    base_score: float
    components: dict[str, float]
    patterns: list[PatternMatch]
    gates: list[Gate]
    manipulation: ManipulationReport | None
    plan: TradePlan | None
    ma200_distance: float
    volume_mult: float
    rsi: float
    quote_volume_24h: float
    liquidity: OrderBookStats | None
    timestamp: pd.Timestamp

    @property
    def passed(self) -> bool:
        return all(g.passed for g in self.gates)

    @property
    def failed_gates(self) -> list[Gate]:
        return [g for g in self.gates if not g.passed]

    @property
    def pattern_label(self) -> str:
        names = [p.name for p in self.patterns if p.broken and p.bullish]
        return " + ".join(names + ["MA200 Kırılımı"]) if names else "—"
