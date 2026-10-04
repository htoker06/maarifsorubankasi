import numpy as np
import pandas as pd

from breakout_engine.config import LiquidityConfig, ManipulationConfig
from breakout_engine.manipulation import (
    candle_ok, derivatives_check, kline_wash_risk, liquidity_sweep, order_book_stats,
    tape_wash_risk, trade_tape_stats,
)
from breakout_engine.models import DerivativesStats
from synthetic import accumulation_breakout, order_book

MC = ManipulationConfig()
LQ = LiquidityConfig()


def test_candle_anatomy_rejects_upper_wick():
    good = pd.Series({"open": 1.0, "close": 1.10, "high": 1.104, "low": 0.998})
    shooting_star = pd.Series({"open": 1.0, "close": 1.05, "high": 1.20, "low": 0.99})
    assert candle_ok(good, MC)[0]
    ok, notes = candle_ok(shooting_star, MC)
    assert not ok and any("fitil" in n for n in notes)


def test_kline_wash_risk_flags_volume_without_trades():
    df = accumulation_breakout(5)
    idx = len(df) - 1
    assert kline_wash_risk(df, idx, MC)[0] == 0.0
    fake = df.copy()
    fake.iloc[idx, fake.columns.get_loc("trades")] = fake["trades"].iloc[idx - 20 : idx].mean()  # işlem sayısı sabit
    risk, notes = kline_wash_risk(fake, idx, MC)
    assert risk >= MC.max_wash_risk and notes


def test_trade_tape_detects_bot_like_repeats():
    rng = np.random.default_rng(1)
    organic = [{"price": 1.0, "amount": float(a), "side": "buy" if i % 3 else "sell"}
               for i, a in enumerate(rng.lognormal(3, 1, 1000))]
    bot = [{"price": 1.0, "amount": 500.0, "side": "buy" if i % 2 else "sell"} for i in range(600)] + organic[:400]
    assert tape_wash_risk(trade_tape_stats(organic), MC)[0] < MC.max_wash_risk
    risk, notes = tape_wash_risk(trade_tape_stats(bot), MC)
    assert risk >= MC.max_wash_risk and any("tekrar" in n for n in notes)


def test_liquidity_sweep_detected():
    df = accumulation_breakout(5).copy()
    k = len(df) - 6
    support = df["low"].iloc[k - 30 : k].min()
    df.iloc[k, df.columns.get_loc("low")] = support * 0.95
    df.iloc[k, df.columns.get_loc("open")] = support * 1.03
    df.iloc[k, df.columns.get_loc("close")] = support * 1.035
    df.iloc[k, df.columns.get_loc("high")] = support * 1.04
    assert liquidity_sweep(df, len(df) - 1, MC)


def test_funding_trap():
    assert derivatives_check(DerivativesStats(0.0001, 0.05), MC)[0] is False
    assert derivatives_check(DerivativesStats(0.0008, 0.05), MC)[0] is True
    assert derivatives_check(DerivativesStats(0.0004, 0.60), MC)[0] is True  # OI patlaması + ısınan fonlama
    assert derivatives_check(None, MC)[0] is None


def test_spoofing_wall_with_empty_bids():
    clean = order_book_stats([order_book(1.0)] * 3, LQ, MC)
    assert clean is not None and not clean.spoof_detected and clean.spread_pct < 0.002
    wall_book = order_book(1.0, wall=800_000)
    wall_book["bids"] = [[p, a * 0.2] for p, a in wall_book["bids"]]  # alış tarafı boş
    spoof = order_book_stats([wall_book] * 3, LQ, MC)
    assert spoof.spoof_detected and spoof.wall_price is not None


def test_spoofing_vanishing_wall():
    books = [order_book(1.0, wall=800_000), order_book(1.0), order_book(1.0)]
    stats = order_book_stats(books, LQ, MC)
    assert stats.spoof_detected and stats.wall_persistence < MC.wall_vanish_ratio
