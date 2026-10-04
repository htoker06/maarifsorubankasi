"""Tarama orkestratörü.

İki aşamalı tarama (API limitlerini korumak için):
  Aşama 1 — tüm likit evren için sadece günlük mumlar çekilir; çekirdek şartları
            (formasyon kırılımı, MA200, hacim, mum anatomisi) geçemeyenler elenir.
  Aşama 2 — kalan adaylar için emir defteri (çoklu görüntü), son işlemler ve
            vadeli verileri çekilir; anti-manipülasyon kalkanı ile tam analiz yapılır.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import pandas as pd

from .analyzer import SignalAnalyzer
from .config import EngineConfig
from .exchange import CoinGeckoClient, ExchangeClient
from .macro import STABLES, build_proxy_indices, evaluate_regime
from .models import MacroState, MarketData, Regime, Signal

log = logging.getLogger(__name__)

PREFILTER_GATES = {
    "Likidite (24s hacim)", "Yeterli Geçmiş", "Formasyon Kırılımı", "MA200 Kırılımı (1-5 gün)",
    "Hacim Anomalisi", "Mum Anatomisi (gövde ≥%75)",
}


@dataclass
class ScanResult:
    macro: MacroState
    signals: list[Signal] = field(default_factory=list)  # şartların tamamını geçenler
    candidates: list[Signal] = field(default_factory=list)  # aşama 2'ye kalan tüm adaylar
    scanned: int = 0
    errors: int = 0


class BreakoutScanner:
    def __init__(self, cfg: EngineConfig) -> None:
        self.cfg = cfg
        self.analyzer = SignalAnalyzer(cfg)

    # ------------------------------------------------------------------ makro
    async def macro_state(self, ex: ExchangeClient) -> MacroState:
        mc = self.cfg.macro
        q = self.cfg.exchange.quote
        btc = await ex.daily(f"BTC/{q}", 400)
        async with CoinGeckoClient() as cg:
            snapshot, caps = await asyncio.gather(cg.global_snapshot(), cg.market_caps(100))
        indices = None
        try:
            if not caps:  # CoinGecko yoksa: hacim ağırlıklı yaklaşık endeks
                uni = await ex.universe(0)
                caps = {s.split("/")[0]: qv for s, qv, _ in uni[: mc.index_components]}
                stable_caps: dict[str, float] = {}
            else:
                stable_caps = {k: v for k, v in caps.items() if k in STABLES}
            comps = [b for b in caps if b not in STABLES and f"{b}/{q}" in ex.spot.markets][: mc.index_components]
            if "BTC" not in comps:
                comps.insert(0, "BTC")
            frames = await asyncio.gather(*(ex.daily(f"{b}/{q}", 400) for b in comps), return_exceptions=True)
            closes = {b: f["close"] for b, f in zip(comps, frames)
                      if isinstance(f, pd.DataFrame) and len(f) >= mc.ema_slow + 10}
            indices = build_proxy_indices(closes, {b: caps[b] for b in closes if b in caps}, stable_caps)
        except Exception as exc:
            log.warning("Makro endeksler kurulamadı: %s", exc)
        return evaluate_regime(btc, indices, mc, snapshot)

    # ------------------------------------------------------------------ tarama
    async def run_once(self, ex: ExchangeClient, symbols: list[str] | None = None,
                       ignore_lock: bool = False) -> ScanResult:
        cfg = self.cfg
        macro = await self.macro_state(ex)
        result = ScanResult(macro=macro)
        if macro.locked and not ignore_lock:
            log.warning("Makro kilit aktif (%s) — alım sinyali üretilmeyecek.", "; ".join(macro.notes))
            return result

        universe = await ex.universe(0 if symbols else cfg.liquidity.min_quote_volume_24h)
        if symbols:
            wanted = set(symbols)
            universe = [u for u in universe if u[0] in wanted]
        result.scanned = len(universe)

        async def stage1(sym: str, qv: float, last: float) -> Signal | None:
            try:
                df = await ex.daily(sym)
                md = MarketData(sym, ex.name, df, qv, last)
                sig = self.analyzer.analyze(md, macro)
                ok = all(g.passed for g in sig.gates if g.name in PREFILTER_GATES)
                return sig if ok else None
            except Exception as exc:
                result.errors += 1
                log.debug("%s aşama-1 hatası: %s", sym, exc)
                return None

        stage1_hits = [s for s in await asyncio.gather(*(stage1(*u) for u in universe)) if s]
        log.info("Aşama 1: %d / %d sembol çekirdek şartları geçti", len(stage1_hits), len(universe))

        mc = cfg.manipulation

        async def stage2(sig: Signal) -> Signal | None:
            sym = sig.symbol
            try:
                base = sym.split("/")[0]
                df, books, trades, deriv = await asyncio.gather(
                    ex.daily(sym),
                    ex.order_books(sym, mc.book_snapshots, mc.book_snapshot_interval_s),
                    ex.trades(sym),
                    ex.derivatives(base),
                )
                md = MarketData(sym, ex.name, df, sig.quote_volume_24h, sig.price, order_books=books,
                                trades=trades, derivatives_listed=bool(deriv and deriv.funding_rate is not None))
                return self.analyzer.analyze(md, macro, deriv)
            except Exception as exc:
                result.errors += 1
                log.warning("%s aşama-2 hatası: %s", sym, exc)
                return None

        full = [s for s in await asyncio.gather(*(stage2(s) for s in stage1_hits)) if s]
        full.sort(key=lambda s: -s.score)
        result.candidates = full
        result.signals = [s for s in full if s.passed]
        return result


def neutral_macro() -> MacroState:
    return MacroState(Regime.NEUTRAL, 50.0, False, notes=["Makro veri kullanılmadı"])
