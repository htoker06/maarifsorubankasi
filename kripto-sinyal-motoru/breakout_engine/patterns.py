"""Formasyon tanıma motoru (pivot / swing high-low tabanlı).

Kurallar:
- Pivotlar yalnızca ``pivot_right`` bar sonra onaylanır; sonradan değişmez (repaint yok).
- Bir formasyonun kırılımı, seviyenin altındaki bir kapanıştan sonra seviyenin
  üstünde gelen ilk kapanıştır ve o günden bu yana tüm kapanışlar seviyenin
  üstünde kalmalıdır (kırılım "tutunmuş" olmalı).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import PatternConfig
from .models import PatternMatch


# --------------------------------------------------------------------------- yardımcılar
@dataclass(frozen=True)
class Line:
    slope: float
    intercept: float

    def at(self, x: np.ndarray | float) -> np.ndarray | float:
        return self.slope * np.asarray(x, dtype=float) + self.intercept

    @staticmethod
    def through(x1: float, y1: float, x2: float, y2: float) -> "Line":
        slope = (y2 - y1) / (x2 - x1)
        return Line(slope, y1 - slope * x1)


def find_pivots(series: np.ndarray, left: int, right: int, kind: str) -> np.ndarray:
    """Onaylanmış pivot indeksleri. ``kind`` = 'high' | 'low'."""
    n = len(series)
    out: list[int] = []
    for i in range(left, n - right):
        window = series[i - left : i + right + 1]
        v = series[i]
        if kind == "high":
            if v == window.max() and np.argmax(window) == left:
                out.append(i)
        else:
            if v == window.min() and np.argmin(window) == left:
                out.append(i)
    return np.asarray(out, dtype=int)


def breakout_age(close: np.ndarray, level: np.ndarray, start: int) -> int | None:
    """Seviyenin yukarı kırılıp tutunduğu bar sayısı (0 = son mum).

    ``level`` her bar için seviye değerini içerir (yatay seviye ya da trend çizgisi).
    """
    n = len(close)
    with np.errstate(invalid="ignore"):
        above = close > level
    above &= ~np.isnan(level)
    if n == 0 or not above[-1]:
        return None
    j = n - 1
    while j - 1 >= start and above[j - 1]:
        j -= 1
    if j <= start or np.isnan(level[j - 1]):
        return None  # seviyenin altından gelen bir geçiş yok
    return n - 1 - j


def breakdown_age(close: np.ndarray, level: np.ndarray, start: int) -> int | None:
    return breakout_age(-close, -level, start)


def _envelope(x: np.ndarray, y: np.ndarray, upper: bool) -> Line:
    """Noktalara regresyon doğrusu çizip tüm noktaları kapsayacak şekilde kaydırır."""
    slope, intercept = np.polyfit(x.astype(float), y.astype(float), 1)
    resid = y - (slope * x + intercept)
    intercept += resid.max() if upper else resid.min()
    return Line(float(slope), float(intercept))


def _touches(line: Line, x: np.ndarray, y: np.ndarray, tol: float = 0.015) -> int:
    return int((np.abs(y - line.at(x)) / np.abs(y) <= tol).sum())


# --------------------------------------------------------------------------- motor
class PatternEngine:
    def __init__(self, cfg: PatternConfig) -> None:
        self.cfg = cfg

    def detect(self, df: pd.DataFrame) -> list[PatternMatch]:
        """Tüm formasyonları tarar; yükseliş formasyonları ve uyarı formasyonlarını döndürür."""
        data = df.tail(max(self.cfg.pattern_lookback, self.cfg.donchian_period + 5)).reset_index(drop=True)
        if len(data) < 40:
            return []
        h, l, c, o = (data[k].to_numpy(dtype=float) for k in ("high", "low", "close", "open"))
        ph = find_pivots(h, self.cfg.pivot_left, self.cfg.pivot_right, "high")
        pl = find_pivots(l, self.cfg.pivot_left, self.cfg.pivot_right, "low")

        found: list[PatternMatch] = []
        for fn in (
            lambda: self.inverse_head_shoulders(h, l, c, ph, pl),
            lambda: self.multiple_bottom(h, l, c, ph, pl),
            lambda: self.rounding_bottom(h, l, c),
            lambda: self.wedges_and_pennants(h, l, c, ph, pl),
            lambda: self.descending_trendline(h, l, c, ph, pl),
            lambda: self.market_structure_shift(h, l, c, o, ph),
            lambda: self.donchian(h, l, c),
        ):
            res = fn()
            if res is None:
                continue
            found.extend(res if isinstance(res, list) else [res])
        return found

    # ----------------------------------------------------------------- TOBO
    def inverse_head_shoulders(self, h, l, c, ph, pl) -> PatternMatch | None:
        cfg = self.cfg
        best: PatternMatch | None = None
        cand = pl[-7:]
        for k in range(len(cand) - 2):
            ls, hd, rs = cand[k], cand[k + 1], cand[k + 2]
            ls_v, hd_v, rs_v = l[ls], l[hd], l[rs]
            shoulder_floor = min(ls_v, rs_v)
            if hd_v >= shoulder_floor * (1 - cfg.min_head_depth):
                continue
            if abs(ls_v - rs_v) / shoulder_floor > cfg.shoulder_tolerance:
                continue
            if l[rs:].min() < hd_v:  # sağ omuzdan sonra başın altına inilmiş -> geçersiz
                continue
            p1 = ls + int(np.argmax(h[ls : hd + 1]))
            p2 = hd + int(np.argmax(h[hd : rs + 1]))
            if p1 == p2:
                continue
            neck = Line.through(p1, h[p1], p2, h[p2])
            # Boyun çizgisi çok dik düşüyorsa (>%1/bar) güvenilmez.
            if abs(neck.slope) / h[p2] > 0.01:
                continue
            level = neck.at(np.arange(len(c)))
            level[: rs + 1] = np.nan
            age = breakout_age(c, level, rs + 1)
            height = float(neck.at(hd) - hd_v)
            symmetry = 1 - abs(ls_v - rs_v) / shoulder_floor / cfg.shoulder_tolerance
            depth = min(1.0, (shoulder_floor - hd_v) / shoulder_floor / 0.15)
            m = PatternMatch(
                name="TOBO",
                breakout_level=float(neck.at(len(c) - 1)),
                breakout_age=age,
                invalidation=float(rs_v),
                height=height,
                quality=float(np.clip(0.5 * symmetry + 0.5 * depth, 0, 1)),
                meta={"left_shoulder": float(ls_v), "head": float(hd_v), "right_shoulder": float(rs_v),
                      "neck_slope": neck.slope},
            )
            if best is None or (m.broken, m.quality) > (best.broken, best.quality):
                best = m
        return best

    # ----------------------------------------------------------------- İkili / Üçlü dip
    def multiple_bottom(self, h, l, c, ph, pl) -> PatternMatch | None:
        cfg = self.cfg
        best: PatternMatch | None = None
        cand = list(pl[-5:])
        combos: list[tuple[int, ...]] = []
        for i in range(len(cand)):
            for j in range(i + 1, len(cand)):
                combos.append((cand[i], cand[j]))
                for k in range(j + 1, len(cand)):
                    combos.append((cand[i], cand[j], cand[k]))
        for combo in combos:
            lows = l[list(combo)]
            floor = lows.min()
            if lows.max() / floor - 1 > cfg.bottom_tolerance:
                continue
            if any(b - a < cfg.min_bottom_separation for a, b in zip(combo, combo[1:])):
                continue
            first, last = combo[0], combo[-1]
            if l[first:].min() < floor * (1 - cfg.bottom_tolerance / 2):
                continue  # dipler arasında / sonrasında daha derin dip var
            neck_level = h[first : last + 1].max()
            depth = neck_level / floor - 1
            if depth < 0.08:
                continue
            level = np.full(len(c), np.nan)
            level[last + 1 :] = neck_level
            age = breakout_age(c, level, last + 1)
            tightness = 1 - (lows.max() / floor - 1) / cfg.bottom_tolerance
            name = "Üçlü Dip" if len(combo) == 3 else "İkili Dip"
            m = PatternMatch(
                name=name,
                breakout_level=float(neck_level),
                breakout_age=age,
                invalidation=float(floor),
                height=float(neck_level - floor),
                quality=float(np.clip(0.6 * tightness + 0.4 * min(1.0, depth / 0.3) + (0.1 if len(combo) == 3 else 0), 0, 1)),
                meta={"bottoms": [float(x) for x in lows]},
            )
            if best is None or (m.broken, m.quality) > (best.broken, best.quality):
                best = m
        return best

    # ----------------------------------------------------------------- Çanak
    def rounding_bottom(self, h, l, c) -> PatternMatch | None:
        cfg = self.cfg
        best: PatternMatch | None = None
        n = len(c)
        for w in (60, 90, 120, 160):
            end = n - 4  # çanak, son kırılım mumlarından önce tamamlanmış olmalı
            start = end - w
            if start < 0:
                continue
            y = np.log(c[start:end])
            x = np.linspace(-1, 1, w)
            coef = np.polyfit(x, y, 2)
            fit = np.polyval(coef, x)
            ss_res = ((y - fit) ** 2).sum()
            ss_tot = ((y - y.mean()) ** 2).sum()
            r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
            a, b = coef[0], coef[1]
            if a <= 0 or r2 < cfg.rounding_min_r2:
                continue
            vertex = -b / (2 * a)
            if not -0.4 <= vertex <= 0.4:
                continue
            rim = c[start : start + max(5, w // 7)].max()
            bottom = l[start:end].min()
            if rim / bottom - 1 < 0.15:
                continue
            level = np.full(n, np.nan)
            level[end - w // 4 :] = rim
            age = breakout_age(c, level, end - w // 4)
            m = PatternMatch(
                name="Çanak Dip",
                breakout_level=float(rim),
                breakout_age=age,
                invalidation=float(l[start + w // 2 : end].min()),
                height=float(rim - bottom),
                quality=float(np.clip(r2, 0, 1)),
                meta={"window": w, "r2": float(r2)},
            )
            if best is None or (m.broken, m.quality) > (best.broken, best.quality):
                best = m
        return best

    # ----------------------------------------------------------------- Kama / Flama
    def wedges_and_pennants(self, h, l, c, ph, pl) -> list[PatternMatch]:
        cfg = self.cfg
        n = len(c)
        out: list[PatternMatch] = []
        for w in (45, 90, 140):
            start = max(0, n - w)
            hx = ph[(ph >= start)]
            lx = pl[(pl >= start)]
            if len(hx) < cfg.wedge_min_touches or len(lx) < cfg.wedge_min_touches:
                continue
            up = _envelope(hx, h[hx], upper=True)
            lo = _envelope(lx, l[lx], upper=False)
            x0 = min(hx[0], lx[0])
            x_end = max(hx[-1], lx[-1])
            width0 = up.at(x0) - lo.at(x0)
            width1 = up.at(x_end) - lo.at(x_end)
            if width0 <= 0 or width1 <= 0 or width1 > 0.75 * width0:
                continue  # yakınsama yok
            if _touches(up, hx, h[hx]) < 2 or _touches(lo, lx, l[lx]) < 2:
                continue
            rel_up = up.slope / c[x0]
            rel_lo = lo.slope / c[x0]
            idx = np.arange(n, dtype=float)
            upper_level = up.at(idx)
            upper_level[: x_end + 1] = np.nan
            lower_level = lo.at(idx)
            lower_level[: x_end + 1] = np.nan
            meta = {"upper": (up.slope, up.intercept), "lower": (lo.slope, lo.intercept), "window": w}
            last_low_pivot = float(l[lx[-1]])
            if rel_up < 0 and rel_lo < 0 and up.slope < lo.slope:
                out.append(PatternMatch(
                    name="Düşen Kama", breakout_level=float(up.at(n - 1)),
                    breakout_age=breakout_age(c, upper_level, x_end + 1), invalidation=last_low_pivot,
                    height=float(width0), quality=float(np.clip(1 - width1 / width0, 0, 1)), meta=meta,
                ))
            elif rel_up > 0 and rel_lo > 0 and lo.slope > up.slope:
                # Yükselen kama ayı formasyonudur: alım sinyali değil, risk uyarısıdır.
                out.append(PatternMatch(
                    name="Yükselen Kama", breakout_level=float(lo.at(n - 1)),
                    breakout_age=breakdown_age(c, lower_level, x_end + 1), invalidation=float(up.at(n - 1)),
                    height=float(width0), quality=float(np.clip(1 - width1 / width0, 0, 1)), bullish=False, meta=meta,
                ))
            elif rel_up < 0 < rel_lo:
                pole_start = max(0, x0 - 15)
                pole = c[x0] / c[pole_start] - 1 if x0 > pole_start else 0.0
                out.append(PatternMatch(
                    name="Flama" if pole >= 0.15 else "Simetrik Üçgen", breakout_level=float(up.at(n - 1)),
                    breakout_age=breakout_age(c, upper_level, x_end + 1), invalidation=last_low_pivot,
                    height=float(max(width0, c[x0] - c[pole_start])),
                    quality=float(np.clip(1 - width1 / width0, 0, 1)), meta=meta | {"pole": float(pole)},
                ))
        # Aynı isimli tekrarları ele; en iyisi kalsın.
        best: dict[str, PatternMatch] = {}
        for m in out:
            cur = best.get(m.name)
            if cur is None or (m.broken, m.quality) > (cur.broken, cur.quality):
                best[m.name] = m
        return list(best.values())

    # ----------------------------------------------------------------- Düşen trend çizgisi
    def descending_trendline(self, h, l, c, ph, pl) -> PatternMatch | None:
        n = len(c)
        start = max(0, n - self.cfg.trendline_lookback)
        hx = ph[ph >= start]
        if len(hx) < 2:
            return None
        anchor = hx[np.argmax(h[hx])]
        later = hx[hx > anchor]
        if len(later) == 0:
            return None
        slopes = (h[later] - h[anchor]) / (later - anchor)
        k = int(np.argmax(slopes))
        line = Line(float(slopes[k]), float(h[anchor] - slopes[k] * anchor))
        if line.slope >= 0:
            return None
        last_touch = int(later[k])
        level = line.at(np.arange(n, dtype=float))
        # Çizgi, çapadan son temas noktasına kadar hiçbir kapanışla ihlal edilmemiş olmalı.
        if (c[anchor:last_touch + 1] > level[anchor:last_touch + 1] * 1.005).any():
            return None
        level[: last_touch + 1] = np.nan
        age = breakout_age(c, level, last_touch + 1)
        touches = _touches(line, hx[hx >= anchor], h[hx[hx >= anchor]])
        lows_after = pl[pl > last_touch]
        invalid = float(l[lows_after[-1]]) if len(lows_after) else float(l[last_touch:].min())
        return PatternMatch(
            name="Düşen Trend Kırılımı",
            breakout_level=float(line.at(n - 1)),
            breakout_age=age,
            invalidation=invalid,
            height=float(h[anchor] - l[anchor:].min()),
            quality=float(np.clip(0.4 + 0.2 * touches, 0, 1)),
            meta={"anchor_high": float(h[anchor]), "touches": touches, "slope": line.slope},
        )

    # ----------------------------------------------------------------- MSS / ChoCh
    def market_structure_shift(self, h, l, c, o, ph) -> PatternMatch | None:
        if len(ph) < 2:
            return None
        n = len(c)
        for i in range(len(ph) - 1, 0, -1):
            prev, cur = ph[i - 1], ph[i]
            if h[cur] >= h[prev]:
                continue  # düşen tepe (lower high) değil
            level = np.full(n, np.nan)
            level[cur + 1 :] = h[cur]
            age = breakout_age(c, level, cur + 1)
            if age is None:
                return None
            j = n - 1 - age
            rng = h[j] - l[j]
            body = abs(c[j] - o[j]) / rng if rng > 0 else 0.0
            if body < 0.6:
                return None  # güçlü gövdeli kırılım yok
            return PatternMatch(
                name="MSS (ChoCh)",
                breakout_level=float(h[cur]),
                breakout_age=age,
                invalidation=float(l[cur:j + 1].min()),
                height=float(h[prev] - l[cur:j + 1].min()),
                quality=float(np.clip(body, 0, 1)),
                meta={"lower_high": float(h[cur]), "previous_high": float(h[prev])},
            )
        return None

    # ----------------------------------------------------------------- Donchian
    def donchian(self, h, l, c) -> PatternMatch | None:
        p = self.cfg.donchian_period
        if len(c) <= p + 1:
            return None
        n = len(c)
        upper = pd.Series(h).shift(1).rolling(p).max().to_numpy()
        # Kanal kırılımdan sonra yukarı kayar; bu yüzden kırılım günündeki seviye sabitlenir.
        for j in range(n - 1, max(p, n - 15), -1):
            if c[j] > upper[j] and c[j - 1] <= upper[j - 1] and (c[j:] > upper[j]).all():
                level = float(upper[j])
                return PatternMatch(
                    name=f"Donchian {p}G Kırılımı",
                    breakout_level=level,
                    breakout_age=n - 1 - j,
                    invalidation=float(l[j]),
                    height=float(level - l[j - p : j].min()),
                    quality=0.5,
                )
        return PatternMatch(
            name=f"Donchian {p}G Kırılımı", breakout_level=float(upper[-1]), breakout_age=None,
            invalidation=float(l[-1]), height=float(upper[-1] - l[-p:].min()), quality=0.5,
        )
