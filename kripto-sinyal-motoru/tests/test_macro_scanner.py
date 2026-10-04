import asyncio

import numpy as np
import pandas as pd

from breakout_engine import scanner as scanner_mod
from breakout_engine.config import EngineConfig, MacroConfig
from breakout_engine.macro import build_proxy_indices, evaluate_regime
from breakout_engine.models import DerivativesStats, Regime
from synthetic import accumulation_breakout, order_book

IDX = pd.date_range("2025-01-01", periods=300, freq="D", tz="UTC")


def _ohlc(closes: np.ndarray, index: pd.DatetimeIndex | None = None) -> pd.DataFrame:
    return pd.DataFrame({"open": closes, "high": closes * 1.01, "low": closes * 0.99, "close": closes,
                         "volume": 1.0}, index=IDX[: len(closes)] if index is None else index)


def test_proxy_indices():
    closes = {"BTC": pd.Series(np.linspace(50, 100, 300), IDX),
              "ETH": pd.Series(np.linspace(2, 3, 300), IDX),
              "SOL": pd.Series(np.linspace(100, 300, 300), IDX)}
    caps = {"BTC": 2000.0, "ETH": 400.0, "SOL": 100.0}
    out = build_proxy_indices(closes, caps, {"USDT": 150.0})
    assert out["total"].iloc[-1] == 2000 + 400 + 100 + 150
    assert 0 < out["btc_d"].iloc[-1] < 1
    assert out["usdt_d"].iloc[0] > out["usdt_d"].iloc[-1]  # piyasa büyüdükçe USDT.D düşer


def test_regime_risk_on_and_lock():
    cfg = MacroConfig()
    up = _ohlc(np.geomspace(30_000, 90_000, 300))
    alts = {"BTC": up["close"], "ETH": pd.Series(np.geomspace(1000, 4000, 300), IDX)}
    idx_up = build_proxy_indices(alts, {"BTC": 1500.0, "ETH": 400.0}, {"USDT": 150.0})
    state = evaluate_regime(up, idx_up, cfg)
    assert state.regime == Regime.RISK_ON and not state.locked

    down = _ohlc(np.geomspace(90_000, 40_000, 300))
    alts = {"BTC": down["close"], "ETH": pd.Series(np.geomspace(4000, 1200, 300), IDX)}
    idx_dn = build_proxy_indices(alts, {"BTC": 900.0, "ETH": 150.0}, {"USDT": 150.0})
    state = evaluate_regime(down, idx_dn, cfg)
    assert state.locked and state.regime == Regime.RISK_OFF


class FakeCG:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def global_snapshot(self):
        return {"market_cap_change_percentage_24h_usd": 1.2, "market_cap_percentage": {"btc": 55.0, "usdt": 4.5}}

    async def market_caps(self, n=100):
        return {"BTC": 1.5e12, "ETH": 4e11, "USDT": 1.5e11, "TEST": 1e9}


class FakeSpot:
    markets = {"BTC/USDT": {}, "ETH/USDT": {}, "TEST/USDT": {}, "DEAD/USDT": {}}


class FakeExchange:
    name = "fake"
    spot = FakeSpot()

    def __init__(self):
        n = len(accumulation_breakout(5))
        idx = accumulation_breakout(5).index
        self.frames = {
            "BTC/USDT": _ohlc(np.geomspace(30_000, 90_000, n), idx),
            "ETH/USDT": _ohlc(np.geomspace(1_000, 4_000, n), idx),
            "TEST/USDT": accumulation_breakout(5),
            "DEAD/USDT": accumulation_breakout(5).iloc[:-1],  # kırılım yok
        }
        self.book_calls = []

    async def daily(self, symbol, days=None):
        return self.frames[symbol]

    async def universe(self, min_qv):
        return [("TEST/USDT", 20e6, float(self.frames["TEST/USDT"]["close"].iloc[-1])),
                ("DEAD/USDT", 30e6, 1.0)]

    async def order_books(self, symbol, n, interval):
        self.book_calls.append(symbol)
        return [order_book(float(self.frames[symbol]["close"].iloc[-1]))] * n

    async def trades(self, symbol):
        rng = np.random.default_rng(0)
        return [{"price": 1.0, "amount": float(a), "side": "buy" if i % 2 else "sell"}
                for i, a in enumerate(rng.lognormal(3, 1, 1000))]

    async def derivatives(self, base):
        return DerivativesStats(0.0001, 0.05)


def test_scanner_end_to_end(monkeypatch):
    monkeypatch.setattr(scanner_mod, "CoinGeckoClient", FakeCG)
    ex = FakeExchange()
    result = asyncio.run(scanner_mod.BreakoutScanner(EngineConfig()).run_once(ex))
    assert result.macro.regime == Regime.RISK_ON
    assert result.scanned == 2
    assert ex.book_calls == ["TEST/USDT"]  # ağır veriler yalnızca aşama-1'i geçene çekilir
    assert [s.symbol for s in result.signals] == ["TEST/USDT"]
