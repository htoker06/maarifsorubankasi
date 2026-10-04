import numpy as np
import pandas as pd

from breakout_engine.config import PatternConfig
from breakout_engine.patterns import PatternEngine, breakout_age, find_pivots


def _frame(closes: np.ndarray, wick: float = 0.01) -> pd.DataFrame:
    opens = np.r_[closes[0], closes[:-1]]
    return pd.DataFrame({
        "open": opens,
        "high": np.maximum(opens, closes) * (1 + wick),
        "low": np.minimum(opens, closes) * (1 - wick),
        "close": closes,
    })


def test_breakout_age_requires_hold():
    level = np.full(6, 10.0)
    assert breakout_age(np.array([9, 9, 9, 11, 12, 13.0]), level, 0) == 2
    assert breakout_age(np.array([9, 9, 11, 9, 9, 11.0]), level, 0) == 0
    assert breakout_age(np.array([9, 9, 11, 12, 9, 9.0]), level, 0) is None
    assert breakout_age(np.array([11, 11, 11, 11.0]), np.full(4, 10.0), 0) is None  # alttan geçiş yok


def test_pivots():
    x = np.array([1, 2, 3, 2, 1, 2, 5, 2, 1.0])
    assert list(find_pivots(x, 2, 2, "high")) == [2, 6]
    assert list(find_pivots(x, 2, 2, "low")) == [4]


def test_double_bottom_detected_and_broken():
    seg = lambda a, b, n: np.linspace(a, b, n)
    closes = np.r_[seg(2.0, 1.0, 30), seg(1.0, 1.4, 20), seg(1.4, 1.02, 20), seg(1.02, 1.38, 20), [1.50, 1.52]]
    pats = PatternEngine(PatternConfig()).detect(_frame(closes, 0.005))
    dbl = [p for p in pats if p.name in ("İkili Dip", "Üçlü Dip")]
    assert dbl, [p.name for p in pats]
    assert dbl[0].broken and dbl[0].breakout_age == 1
    assert abs(dbl[0].invalidation - 1.0) < 0.02


def test_inverse_head_shoulders():
    seg = lambda a, b, n: np.linspace(a, b, n)
    closes = np.r_[
        seg(2.0, 1.4, 20), seg(1.4, 1.2, 15),  # sol omuz dibi 1.2
        seg(1.2, 1.45, 12), seg(1.45, 1.0, 15),  # baş 1.0
        seg(1.0, 1.46, 15), seg(1.46, 1.22, 12),  # sağ omuz 1.22
        seg(1.22, 1.44, 12), [1.55],
    ]
    pats = PatternEngine(PatternConfig()).detect(_frame(closes, 0.005))
    tobo = [p for p in pats if p.name == "TOBO"]
    assert tobo and tobo[0].broken and tobo[0].breakout_age == 0
    assert 1.1 < tobo[0].invalidation < 1.3  # sağ omuz dibi


def test_falling_wedge_breakout():
    n = 120
    x = np.arange(n)
    upper = 2.0 - 0.008 * x
    lower = 1.5 - 0.004 * x
    phase = np.sin(x / 4.0)
    closes = lower + (upper - lower) * (0.5 + 0.48 * phase)
    closes = np.r_[closes, [upper[-1] * 1.12 + 0.01]]
    pats = PatternEngine(PatternConfig()).detect(_frame(closes, 0.002))
    wedge = [p for p in pats if p.name == "Düşen Kama"]
    assert wedge and wedge[0].broken, [(p.name, p.breakout_age) for p in pats]
