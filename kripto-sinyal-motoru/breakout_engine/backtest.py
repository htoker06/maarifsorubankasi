"""Geriye dönük test (walk-forward, look-ahead yok).

Canlı taramadaki ``SignalAnalyzer.analyze`` fonksiyonunun AYNISI, her gün için
yalnızca o güne kadarki verilerle çalıştırılır. Emir defteri, işlem kaydı ve
fonlama oranının tarihsel verisi olmadığından bu kontroller testte devre dışıdır
(``strict_missing_data=False``); mum tabanlı sahte hacim ve CVD kontrolleri çalışır.

Sonuç simülasyonu (muhafazakâr):
- Giriş: sinyalden sonraki günün açılışı.
- Aynı gün hem stop hem hedef görülürse önce STOP varsayılır.
- ``horizon`` gün içinde ikisi de olmazsa son kapanıştan çıkılır.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .analyzer import SignalAnalyzer
from .config import EngineConfig
from .indicators import add_indicators
from .macro import evaluate_regime
from .models import MacroState, MarketData
from .scanner import neutral_macro


@dataclass
class TradeResult:
    date: pd.Timestamp
    score: float
    pattern: str
    entry: float
    stop: float
    target: float
    exit: float
    r_multiple: float
    outcome: str  # "hedef" | "stop" | "süre"
    bars: int


def walk_forward(
    df: pd.DataFrame,
    cfg: EngineConfig,
    btc: pd.DataFrame | None = None,
    symbol: str = "BACKTEST",
    horizon: int = 60,
    target_index: int = 1,
    fixed_macro: MacroState | None = None,
) -> list[TradeResult]:
    """``btc`` verilirse makro rejim her gün o güne kadarki BTC verisiyle hesaplanır;
    verilmezse ``fixed_macro`` (yoksa nötr rejim) kullanılır."""
    cfg = copy.deepcopy(cfg)
    cfg.manipulation.strict_missing_data = False
    analyzer = SignalAnalyzer(cfg)
    st = cfg.setup
    ind = add_indicators(df, st, cfg.risk, cfg.smart_money)
    close, ma = ind["close"].to_numpy(float), ind["sma200"].to_numpy(float)
    above = close > ma
    # Ucuz ön filtre (nedensel indikatörlerle): son N günde MA200 kesişimi + hacim artışı.
    recent_cross = pd.Series(above & ~np.r_[False, above[:-1]]).rolling(st.ma_cross_max_age + 1, min_periods=1).max()
    cand = np.where(above & recent_cross.to_numpy(bool) & (ind["vol_mult"].to_numpy(float) >= st.volume_spike_mult * 0.8))[0]

    results: list[TradeResult] = []
    busy_until = -1
    for t in cand:
        if t < st.min_history_bars or t <= busy_until or t + 1 >= len(df):
            continue
        hist = df.iloc[: t + 1]
        if btc is not None:
            b = btc.loc[: hist.index[-1]]
            macro = evaluate_regime(b, None, cfg.macro) if len(b) > 210 else neutral_macro()
        else:
            macro = fixed_macro or neutral_macro()
        md = MarketData(symbol, "backtest", hist, float(hist["quote_volume"].iloc[-1]), float(hist["close"].iloc[-1]))
        sig = analyzer.analyze(md, macro)
        if not sig.passed or sig.plan is None:
            continue
        entry = float(df["open"].iloc[t + 1])
        stop = sig.plan.stop
        if entry <= stop:
            continue
        targets = sorted(p for _, p, _ in sig.plan.targets)
        target = targets[min(target_index, len(targets) - 1)]
        risk = entry - stop
        outcome, exit_px, bars = "süre", float(df["close"].iloc[min(len(df) - 1, t + horizon)]), horizon
        for k in range(t + 1, min(len(df), t + 1 + horizon)):
            if df["low"].iloc[k] <= stop:
                outcome, exit_px, bars = "stop", stop, int(k - t)
                break
            if df["high"].iloc[k] >= target:
                outcome, exit_px, bars = "hedef", target, int(k - t)
                break
        results.append(TradeResult(df.index[t], sig.score, sig.pattern_label, entry, stop, target,
                                   exit_px, (exit_px - entry) / risk, outcome, bars))
        busy_until = t + bars
    return results


def summarize(results: list[TradeResult]) -> dict[str, float]:
    if not results:
        return {"islem": 0}
    r = np.array([x.r_multiple for x in results])
    wins = r[r > 0]
    losses = r[r <= 0]
    return {
        "islem": len(results),
        "isabet_orani": float((r > 0).mean()),
        "ortalama_R": float(r.mean()),
        "toplam_R": float(r.sum()),
        "kar_faktoru": float(wins.sum() / -losses.sum()) if losses.sum() < 0 else float("inf"),
        "max_ardisik_kayip": int(max((len(s) for s in "".join("L" if x <= 0 else "W" for x in r).split("W")), default=0)),
    }
