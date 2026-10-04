"""Komut satırı arayüzü.

    python -m breakout_engine scan                 # tek tarama
    python -m breakout_engine watch --interval 60  # sürekli tarama (dakika)
    python -m breakout_engine backtest --symbol SOL/USDT
    python -m breakout_engine config > ayarlar.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone

import ccxt
from rich.console import Console

from .backtest import summarize, walk_forward
from .config import EngineConfig, load_config
from .exchange import ExchangeClient
from .notifier import TelegramNotifier
from .report import render_macro, render_plan, render_rejections, render_signals, to_dict
from .scanner import BreakoutScanner

console = Console()


async def _scan(cfg: EngineConfig, args: argparse.Namespace) -> int:
    scanner = BreakoutScanner(cfg)
    notifier = TelegramNotifier(cfg.notify)
    symbols = [s.strip() for s in args.symbols.split(",")] if args.symbols else None
    async with ExchangeClient(cfg.exchange) as ex:
        result = await scanner.run_once(ex, symbols=symbols, ignore_lock=args.ignore_lock)
    render_macro(console, result.macro)
    console.print(f"Taranan: {result.scanned} sembol | Aşama-2 adayı: {len(result.candidates)} | "
                  f"Hata: {result.errors} | {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC")
    if result.signals:
        render_signals(console, result.signals)
        for s in result.signals:
            render_plan(console, s)
    else:
        console.print("[yellow]Tüm şartları ve skor eşiğini geçen varlık yok.[/]")
    if args.show_rejected:
        render_rejections(console, result.candidates, args.show_rejected)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"macro": result.macro.regime.value, "macro_score": result.macro.score,
                       "signals": [to_dict(s) for s in result.signals],
                       "candidates": [to_dict(s) for s in result.candidates]}, fh, ensure_ascii=False, indent=2, default=str)
    if args.notify and notifier.enabled:
        sent = await notifier.send(result.signals)
        console.print(f"Telegram: {sent} bildirim gönderildi")
    return len(result.signals)


async def _watch(cfg: EngineConfig, args: argparse.Namespace) -> None:
    while True:
        try:
            await _scan(cfg, args)
        except Exception as exc:  # döngü tek bir hatada ölmemeli
            logging.exception("Tarama hatası: %s", exc)
        await asyncio.sleep(args.interval * 60)


async def _backtest(cfg: EngineConfig, args: argparse.Namespace) -> None:
    async with ExchangeClient(cfg.exchange) as ex:
        df = await ex.daily(args.symbol, args.days)
        btc = await ex.daily(f"BTC/{cfg.exchange.quote}", args.days)
    trades = walk_forward(df, cfg, btc, symbol=args.symbol, horizon=args.horizon)
    for t in trades:
        console.print(f"{t.date:%Y-%m-%d} skor {t.score:.1f} {t.pattern} | giriş {t.entry:.6g} stop {t.stop:.6g} "
                      f"hedef {t.target:.6g} -> {t.outcome} {t.r_multiple:+.2f}R ({t.bars} gün)")
    console.print(summarize(trades))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="breakout_engine", description="Dip Kırılım ve Formasyon Tarayıcısı")
    p.add_argument("--config", help="JSON ayar dosyası")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    for name in ("scan", "watch"):
        sp = sub.add_parser(name)
        sp.add_argument("--symbols", help="Virgülle ayrılmış semboller (örn. SOL/USDT,INJ/USDT)")
        sp.add_argument("--json", help="Sonuçları JSON dosyasına yaz")
        sp.add_argument("--show-rejected", type=int, default=0, metavar="N",
                        help="Reddedilen ilk N adayı gerekçesiyle göster")
        sp.add_argument("--ignore-lock", action="store_true",
                        help="Makro kilidi atla (sadece araştırma; şart yine başarısız görünür)")
        sp.add_argument("--notify", action="store_true", help="Telegram bildirimi gönder")
        if name == "watch":
            sp.add_argument("--interval", type=float, default=60.0, help="Dakika")

    bp = sub.add_parser("backtest")
    bp.add_argument("--symbol", required=True)
    bp.add_argument("--days", type=int, default=1000)
    bp.add_argument("--horizon", type=int, default=60)
    sub.add_parser("config", help="Varsayılan ayarları JSON olarak yazdır")

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config)
    if args.cmd == "config":
        cfg.notify.telegram_token = cfg.notify.telegram_chat_id = None
        json.dump(cfg.to_dict(), sys.stdout, ensure_ascii=False, indent=2)
        return
    runner = {"scan": _scan, "watch": _watch, "backtest": _backtest}[args.cmd]
    try:
        asyncio.run(runner(cfg, args))
    except ccxt.BaseError as exc:
        console.print(f"[red]Borsa bağlantı hatası:[/] {type(exc).__name__}: {str(exc)[:300]}")
        sys.exit(1)
    except KeyboardInterrupt:
        console.print("Durduruldu.")


if __name__ == "__main__":
    main()
