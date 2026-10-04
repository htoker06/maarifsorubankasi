import numpy as np
import pandas as pd

from breakout_engine import indicators as ind
from breakout_engine.config import EngineConfig
from synthetic import accumulation_breakout


def test_rsi_bounds_and_extremes():
    up = pd.Series(np.arange(1, 60, dtype=float))
    assert ind.rsi(up).iloc[-1] == 100.0
    rng = np.random.default_rng(0)
    s = pd.Series(100 + rng.normal(0, 1, 300).cumsum())
    r = ind.rsi(s).dropna()
    assert ((r >= 0) & (r <= 100)).all()


def test_percentile_rank():
    s = pd.Series(np.r_[np.linspace(10, 1, 100), [0.5]])
    assert ind.percentile_rank(s, 100).iloc[-1] == 0.0


def test_indicators_have_no_lookahead():
    """t anındaki indikatör değeri, sonraki veriler eklendiğinde değişmemeli."""
    cfg = EngineConfig()
    df = accumulation_breakout(5)
    full = ind.add_indicators(df, cfg.setup, cfg.risk, cfg.smart_money)
    part = ind.add_indicators(df.iloc[:450], cfg.setup, cfg.risk, cfg.smart_money)
    cols = ["sma200", "ema200", "rsi", "macd", "bbw", "bbw_rank", "atr", "cmf", "vwap", "vol_mult"]
    pd.testing.assert_frame_equal(full[cols].iloc[:450], part[cols], check_exact=False, rtol=1e-9)
