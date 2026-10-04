"""Asenkron borsa veri katmanı (CCXT async + aiohttp).

- Tüm çağrılar bir semafor ile sınırlanır ve ağ/limit hatalarında üstel geri
  çekilme (exponential backoff) ile yeniden denenir.
- Günlük mumlarda yalnızca KAPANMIŞ mumlar döndürülür (açık mum sinyali boyar/repaint).
- Binance'te ham kline uç noktası kullanılır; böylece mum başına işlem sayısı ve
  taker alış hacmi (spot CVD) da alınır. Diğer borsalarda bu alanlar NaN kalır.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Any

import aiohttp
import ccxt.async_support as ccxt
import numpy as np
import pandas as pd

from .config import ExchangeConfig
from .models import DerivativesStats

log = logging.getLogger(__name__)

DAY_MS = 86_400_000
LEVERAGED = re.compile(r"^(.+)(UP|DOWN|BULL|BEAR|[235]L|[235]S)$")
RETRYABLE = (ccxt.NetworkError, ccxt.RateLimitExceeded, ccxt.DDoSProtection,
             ccxt.RequestTimeout, ccxt.ExchangeNotAvailable)


class ExchangeClient:
    def __init__(self, cfg: ExchangeConfig) -> None:
        self.cfg = cfg
        self.sem = asyncio.Semaphore(cfg.max_concurrency)
        opts = {"enableRateLimit": True, "timeout": cfg.timeout_ms}
        self.spot: ccxt.Exchange = getattr(ccxt, cfg.exchange_id)(opts)
        self.deriv: ccxt.Exchange | None = (
            getattr(ccxt, cfg.derivatives_id)(opts) if cfg.derivatives_id else None
        )

    async def __aenter__(self) -> "ExchangeClient":
        try:
            await self._call(self.spot.load_markets)
        except Exception:
            await self.__aexit__()
            raise
        if self.deriv is not None:
            try:
                await self._call(self.deriv.load_markets)
            except Exception as exc:  # vadeli erişimi yoksa spot devam eder
                log.warning("Vadeli piyasa yüklenemedi (%s): %s", self.cfg.derivatives_id, exc)
                await self.deriv.close()
                self.deriv = None
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.spot.close()
        if self.deriv is not None:
            await self.deriv.close()

    # ------------------------------------------------------------------ altyapı
    async def _call(self, fn, *args: Any, **kwargs: Any) -> Any:
        delay = 1.0
        for attempt in range(self.cfg.max_retries + 1):
            try:
                async with self.sem:
                    return await fn(*args, **kwargs)
            except RETRYABLE as exc:
                if attempt == self.cfg.max_retries:
                    raise
                log.debug("Yeniden deneme %d (%s): %s", attempt + 1, getattr(fn, "__name__", fn), exc)
                await asyncio.sleep(delay)
                delay *= 2

    @property
    def name(self) -> str:
        return self.cfg.exchange_id

    # ------------------------------------------------------------------ evren
    async def universe(self, min_quote_volume: float) -> list[tuple[str, float, float]]:
        """(sembol, 24s quote hacmi, son fiyat) — likidite filtresi uygulanmış spot USDT pariteleri."""
        tickers = await self._call(self.spot.fetch_tickers)
        out: list[tuple[str, float, float]] = []
        for sym, m in self.spot.markets.items():
            if not (m.get("spot") and m.get("active", True) and m.get("quote") == self.cfg.quote):
                continue
            base = m["base"]
            if base in self.cfg.excluded_bases or LEVERAGED.match(base):
                continue
            t = tickers.get(sym) or {}
            qv = t.get("quoteVolume") or (t.get("baseVolume") or 0) * (t.get("last") or 0)
            if qv and qv >= min_quote_volume and t.get("last"):
                out.append((sym, float(qv), float(t["last"])))
        return sorted(out, key=lambda x: -x[1])

    # ------------------------------------------------------------------ mumlar
    async def daily(self, symbol: str, days: int | None = None) -> pd.DataFrame:
        days = days or self.cfg.history_days
        if self.spot.id == "binance":
            df = await self._binance_klines(symbol, days)
        else:
            df = await self._generic_ohlcv(symbol, days)
        now_ms = time.time() * 1000
        # Açık (henüz kapanmamış) günlük mumu at.
        open_ms = df.index.as_unit("ms").asi8
        return df[open_ms + DAY_MS <= now_ms]

    async def _binance_klines(self, symbol: str, days: int) -> pd.DataFrame:
        market = self.spot.market(symbol)
        since = int(time.time() * 1000) - days * DAY_MS
        rows: list[list[Any]] = []
        while True:
            batch = await self._call(
                self.spot.publicGetKlines,
                {"symbol": market["id"], "interval": "1d", "startTime": since, "limit": 1000},
            )
            if not batch:
                break
            rows += batch
            if len(batch) < 1000:
                break
            since = int(batch[-1][0]) + DAY_MS
        cols = ["ts", "open", "high", "low", "close", "volume", "close_ts", "quote_volume",
                "trades", "taker_buy_base", "taker_buy_quote", "_"]
        df = pd.DataFrame(rows, columns=cols).drop(columns=["_", "close_ts"])
        df = df.astype(float)
        df.index = pd.to_datetime(df.pop("ts").astype("int64"), unit="ms", utc=True)
        return df[~df.index.duplicated()].sort_index()

    async def _generic_ohlcv(self, symbol: str, days: int) -> pd.DataFrame:
        since = self.spot.milliseconds() - days * DAY_MS
        rows: list[list[float]] = []
        while True:
            batch = await self._call(self.spot.fetch_ohlcv, symbol, "1d", since, 500)
            if not batch:
                break
            rows += batch
            if len(batch) < 500:
                break
            since = int(batch[-1][0]) + DAY_MS
        df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"]).astype(float)
        df.index = pd.to_datetime(df.pop("ts").astype("int64"), unit="ms", utc=True)
        df = df[~df.index.duplicated()].sort_index()
        df["quote_volume"] = df["volume"] * (df["high"] + df["low"] + df["close"]) / 3
        df["trades"] = np.nan
        df["taker_buy_quote"] = np.nan
        return df

    # ------------------------------------------------------------------ mikro yapı
    async def order_books(self, symbol: str, snapshots: int, interval_s: float) -> list[dict[str, Any]]:
        books = []
        for i in range(snapshots):
            books.append(await self._call(self.spot.fetch_order_book, symbol, 1000 if self.spot.id == "binance" else 100))
            if i < snapshots - 1:
                await asyncio.sleep(interval_s)
        return books

    async def trades(self, symbol: str, limit: int = 1000) -> list[dict[str, Any]]:
        return await self._call(self.spot.fetch_trades, symbol, None, limit)

    async def derivatives(self, base: str) -> DerivativesStats | None:
        if self.deriv is None:
            return None
        sym = f"{base}/{self.cfg.quote}:{self.cfg.quote}"
        if sym not in self.deriv.markets:
            return DerivativesStats(funding_rate=None, oi_change=None, notes=["Vadeli kontrat yok"])
        fr = await self._call(self.deriv.fetch_funding_rate, sym)
        oi_change = None
        try:
            hist = await self._call(self.deriv.fetch_open_interest_history, sym, "1d", None, 8)
            vals = [h.get("openInterestValue") or h.get("openInterestAmount") for h in hist]
            vals = [float(v) for v in vals if v]
            if len(vals) >= 2 and vals[0] > 0:
                oi_change = vals[-1] / vals[0] - 1
        except Exception as exc:
            log.debug("OI geçmişi alınamadı %s: %s", sym, exc)
        return DerivativesStats(funding_rate=float(fr.get("fundingRate") or 0.0), oi_change=oi_change)


class CoinGeckoClient:
    """Makro veriler: global piyasa özeti ve en büyük coinlerin piyasa değerleri."""

    BASE = "https://api.coingecko.com/api/v3"

    def __init__(self, timeout_s: float = 20.0) -> None:
        headers = {"accept": "application/json"}
        if key := os.getenv("COINGECKO_API_KEY"):
            headers["x-cg-demo-api-key"] = key
        self._session = aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=timeout_s))

    async def __aenter__(self) -> "CoinGeckoClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._session.close()

    async def _get(self, path: str, **params: Any) -> Any:
        delay = 2.0
        for attempt in range(4):
            async with self._session.get(f"{self.BASE}{path}", params=params) as r:
                if r.status == 429 and attempt < 3:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                r.raise_for_status()
                return await r.json()

    async def global_snapshot(self) -> dict[str, Any] | None:
        try:
            return (await self._get("/global"))["data"]
        except Exception as exc:
            log.warning("CoinGecko /global alınamadı: %s", exc)
            return None

    async def market_caps(self, n: int = 100) -> dict[str, float]:
        """Sembol (büyük harf) -> piyasa değeri (USD)."""
        try:
            rows = await self._get("/coins/markets", vs_currency="usd", order="market_cap_desc", per_page=n, page=1)
        except Exception as exc:
            log.warning("CoinGecko piyasa değerleri alınamadı: %s", exc)
            return {}
        caps: dict[str, float] = {}
        for r in rows:
            sym = str(r["symbol"]).upper()
            if sym not in caps and r.get("market_cap"):
                caps[sym] = float(r["market_cap"])
        return caps
