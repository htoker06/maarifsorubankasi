"""Motorun tüm eşik değerleri tek yerde.

İki prompttaki çakışan değerler burada tek bir değere indirildi:
- RSI bandı: 50-68 ve 50-65 verilmişti; daha sıkı olan 50-65 seçildi.
- Hacim çarpanı: kırılım mumu için 2.5x (20 gün), POC geçişi için 3x (30 gün).
- Fonlama oranı sınırı: her iki promptta da %0.05 (0.0005).
- Likidite: 24s spot hacim >= 5.000.000 USD.

Değerler bir JSON dosyasıyla ezilebilir (bkz. ``load_config``).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any


@dataclass
class ExchangeConfig:
    exchange_id: str = "binance"  # spot borsa (ccxt id)
    derivatives_id: str | None = "binanceusdm"  # vadeli borsa; None = türev kontrolü yok
    quote: str = "USDT"
    max_concurrency: int = 8
    max_retries: int = 4
    timeout_ms: int = 20_000
    history_days: int = 1000  # ATH ve MA200 için gereken günlük geçmiş
    excluded_bases: tuple[str, ...] = (
        "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDD", "EUR", "TRY",
        "AEUR", "EURI", "USD1", "PAXG", "WBTC", "WBETH", "BFUSD", "XUSD",
    )


@dataclass
class MacroConfig:
    """Piyasa rejimi (sistem kilidi)."""

    index_components: int = 20  # TOTAL endeksi için en büyük N coin
    ema_fast: int = 20
    ema_slow: int = 50
    slope_lookback: int = 5  # EMA eğimi için gün
    btc_ma_fast: int = 50
    btc_ma_slow: int = 200
    risk_on_threshold: float = 65.0  # makro skor >= bu -> RISK_ON
    risk_off_threshold: float = 40.0  # makro skor < bu -> RISK_OFF (kilit)


@dataclass
class LiquidityConfig:
    min_quote_volume_24h: float = 5_000_000.0
    depth_pct: float = 0.02  # +/- %2 derinlik
    min_depth_usd_each_side: float = 50_000.0
    max_spread_pct: float = 0.002  # %0.2
    max_slippage_pct: float = 0.005  # 10k USD piyasa emrinde kabul edilen kayma
    slippage_probe_usd: float = 10_000.0


@dataclass
class SetupConfig:
    """Akümülasyon ve kırılım şartları."""

    min_history_bars: int = 260
    ath_min_drawdown: float = 0.70  # ATH'den en az %70 düşüş (taban dibine göre)
    require_ath_drawdown: bool = True
    bb_period: int = 20
    bb_std: float = 2.0
    bbw_percentile_lookback: int = 365
    bbw_max_percentile: float = 0.15  # tarihsel en dar %15
    squeeze_window: int = 90  # sıkışmanın aranacağı pencere (30-90 gün)
    base_min_days: int = 30
    base_max_days: int = 180
    base_max_range: float = 0.60  # taban bandı: tepe/dip - 1 en fazla %60
    ma_period: int = 200
    ma_cross_max_age: int = 5  # MA200 kesişimi son 1-5 gün içinde
    ma_hold_bars: int = 1  # MA200 üstünde en az 1 günlük kapanış
    max_extension_above_ma: float = 0.25  # MA200'den %25'ten fazla uzaklaşmışsa geç kalınmış
    breakout_max_age: int = 3  # formasyon kırılımı en fazla 3 gün önce
    rsi_period: int = 14
    rsi_min: float = 50.0
    rsi_max: float = 65.0
    # Güçlü gövdeli ve 2.5x hacimli kırılım mumu RSI'ı tek günde 65'in üstüne itebilir.
    # Kırılım GÜNÜ Prompt 1'deki 68 sınırı, sonraki günlerde Prompt 2'deki 65 sınırı geçerli.
    rsi_breakout_day_max: float = 68.0
    macd_zero_cross_lookback: int = 10
    volume_avg_period: int = 20
    volume_spike_mult: float = 2.5
    vwap_period: int = 20


@dataclass
class PatternConfig:
    pivot_left: int = 5
    pivot_right: int = 5
    pattern_lookback: int = 180
    bottom_tolerance: float = 0.05  # ikili/üçlü dipte dipler arası fark
    min_bottom_separation: int = 10
    shoulder_tolerance: float = 0.12
    min_head_depth: float = 0.05  # baş, omuzlardan en az %5 derin
    wedge_min_touches: int = 2
    rounding_min_r2: float = 0.60
    trendline_lookback: int = 90
    donchian_period: int = 90


@dataclass
class ManipulationConfig:
    """Anti-manipülasyon kalkanı."""

    min_body_ratio: float = 0.75  # kırılım mumunun en az %75'i gövde
    max_upper_wick_ratio: float = 0.15
    close_position_min: float = 0.80  # kapanış mum aralığının üst %20'sinde
    sweep_lookback: int = 20
    sweep_min_lower_wick: float = 0.45
    # Sahte hacim
    trade_size_spike_max: float = 3.0  # ortalama işlem büyüklüğü medyanın 3 katını aşamaz
    min_trades_growth: float = 1.5  # hacim 2.5x iken işlem sayısı en az 1.5x artmalı
    max_trade_hhi: float = 0.05  # işlem tutarı Herfindahl endeksi
    max_top1pct_share: float = 0.35  # en büyük %1 işlemin hacim payı
    max_repeat_size_share: float = 0.20  # tek bir işlem miktarının tüm işlemlere oranı
    max_ping_pong_share: float = 0.15  # aynı miktarla art arda ters yönlü işlemler
    max_wash_risk: float = 0.45
    # Türev
    max_funding_rate: float = 0.0005  # %0.05
    max_oi_growth_with_hot_funding: float = 0.25
    min_taker_buy_ratio: float = 0.52  # kırılım mumunda spot alıcı baskısı
    # Spoofing
    wall_mult: float = 8.0  # tek seviye, medyan seviyenin 8 katı -> duvar
    min_bid_ask_depth_ratio: float = 0.40
    book_snapshots: int = 3
    book_snapshot_interval_s: float = 2.0
    wall_vanish_ratio: float = 0.30  # duvarın %70'i kaybolursa spoof
    max_trap_risk: float = 0.40
    strict_missing_data: bool = True  # veri yoksa reddet (sıfır tolerans)


@dataclass
class SmartMoneyConfig:
    divergence_window: int = 60
    cmf_period: int = 20
    profile_days: int = 180
    profile_bins: int = 60
    poc_volume_mult: float = 3.0
    poc_volume_avg_period: int = 30
    poc_cross_max_age: int = 5


@dataclass
class ScoringConfig:
    # Prompt 1'deki ağırlıklar korunarak Prompt 2'nin metrikleri içlerine yerleştirildi.
    w_volume: float = 0.30  # hacim + akıllı para (spike, POC, OBV/CMF, CVD)
    w_accumulation: float = 0.25  # konsolidasyon süresi, daralma, ATH düşüşü, formasyon kalitesi
    w_ma200: float = 0.20  # MA200 kırılım tazeliği / yakınlık
    w_momentum: float = 0.15  # RSI + MACD
    w_macro: float = 0.10  # BTC / BTC.D / TOTAL3
    trap_penalty: float = 0.50  # nihai = taban * (1 - trap_penalty * tuzak_riski)
    min_score: float = 85.0


@dataclass
class RiskConfig:
    atr_period: int = 14
    stop_buffer_atr: float = 0.25
    max_risk_pct: float = 0.15  # giriş-stop mesafesi %15'i geçemez
    tranche_weights: tuple[float, float, float] = (0.30, 0.40, 0.30)
    r_targets: tuple[float, ...] = (1.5, 3.0)
    min_rr_tp2: float = 2.0


@dataclass
class NotifyConfig:
    telegram_token: str | None = None
    telegram_chat_id: str | None = None
    cooldown_hours: float = 24.0
    state_file: str = ".breakout_state.json"


@dataclass
class EngineConfig:
    exchange: ExchangeConfig = field(default_factory=ExchangeConfig)
    macro: MacroConfig = field(default_factory=MacroConfig)
    liquidity: LiquidityConfig = field(default_factory=LiquidityConfig)
    setup: SetupConfig = field(default_factory=SetupConfig)
    pattern: PatternConfig = field(default_factory=PatternConfig)
    manipulation: ManipulationConfig = field(default_factory=ManipulationConfig)
    smart_money: SmartMoneyConfig = field(default_factory=SmartMoneyConfig)
    scoring: ScoringConfig = field(default_factory=ScoringConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    notify: NotifyConfig = field(default_factory=NotifyConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _merge(obj: Any, overrides: dict[str, Any]) -> Any:
    known = {f.name: f for f in fields(obj)}
    for key, value in overrides.items():
        if key not in known:
            raise KeyError(f"Bilinmeyen ayar: {type(obj).__name__}.{key}")
        current = getattr(obj, key)
        if is_dataclass(current) and isinstance(value, dict):
            _merge(current, value)
        elif isinstance(current, tuple) and isinstance(value, list):
            setattr(obj, key, tuple(value))
        else:
            setattr(obj, key, value)
    return obj


def load_config(path: str | Path | None = None) -> EngineConfig:
    """Varsayılan ayarları yükler; ``path`` verilirse JSON ile ezer.

    Telegram bilgileri ortam değişkenlerinden de okunur:
    ``TELEGRAM_BOT_TOKEN`` ve ``TELEGRAM_CHAT_ID``.
    """
    import os

    cfg = EngineConfig()
    if path:
        _merge(cfg, json.loads(Path(path).read_text(encoding="utf-8")))
    cfg.notify.telegram_token = cfg.notify.telegram_token or os.getenv("TELEGRAM_BOT_TOKEN")
    cfg.notify.telegram_chat_id = cfg.notify.telegram_chat_id or os.getenv("TELEGRAM_CHAT_ID")
    return cfg
