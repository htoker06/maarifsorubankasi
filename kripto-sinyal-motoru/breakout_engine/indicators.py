"""Vektörel indikatörler (pandas/numpy).

TA-Lib kuruluysa RSI/EMA/ATR/MACD onunla hesaplanır; değilse aynı formüllerin
pandas karşılıkları kullanılır. Tüm fonksiyonlar geleceğe bakmaz (look-ahead yok):
t anındaki değer yalnızca t ve öncesindeki verilerle hesaplanır.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

try:  # pragma: no cover - ortamda TA-Lib varsa
    import talib  # type: ignore

    HAS_TALIB = True
except Exception:  # pragma: no cover
    talib = None
    HAS_TALIB = False


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    if HAS_TALIB:
        return pd.Series(talib.EMA(s.to_numpy(dtype=float), timeperiod=n), index=s.index)
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def _wilder(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    if HAS_TALIB:
        return pd.Series(talib.RSI(close.to_numpy(dtype=float), timeperiod=n), index=close.index)
    delta = close.diff()
    gain = _wilder(delta.clip(lower=0.0), n)
    loss = _wilder((-delta).clip(lower=0.0), n)
    rs = gain / loss.replace(0.0, np.nan)
    out = 100.0 - 100.0 / (1.0 + rs)
    return out.where(loss != 0.0, 100.0).where(gain.notna())


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    line = ema(close, fast) - ema(close, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "signal": sig, "hist": line - sig})


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0) -> pd.DataFrame:
    mid = sma(close, n)
    std = close.rolling(n, min_periods=n).std(ddof=0)
    upper, lower = mid + k * std, mid - k * std
    return pd.DataFrame({"mid": mid, "upper": upper, "lower": lower, "bandwidth": (upper - lower) / mid})


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()], axis=1
    ).max(axis=1)
    return _wilder(tr, n)


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff()).fillna(0.0)
    return (direction * df["volume"]).cumsum()


def cmf(df: pd.DataFrame, n: int = 20) -> pd.Series:
    rng = (df["high"] - df["low"]).replace(0.0, np.nan)
    mfm = ((df["close"] - df["low"]) - (df["high"] - df["close"])) / rng
    mfv = mfm.fillna(0.0) * df["volume"]
    return mfv.rolling(n, min_periods=n).sum() / df["volume"].rolling(n, min_periods=n).sum()


def rolling_vwap(df: pd.DataFrame, n: int = 20) -> pd.Series:
    typical = (df["high"] + df["low"] + df["close"]) / 3.0
    pv = (typical * df["volume"]).rolling(n, min_periods=n).sum()
    return pv / df["volume"].rolling(n, min_periods=n).sum()


def percentile_rank(s: pd.Series, lookback: int) -> pd.Series:
    """Her değerin son ``lookback`` gün içindeki yüzdelik sırası (0-1)."""

    def _rank(window: np.ndarray) -> float:
        last = window[-1]
        valid = window[~np.isnan(window)]
        if np.isnan(last) or valid.size < 2:
            return np.nan
        return float((valid < last).sum()) / (valid.size - 1)

    return s.rolling(lookback, min_periods=max(30, lookback // 4)).apply(_rank, raw=True)


def normalized_slope(values: np.ndarray) -> float:
    """Lineer regresyon eğimi / ortalama -> bar başına yüzde değişim."""
    y = np.asarray(values, dtype=float)
    y = y[~np.isnan(y)]
    if y.size < 3:
        return float("nan")
    x = np.arange(y.size, dtype=float)
    slope = np.polyfit(x, y, 1)[0]
    denom = np.abs(y).mean()
    return float(slope / denom) if denom > 0 else 0.0


def ema_slope(s: pd.Series, n: int, lookback: int) -> float:
    """EMA(n)'in son ``lookback`` bardaki yüzde eğimi."""
    e = ema(s.dropna(), n).dropna()
    if len(e) <= lookback:
        return float("nan")
    return float(e.iloc[-1] / e.iloc[-1 - lookback] - 1.0)


def add_indicators(df: pd.DataFrame, setup, risk, smart) -> pd.DataFrame:
    """Tarayıcının ihtiyaç duyduğu tüm sütunları ekler (kopya üzerinde)."""
    out = df.copy()
    c = out["close"]
    out["sma200"] = sma(c, setup.ma_period)
    out["ema200"] = ema(c, setup.ma_period)
    out["rsi"] = rsi(c, setup.rsi_period)
    out = out.join(macd(c))
    bb = bollinger(c, setup.bb_period, setup.bb_std)
    out["bbw"] = bb["bandwidth"]
    out["bbw_rank"] = percentile_rank(out["bbw"], setup.bbw_percentile_lookback)
    out["atr"] = atr(out, risk.atr_period)
    out["obv"] = obv(out)
    out["cmf"] = cmf(out, smart.cmf_period)
    out["vwap"] = rolling_vwap(out, setup.vwap_period)
    # Hacim ortalaması mevcut barı içermez -> kırılım mumu kendi ortalamasını şişirmez.
    out["vol_avg"] = out["volume"].shift(1).rolling(setup.volume_avg_period).mean()
    out["vol_avg_poc"] = out["volume"].shift(1).rolling(smart.poc_volume_avg_period).mean()
    out["vol_mult"] = out["volume"] / out["vol_avg"]
    return out
