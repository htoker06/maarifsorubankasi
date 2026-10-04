"""Akıllı para izi: gizli toplanma (OBV/CMF uyumsuzluğu) ve hacim profili (POC)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import SmartMoneyConfig
from .indicators import normalized_slope


@dataclass
class AccumulationResult:
    price_slope: float  # bar başına % (normalize)
    obv_slope: float  # bar başına ortalama günlük hacmin oranı
    cmf_mean: float
    cmf_rising: bool
    divergence: bool
    score: float  # 0-1


@dataclass
class VolumeProfile:
    poc: float
    val: float  # value area low (%70)
    vah: float  # value area high
    above_poc: bool
    poc_cross_age: int | None
    poc_cross_vol_mult: float
    strong_poc_cross: bool
    resistances: list[float] = field(default_factory=list)  # fiyatın üstündeki yüksek hacim düğümleri


def hidden_accumulation(df: pd.DataFrame, end_idx: int, cfg: SmartMoneyConfig) -> AccumulationResult:
    """Fiyat yatay/düşükken OBV ve CMF yükseliyor mu? (pozitif uyumsuzluk)

    Pencere kırılım mumundan ÖNCE biter; kırılımın kendisi uyumsuzluğu şişirmez.
    """
    start = max(0, end_idx - cfg.divergence_window)
    win = df.iloc[start:end_idx]
    if len(win) < 20:
        return AccumulationResult(np.nan, np.nan, np.nan, False, False, 0.0)
    price_slope = normalized_slope(win["close"].to_numpy())
    obv = win["obv"].to_numpy(float)
    x = np.arange(len(obv), dtype=float)
    avg_vol = float(win["volume"].mean()) or 1.0
    obv_slope = float(np.polyfit(x, obv, 1)[0] / avg_vol)
    cmf = win["cmf"].dropna()
    cmf_mean = float(cmf.mean()) if len(cmf) else 0.0
    half = len(cmf) // 2
    cmf_rising = bool(len(cmf) > 10 and cmf.iloc[half:].mean() > cmf.iloc[:half].mean())

    flat_or_down = price_slope <= 0.002  # 60 günde ~%12'den az yükseliş
    divergence = flat_or_down and obv_slope > 0.05 and (cmf_mean > 0 or cmf_rising)
    score = 0.0
    if flat_or_down:
        score += 0.25
    score += 0.35 * float(np.clip(obv_slope / 0.25, 0, 1))
    score += 0.25 * float(np.clip((cmf_mean + 0.05) / 0.2, 0, 1))
    score += 0.15 * float(cmf_rising)
    return AccumulationResult(price_slope, obv_slope, cmf_mean, cmf_rising, divergence, float(np.clip(score, 0, 1)))


def volume_profile(df: pd.DataFrame, end_idx: int, cfg: SmartMoneyConfig) -> VolumeProfile | None:
    """Son ``profile_days`` günün hacim profili (VPVR benzeri).

    Her mumun hacmi, mumun [low, high] aralığına düşen fiyat kutularına eşit dağıtılır.
    """
    start = max(0, end_idx + 1 - cfg.profile_days)
    win = df.iloc[start : end_idx + 1]
    if len(win) < 30:
        return None
    lo_all, hi_all = float(win["low"].min()), float(win["high"].max())
    if hi_all <= lo_all:
        return None
    edges = np.linspace(lo_all, hi_all, cfg.profile_bins + 1)
    centers = (edges[:-1] + edges[1:]) / 2
    hist = np.zeros(cfg.profile_bins)
    for lo, hi, vol in win[["low", "high", "volume"]].to_numpy(float):
        i0 = int(np.clip(np.searchsorted(edges, lo, side="right") - 1, 0, cfg.profile_bins - 1))
        i1 = int(np.clip(np.searchsorted(edges, hi, side="right") - 1, 0, cfg.profile_bins - 1))
        hist[i0 : i1 + 1] += vol / (i1 - i0 + 1)
    poc_i = int(np.argmax(hist))
    poc = float(centers[poc_i])

    # %70 değer alanı
    order = np.argsort(hist)[::-1]
    cum = np.cumsum(hist[order]) / hist.sum()
    va = order[: int(np.searchsorted(cum, 0.70)) + 1]
    val, vah = float(edges[va.min()]), float(edges[va.max() + 1])

    close = df["close"].to_numpy(float)
    opn = df["open"].to_numpy(float)
    vol = df["volume"].to_numpy(float)
    vol_avg = df["vol_avg_poc"].to_numpy(float)
    cross_age, cross_mult = None, 0.0
    for j in range(end_idx, max(0, end_idx - cfg.poc_cross_max_age) - 1, -1):
        if close[j] > poc and (opn[j] < poc or close[j - 1] < poc):
            cross_age = end_idx - j
            cross_mult = float(vol[j] / vol_avg[j]) if vol_avg[j] > 0 else 0.0
            break
    price = close[end_idx]
    # Fiyatın üstündeki yerel hacim tepeleri -> direnç / hedef adayları
    peaks = [
        float(centers[i])
        for i in range(1, cfg.profile_bins - 1)
        if centers[i] > price * 1.02 and hist[i] >= hist[i - 1] and hist[i] >= hist[i + 1] and hist[i] > np.median(hist)
    ]
    return VolumeProfile(
        poc=poc,
        val=val,
        vah=vah,
        above_poc=bool(price > poc),
        poc_cross_age=cross_age,
        poc_cross_vol_mult=cross_mult,
        strong_poc_cross=bool(cross_age is not None and cross_mult >= cfg.poc_volume_mult),
        resistances=peaks,
    )
