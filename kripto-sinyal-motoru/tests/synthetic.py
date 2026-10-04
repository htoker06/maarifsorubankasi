"""Testler için deterministik sentetik piyasa verisi."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _candles(closes: np.ndarray, rng: np.random.Generator, wick: float = 0.012) -> pd.DataFrame:
    opens = np.r_[closes[0], closes[:-1]]
    hi = np.maximum(opens, closes) * (1 + rng.uniform(0.002, wick, len(closes)))
    lo = np.minimum(opens, closes) * (1 - rng.uniform(0.002, wick, len(closes)))
    vol = rng.uniform(0.8, 1.2, len(closes)) * 1_000_000
    idx = pd.date_range("2024-01-01", periods=len(closes), freq="D", tz="UTC")
    df = pd.DataFrame({"open": opens, "high": hi, "low": lo, "close": closes, "volume": vol}, index=idx)
    df["quote_volume"] = df["volume"] * df["close"]
    df["trades"] = (df["quote_volume"] / 300.0).round()
    df["taker_buy_quote"] = df["quote_volume"] * rng.uniform(0.47, 0.53, len(closes))
    return df


def accumulation_breakout(seed: int = 7) -> pd.DataFrame:
    """ATH'den ~%85 düşüş -> uzun dar taban (ikili dip) -> hacimli, gövdeli kırılım."""
    rng = np.random.default_rng(seed)
    decline = np.geomspace(10.0, 1.6, 300) * (1 + rng.normal(0, 0.01, 300))
    t = np.arange(280)
    # Taban: 1.45-1.75 arası salınım, iki belirgin dip, en sonda hafif geri çekilme.
    base = 1.60 + 0.10 * np.sin(t / 9.0) * np.exp(-t / 400)
    base[90:110] = np.linspace(base[89], 1.42, 20)
    base[110:130] = np.linspace(1.42, 1.66, 20)
    base[200:225] = np.linspace(base[199], 1.43, 25)
    base[225:250] = np.linspace(1.43, 1.62, 25)
    base[250:272] = np.linspace(1.62, 1.50, 22)
    base[272:280] = np.linspace(1.50, 1.58, 8)
    base *= 1 + rng.normal(0, 0.012, len(base))
    closes = np.r_[decline, base]
    df = _candles(closes, rng)
    # Kırılım mumu: güçlü gövde, 4x hacim, işlem sayısı da artıyor, alıcı baskın.
    prev = float(df["close"].iloc[-1])
    row = {"open": prev * 1.002, "close": prev * 1.075}
    row["high"] = row["close"] * 1.004
    row["low"] = row["open"] * 0.996
    row["volume"] = 4_200_000.0
    row["quote_volume"] = row["volume"] * row["close"]
    row["trades"] = round(row["quote_volume"] / 320.0)
    row["taker_buy_quote"] = row["quote_volume"] * 0.64
    df.loc[df.index[-1] + pd.Timedelta(days=1)] = row
    return df


def order_book(mid: float, depth_usd: float = 400_000, levels: int = 60, wall: float | None = None) -> dict:
    step = mid * 0.0005
    per = depth_usd / levels
    bids = [[mid - step * (i + 1), per / (mid - step * (i + 1))] for i in range(levels)]
    asks = [[mid + step * (i + 1), per / (mid + step * (i + 1))] for i in range(levels)]
    if wall is not None:
        asks[10][1] += wall / asks[10][0]
    return {"bids": bids, "asks": asks}
