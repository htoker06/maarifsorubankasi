"""Mobil (JavaScript) motorun Python motoruyla aynı sonucu verdiğini doğrulamak için test verisi üretir.

    python tests/export_js_fixtures.py     ->  mobil/test/fixtures.json
    node --test mobil/test/                ->  karşılaştırma
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

from breakout_engine.analyzer import SignalAnalyzer  # noqa: E402
from breakout_engine.config import EngineConfig  # noqa: E402
from breakout_engine.indicators import add_indicators  # noqa: E402
from breakout_engine.macro import build_proxy_indices, evaluate_regime  # noqa: E402
from breakout_engine.models import DerivativesStats, MacroState, MarketData, Regime  # noqa: E402
from synthetic import accumulation_breakout, order_book  # noqa: E402

COLS = ["open", "high", "low", "close", "volume", "quote_volume", "trades", "taker_buy_quote"]


def clean(x):
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, (np.floating,)):
        return clean(float(x))
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    return x


def frame(df: pd.DataFrame) -> dict:
    out = {c: [float(v) for v in df[c]] for c in COLS}
    out["time"] = [int(t.value // 1_000_000) for t in df.index]
    return out


def trades(seed: int, bot: bool = False) -> list[dict]:
    rng = np.random.default_rng(seed)
    rows = [{"price": 1.0, "amount": float(a), "side": "buy" if i % 3 else "sell"}
            for i, a in enumerate(rng.lognormal(3, 1, 1000))]
    if bot:
        rows = [{"price": 1.0, "amount": 500.0, "side": "buy" if i % 2 else "sell"} for i in range(600)] + rows[:400]
    return rows


def case(name, df, macro, deriv, books, tr=None, qv=20e6):
    last = float(df["close"].iloc[-1])
    md = MarketData("TEST/USDT", "binance", df, qv, last, order_books=books, trades=tr)
    sig = SignalAnalyzer(EngineConfig()).analyze(md, macro, deriv)
    return {
        "name": name,
        "md": {"symbol": "TEST/USDT", "exchange": "binance", "daily": frame(df), "quote_volume_24h": qv,
               "last_price": last, "order_books": books, "trades": tr},
        "macro": {"regime": macro.regime.value, "score": macro.score, "locked": macro.locked},
        "deriv": None if deriv is None else {"funding_rate": deriv.funding_rate, "oi_change": deriv.oi_change},
        "expected": {
            "gates": [[g.name, g.passed] for g in sig.gates],
            "score": sig.score,
            "base_score": sig.base_score,
            "components": sig.components,
            "patterns": [[p.name, p.breakout_age, p.quality] for p in sig.patterns],
            "stop": sig.plan.stop if sig.plan else None,
            "targets": [[l, p] for l, p, _ in sig.plan.targets] if sig.plan else None,
            "trap_risk": sig.manipulation.trap_risk if sig.manipulation else None,
            "passed": sig.passed,
        },
    }


def main() -> None:
    risk_on = MacroState(Regime.RISK_ON, 80.0, False)
    cool = DerivativesStats(0.0001, 0.05)
    cases = []
    for seed in range(1, 9):
        df = accumulation_breakout(seed)
        last = float(df["close"].iloc[-1])
        cases.append(case(f"seed{seed}", df, risk_on, cool, [order_book(last)] * 3, trades(seed)))
    df = accumulation_breakout(5)
    last = float(df["close"].iloc[-1])
    wick = df.copy()
    wick.loc[wick.index[-1], "high"] = wick["close"].iloc[-1] * 1.08
    cases.append(case("wick", wick, risk_on, cool, [order_book(last)] * 3))
    wash = df.copy()
    wash.loc[wash.index[-1], "trades"] = wash["trades"].iloc[-21:-1].mean()
    cases.append(case("wash", wash, risk_on, cool, [order_book(last)] * 3))
    cases.append(case("botTape", df, risk_on, cool, [order_book(last)] * 3, trades(1, bot=True)))
    cases.append(case("spoof", df, risk_on, cool, [order_book(last, wall=900_000), order_book(last), order_book(last)]))
    cases.append(case("hotFunding", df, risk_on, DerivativesStats(0.0009, 0.1), [order_book(last)] * 3))
    cases.append(case("locked", df, MacroState(Regime.RISK_OFF, 30.0, True), cool, [order_book(last)] * 3))
    cases.append(case("noBook", df, risk_on, None, []))
    for k in (450, 520, 560, 575):  # kırılım öncesi (sinyal olmamalı) ara günler
        sub = df.iloc[:k]
        cases.append(case(f"prefix{k}", sub, risk_on, cool, [order_book(float(sub['close'].iloc[-1]))] * 3))

    cfg = EngineConfig()
    ind = add_indicators(df, cfg.setup, cfg.risk, cfg.smart_money)
    indicators = {c: [None if not math.isfinite(v) else float(v) for v in ind[c]]
                  for c in ["sma200", "ema200", "rsi", "macd", "signal", "hist", "bbw", "bbw_rank", "atr", "obv",
                            "cmf", "vwap", "vol_avg", "vol_mult"]}

    # Makro
    idx = pd.date_range("2025-01-01", periods=300, freq="D", tz="UTC")
    btc = np.geomspace(30_000, 90_000, 300)
    eth = np.geomspace(1000, 4000, 300)
    sol = np.geomspace(100, 80, 300)
    closes = {"BTC": pd.Series(btc, idx), "ETH": pd.Series(eth, idx), "SOL": pd.Series(sol, idx)}
    caps = {"BTC": 1500.0, "ETH": 400.0, "SOL": 60.0}
    stables = {"USDT": 150.0, "USDC": 50.0}
    ind_m = build_proxy_indices(closes, caps, stables)
    btc_df = pd.DataFrame({"close": btc, "open": btc, "high": btc, "low": btc}, index=idx)
    state = evaluate_regime(btc_df, ind_m, cfg.macro)
    macro = {
        "closes": {k: {"times": [int(t.value // 1_000_000) for t in idx], "close": [float(x) for x in v]}
                   for k, v in closes.items()},
        "caps": caps, "stables": stables,
        "expected": {"score": state.score, "locked": state.locked, "regime": state.regime.value,
                     "btc_dom_slope": state.btc_dom_slope, "usdt_dom_slope": state.usdt_dom_slope,
                     "total3_slope": state.total3_slope,
                     "total3_last": float(ind_m["total3"].iloc[-1]), "btc_d_last": float(ind_m["btc_d"].iloc[-1])},
    }
    out = ROOT / "mobil" / "test" / "fixtures.json"
    out.write_text(json.dumps(clean({"cases": cases, "indicators": {"daily": frame(df), "expected": indicators},
                                     "macro": macro})), encoding="utf-8")
    print(f"{len(cases)} senaryo -> {out}")


if __name__ == "__main__":
    main()
