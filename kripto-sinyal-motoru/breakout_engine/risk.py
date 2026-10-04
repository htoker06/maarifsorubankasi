"""Risk yönetimi: alım bölgesi, kademeli giriş, stop ve R:R hedefleri."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import RiskConfig
from .models import PatternMatch, TradePlan


def build_plan(
    df: pd.DataFrame,
    breakout_idx: int,
    pattern: PatternMatch,
    cfg: RiskConfig,
    resistances: list[float] | None = None,
) -> TradePlan:
    """Kırılım formasyonuna göre işlem planı.

    Kademeler:
      K1 (%30): son kapanış (momentum girişi)
      K2 (%40): kırılım seviyesinin yeniden testi (+%0.5; kapanışın en az 0.25 ATR altı)
      K3 (%30): K2 ile kırılım seviyesinin düşüğü - 0.25 ATR (derin test)
    Stop: kırılım mumunun dibi ile formasyon geçersizlik seviyesinden (örn. TOBO sağ omuz)
    K3'ün altında kalan en yakını - 0.25 ATR tampon.
    """
    close = float(df["close"].iloc[-1])
    atr = float(df["atr"].iloc[-1])
    level = min(pattern.breakout_level, close)

    t1 = close
    t2 = min(level * 1.005, close - 0.25 * atr)
    t3 = min(t2, level) - 0.25 * atr
    w1, w2, w3 = cfg.tranche_weights
    tranches = [(t1, w1), (t2, w2), (t3, w3)]
    avg = sum(p * w for p, w in tranches) / sum(w for _, w in tranches)

    candidates = [float(df["low"].iloc[breakout_idx]), float(pattern.invalidation)]
    below = [c for c in candidates if c < t3 * 0.995]
    base_stop = max(below) if below else t3 * 0.97
    stop = base_stop - cfg.stop_buffer_atr * atr
    risk = avg - stop
    risk_pct = risk / avg if avg > 0 else np.inf

    targets: list[tuple[str, float, float]] = []
    for r in cfg.r_targets:
        targets.append((f"{r:g}R", avg + r * risk, r))
    measured = pattern.breakout_level + pattern.height
    if measured > avg + risk:
        targets.append(("Ölçülen Hareket", measured, (measured - avg) / risk))
    for res in resistances or []:
        if res > avg + risk:
            targets.append(("Hacim Direnci (HVN)", res, (res - avg) / risk))
            break
    targets.sort(key=lambda t: t[1])

    best_r = max(t[2] for t in targets)
    rr_ok = bool(stop > 0 and risk > 0 and risk_pct <= cfg.max_risk_pct and best_r >= cfg.min_rr_tp2)
    return TradePlan(
        entry_ref=close,
        buy_zone=(t3, t1),
        tranches=tranches,
        avg_entry=avg,
        stop=stop,
        risk_pct=float(risk_pct),
        targets=targets,
        rr_ok=rr_ok,
    )
