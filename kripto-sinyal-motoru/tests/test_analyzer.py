import copy

import numpy as np
import pandas as pd
import pytest

from breakout_engine.analyzer import SignalAnalyzer
from breakout_engine.backtest import summarize, walk_forward
from breakout_engine.config import EngineConfig
from breakout_engine.models import DerivativesStats, MacroState, MarketData, Regime
from breakout_engine.report import telegram_message, to_dict
from synthetic import accumulation_breakout, order_book

RISK_ON = MacroState(Regime.RISK_ON, 80.0, False)
COOL_FUNDING = DerivativesStats(0.0001, 0.05)


def _md(df: pd.DataFrame, books=None, qv: float = 20e6) -> MarketData:
    last = float(df["close"].iloc[-1])
    return MarketData("TEST/USDT", "binance", df, qv, last,
                      order_books=books if books is not None else [order_book(last)] * 3)


@pytest.fixture
def analyzer() -> SignalAnalyzer:
    return SignalAnalyzer(EngineConfig())


def test_ideal_setup_produces_signal(analyzer):
    sig = analyzer.analyze(_md(accumulation_breakout(5)), RISK_ON, COOL_FUNDING)
    assert sig.passed, [(g.name, g.detail) for g in sig.failed_gates]
    assert sig.score >= 85
    p = sig.plan
    assert p.stop < p.buy_zone[0] < p.buy_zone[1] <= sig.price
    assert all(t[1] > p.avg_entry for t in p.targets)
    assert "MA200" in sig.pattern_label
    assert to_dict(sig)["plan"]["stop"] == p.stop
    assert "Stop" in telegram_message(sig)


def test_macro_lock_is_hard_stop(analyzer):
    locked = MacroState(Regime.RISK_OFF, 30.0, True)
    sig = analyzer.analyze(_md(accumulation_breakout(5)), locked, COOL_FUNDING)
    assert not sig.passed and "Makro Kilit" in [g.name for g in sig.failed_gates]


@pytest.mark.parametrize(
    "mutate, gate",
    [
        (lambda md, d: setattr(md, "quote_volume_24h", 2e6), "Likidite (24s hacim)"),
        (lambda md, d: setattr(md, "order_books", None), "Emir Defteri Derinliği"),
    ],
)
def test_liquidity_gates(analyzer, mutate, gate):
    md = _md(accumulation_breakout(5))
    mutate(md, None)
    sig = analyzer.analyze(md, RISK_ON, COOL_FUNDING)
    assert gate in [g.name for g in sig.failed_gates]


def test_hot_funding_rejected(analyzer):
    sig = analyzer.analyze(_md(accumulation_breakout(5)), RISK_ON, DerivativesStats(0.0009, 0.1))
    assert "Türev Tuzağı Yok" in [g.name for g in sig.failed_gates]


def test_long_upper_wick_rejected(analyzer):
    df = accumulation_breakout(5).copy()
    i = df.index[-1]
    df.loc[i, "high"] = df.loc[i, "close"] * 1.08
    sig = analyzer.analyze(_md(df), RISK_ON, COOL_FUNDING)
    assert "Mum Anatomisi (gövde ≥%75)" in [g.name for g in sig.failed_gates]


def test_wash_volume_rejected(analyzer):
    df = accumulation_breakout(5).copy()
    i = df.index[-1]
    df.loc[i, "trades"] = df["trades"].iloc[-21:-1].mean()
    sig = analyzer.analyze(_md(df), RISK_ON, COOL_FUNDING)
    assert "Sahte Hacim Filtresi" in [g.name for g in sig.failed_gates]


def test_low_volume_breakout_rejected(analyzer):
    df = accumulation_breakout(5).copy()
    i = df.index[-1]
    for col in ("volume", "quote_volume", "trades", "taker_buy_quote"):
        df.loc[i, col] = df.loc[i, col] / 3
    sig = analyzer.analyze(_md(df), RISK_ON, COOL_FUNDING)
    assert "Hacim Anomalisi" in [g.name for g in sig.failed_gates]


def test_spoof_wall_rejected(analyzer):
    df = accumulation_breakout(5)
    last = float(df["close"].iloc[-1])
    books = [order_book(last, wall=900_000), order_book(last), order_book(last)]
    sig = analyzer.analyze(_md(df, books), RISK_ON, COOL_FUNDING)
    assert "Spoofing Yok" in [g.name for g in sig.failed_gates]


def test_no_signal_in_downtrend(analyzer):
    rng = np.random.default_rng(3)
    closes = np.geomspace(10, 1, 400) * (1 + rng.normal(0, 0.01, 400))
    df = accumulation_breakout(5).iloc[:400].copy()
    df["close"] = closes
    df["open"] = np.r_[closes[0], closes[:-1]]
    df["high"] = df[["open", "close"]].max(axis=1) * 1.01
    df["low"] = df[["open", "close"]].min(axis=1) * 0.99
    sig = analyzer.analyze(_md(df), RISK_ON, COOL_FUNDING)
    assert not sig.passed


def test_backtest_walk_forward_matches_live():
    df = accumulation_breakout(5).copy()
    rng = np.random.default_rng(1)
    last = float(df["close"].iloc[-1])
    for _ in range(60):
        o, c = last, last * (1 + rng.normal(0.006, 0.02))
        df.loc[df.index[-1] + pd.Timedelta(days=1)] = {
            "open": o, "close": c, "high": max(o, c) * 1.01, "low": min(o, c) * 0.99, "volume": 1.5e6,
            "quote_volume": 1.5e6 * c, "trades": 1.5e6 * c / 300, "taker_buy_quote": 0.75e6 * c}
        last = c
    trades = walk_forward(df, EngineConfig(), fixed_macro=RISK_ON)
    assert len(trades) == 1
    assert trades[0].date == accumulation_breakout(5).index[-1]
    assert summarize(trades)["islem"] == 1


def test_config_override(tmp_path):
    from breakout_engine.config import load_config

    p = tmp_path / "c.json"
    p.write_text('{"setup": {"rsi_max": 60}, "scoring": {"min_score": 90}}', encoding="utf-8")
    cfg = load_config(p)
    assert cfg.setup.rsi_max == 60 and cfg.scoring.min_score == 90
    bad = tmp_path / "bad.json"
    bad.write_text('{"setup": {"yok": 1}}', encoding="utf-8")
    with pytest.raises(KeyError):
        load_config(bad)
    assert copy.deepcopy(cfg).to_dict()["setup"]["rsi_max"] == 60
