"""Mobil uygulamanın uçtan uca testi: gerçek Chromium, telefon ekranı, sahte Binance/CoinGecko yanıtları.

Playwright yüklü değilse atlanır. Çalıştırmak için:  pip install playwright pytest
"""

from __future__ import annotations

import functools
import http.server
import json
import os
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import pytest

from synthetic import accumulation_breakout, order_book

pw = pytest.importorskip("playwright.sync_api")

MOBILE_DIR = Path(__file__).resolve().parents[1] / "mobil"
SCREENSHOT_DIR = Path(os.environ.get("E2E_SCREENSHOT_DIR", "/tmp"))


def _klines(df, limit):
    rows = []
    for t, r in df.iterrows():
        ms = int(t.value // 1_000_000)
        rows.append([ms, str(r.open), str(r.high), str(r.low), str(r.close), str(r.volume), ms + 86_399_999,
                     str(r.quote_volume), int(r.trades), "0", str(r.taker_buy_quote), "0"])
    return rows[-limit:]


def _frames():
    test = accumulation_breakout(5)
    n = len(test)
    idx = test.index
    trend = lambda a, b: test.assign(  # noqa: E731
        open=np.geomspace(a, b, n), close=np.geomspace(a, b, n) * 1.001,
        high=np.geomspace(a, b, n) * 1.01, low=np.geomspace(a, b, n) * 0.99)
    return {"TESTUSDT": test, "DEADUSDT": test.iloc[:-1].set_axis(idx[1:]),
            "BTCUSDT": trend(30_000, 90_000), "ETHUSDT": trend(1_000, 4_000)}


class MockMarket:
    def __init__(self, locked: bool = False):
        self.frames = _frames()
        if locked:  # BTC düşüş trendi -> makro kilit
            n = len(self.frames["BTCUSDT"])
            f = self.frames["BTCUSDT"]
            self.frames["BTCUSDT"] = f.assign(close=np.geomspace(90_000, 40_000, n), open=np.geomspace(90_000, 40_000, n),
                                              high=np.geomspace(90_000, 40_000, n) * 1.01, low=np.geomspace(90_000, 40_000, n) * 0.99)
        self.depth_calls = []

    def ticker(self, sym):
        f = self.frames[sym]
        qv = 25e6 if sym != "BTCUSDT" else 2e9
        return {"symbol": sym, "quoteVolume": str(qv), "lastPrice": str(f.close.iloc[-1]),
                "closeTime": int(time.time() * 1000), "count": 100000}

    def handle(self, route):
        url = urlparse(route.request.url)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path
        body = None
        if "symbol" in q and q["symbol"] not in self.frames and "fapi" not in url.netloc and "futures" not in path:
            return route.fulfill(status=400, body="{}", headers={"Access-Control-Allow-Origin": "*"})
        if path.endswith("/ticker/24hr"):
            body = self.ticker(q["symbol"]) if "symbol" in q else [self.ticker(s) for s in self.frames]
        elif path.endswith("/klines"):
            body = _klines(self.frames[q["symbol"]], int(q.get("limit", 500)))
        elif path.endswith("/depth"):
            self.depth_calls.append(q["symbol"])
            b = order_book(float(self.frames[q["symbol"]].close.iloc[-1]))
            body = {"bids": [[str(p), str(a)] for p, a in b["bids"]], "asks": [[str(p), str(a)] for p, a in b["asks"]]}
        elif path.endswith("/trades"):
            rng = np.random.default_rng(0)
            body = [{"price": "1", "qty": str(a), "quoteQty": str(a), "isBuyerMaker": bool(i % 3 == 0)}
                    for i, a in enumerate(rng.lognormal(3, 1, 1000))]
        elif path.endswith("/premiumIndex"):
            body = [{"symbol": "TESTUSDT", "lastFundingRate": "0.0001"}]
        elif path.endswith("/openInterestHist"):
            body = [{"sumOpenInterestValue": str(1e6 * (1 + i / 50))} for i in range(8)]
        elif path.endswith("/global"):
            body = {"data": {"market_cap_change_percentage_24h_usd": 1.0, "market_cap_percentage": {"btc": 55.1, "usdt": 4.4}}}
        elif path.endswith("/coins/markets"):
            body = [{"symbol": "btc", "market_cap": 1.5e12}, {"symbol": "eth", "market_cap": 4e11},
                    {"symbol": "usdt", "market_cap": 1.5e11}, {"symbol": "test", "market_cap": 1e9}]
        else:
            return route.fulfill(status=404, body="{}")
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body),
                      headers={"Access-Control-Allow-Origin": "*"})


@pytest.fixture(scope="module")
def server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(MOBILE_DIR))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def _page(p, server, market, scheme="dark"):
    exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
    browser = p.chromium.launch(executable_path=exe if os.path.exists(exe) else None)
    ctx = browser.new_context(**p.devices["Pixel 7"], color_scheme=scheme, locale="tr-TR")
    errors: list[str] = []
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("https://api.binance.com/**", market.handle)
    page.route("https://fapi.binance.com/**", market.handle)
    page.route("https://api.coingecko.com/**", market.handle)
    page.goto(server + "/index.html")
    return browser, page, errors


def test_scan_finds_signal_on_phone(server):
    market = MockMarket()
    with pw.sync_playwright() as p:
        browser, page, errors = _page(p, server, market)
        page.click("#scanBtn")
        page.wait_for_selector("#signalsTitle:not([hidden])", timeout=60_000)
        assert page.inner_text("#signalsTitle") == "Sinyaller (1)"
        assert "TEST/USDT" in page.inner_text("#signals")
        assert "Stop-Loss" in page.inner_text("#signals")
        assert "GÜVENLİ" in page.inner_text("#macroCard")
        assert market.depth_calls and set(market.depth_calls) == {"TESTUSDT"}  # ağır veri yalnız adaya
        # Yatay kaydırma olmamalı
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.screenshot(path=str(SCREENSHOT_DIR / "mobil-tarama.png"), full_page=True)
        # Sonuç kaydedildi: sayfa yenilenince geri gelir
        page.reload()
        page.wait_for_selector("#signalsTitle:not([hidden])")
        assert "TEST/USDT" in page.inner_text("#signals")
        assert not errors, errors
        browser.close()


def test_coin_inspect_and_unknown_symbol(server):
    market = MockMarket()
    with pw.sync_playwright() as p:
        browser, page, errors = _page(p, server, market, scheme="light")
        page.click(".tabbar button[data-tab=coin]")
        page.fill("#coinInput", "dead")
        page.click("#coinForm button[type=submit]")
        page.wait_for_selector("#coinResult article", timeout=60_000)
        text = page.inner_text("#coinResult")
        assert "DEAD/USDT" in text and "✗" in text
        page.screenshot(path=str(SCREENSHOT_DIR / "mobil-incele.png"), full_page=True)
        page.fill("#coinInput", "YOKBOYLE")
        page.click("#coinForm button[type=submit]")
        page.wait_for_selector("#coinError:not([hidden])", timeout=30_000)
        assert "bulunamadı" in page.inner_text("#coinError")
        assert not errors, errors
        browser.close()


def test_macro_lock_blocks_scan(server):
    market = MockMarket(locked=True)
    with pw.sync_playwright() as p:
        browser, page, errors = _page(p, server, market)
        page.click("#scanBtn")
        page.wait_for_selector("#signalsTitle:not([hidden])", timeout=60_000)
        assert "kilitli" in page.inner_text("#macroCard")
        assert "tarama yapılmadı" in page.inner_text("#signals")
        assert market.depth_calls == []
        assert not errors, errors
        browser.close()
