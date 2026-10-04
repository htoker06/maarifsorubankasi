"""Terminal (rich) raporu, JSON çıktısı ve Telegram mesaj formatı."""

from __future__ import annotations

import html
import math
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .models import MacroState, Signal


def _fmt(p: float) -> str:
    if not math.isfinite(p):
        return "—"
    return f"{p:.{max(2, 5 - int(math.floor(math.log10(abs(p)))) if p else 2)}f}"


def liquidity_label(sig: Signal) -> str:
    qv = f"{sig.quote_volume_24h / 1e6:.1f}M$"
    if sig.liquidity is None:
        return qv
    depth = min(sig.liquidity.bid_depth_usd, sig.liquidity.ask_depth_usd)
    return f"{qv} | ±2% {depth / 1e3:.0f}k$"


def render_macro(console: Console, macro: MacroState) -> None:
    color = {"GÜVENLİ": "green", "NÖTR": "yellow", "RİSKLİ": "red"}[macro.regime.value]
    lines = [
        f"Rejim: [bold {color}]{macro.regime.value}[/]  Skor: {macro.score:.0f}/100  "
        f"Kilit: {'[bold red]AKTİF[/]' if macro.locked else '[green]kapalı[/]'}",
        f"BTC {_fmt(macro.btc_close)} | SMA50 {_fmt(macro.btc_sma_fast)} | SMA200 {_fmt(macro.btc_sma_slow)}",
        f"EMA20 eğimi — BTC.D {macro.btc_dom_slope * 100:+.2f}% | USDT.D {macro.usdt_dom_slope * 100:+.2f}% | "
        f"TOTAL3 {macro.total3_slope * 100:+.2f}% | Piyasa 24s {macro.total3_change_24h * 100:+.2f}%",
    ]
    if macro.btc_dom_now is not None:
        lines.append(f"Anlık BTC.D %{macro.btc_dom_now:.2f} | USDT.D %{(macro.usdt_dom_now or 0):.2f}")
    lines += [f"• {n}" for n in macro.notes]
    console.print(Panel("\n".join(lines), title="Makro Piyasa Rejimi", expand=False))


def render_signals(console: Console, signals: list[Signal], title: str = "Kırılım Sinyalleri") -> None:
    table = Table(title=title, header_style="bold cyan", show_lines=True)
    for col in ("Sembol", "Borsa", "Skor", "Fiyat", "MA200 Mesafe", "Hacim x", "RSI",
                "Formasyon", "Tuzak Riski", "Likidite"):
        table.add_column(col, overflow="fold")
    for s in signals:
        trap = s.manipulation.trap_risk if s.manipulation else float("nan")
        table.add_row(
            s.symbol, s.exchange, f"[bold]{s.score:.1f}[/]", _fmt(s.price), f"{s.ma200_distance * 100:+.1f}%",
            f"{s.volume_mult:.1f}x", f"{s.rsi:.1f}", s.pattern_label, f"%{trap * 100:.0f}", liquidity_label(s),
        )
    console.print(table)


def render_plan(console: Console, s: Signal) -> None:
    if s.plan is None:
        return
    p = s.plan
    lines = [
        f"Alım Bölgesi: {_fmt(p.buy_zone[0])} – {_fmt(p.buy_zone[1])}   Ortalama giriş: {_fmt(p.avg_entry)}",
        "Kademeli giriş: " + " | ".join(f"%{w * 100:.0f} @ {_fmt(px)}" for px, w in p.tranches),
        f"[red]Stop-Loss: {_fmt(p.stop)}[/] (risk %{p.risk_pct * 100:.1f})",
        "Hedefler: " + " | ".join(f"{lbl}: {_fmt(px)} ({r:.1f}R)" for lbl, px, r in p.targets),
    ]
    if s.manipulation and s.manipulation.notes:
        lines.append("Notlar: " + "; ".join(s.manipulation.notes))
    comps = ", ".join(f"{k} {v * 100:.0f}" for k, v in s.components.items())
    lines.append(f"Bileşenler: {comps}  (taban {s.base_score:.1f})")
    console.print(Panel("\n".join(lines), title=f"{s.symbol} — İşlem Planı", expand=False))


def render_rejections(console: Console, candidates: list[Signal], limit: int) -> None:
    rej = [c for c in candidates if not c.passed][:limit]
    if not rej:
        return
    table = Table(title="Eşiğe Yaklaşıp Reddedilenler", header_style="bold magenta")
    table.add_column("Sembol")
    table.add_column("Skor")
    table.add_column("Başarısız Şartlar", overflow="fold")
    for c in rej:
        table.add_row(c.symbol, f"{c.score:.1f}", "; ".join(f"{g.name} ({g.detail})" for g in c.failed_gates))
    console.print(table)


def to_dict(s: Signal) -> dict[str, Any]:
    plan = s.plan
    return {
        "symbol": s.symbol,
        "exchange": s.exchange,
        "timestamp": str(s.timestamp),
        "price": s.price,
        "score": round(s.score, 2),
        "base_score": round(s.base_score, 2),
        "components": s.components,
        "pattern": s.pattern_label,
        "ma200_distance": s.ma200_distance,
        "volume_mult": s.volume_mult,
        "rsi": s.rsi,
        "quote_volume_24h": s.quote_volume_24h,
        "trap_risk": s.manipulation.trap_risk if s.manipulation else None,
        "manipulation_notes": s.manipulation.notes if s.manipulation else [],
        "gates": [{"name": g.name, "passed": g.passed, "detail": g.detail} for g in s.gates],
        "plan": None if plan is None else {
            "buy_zone": plan.buy_zone, "tranches": plan.tranches, "avg_entry": plan.avg_entry,
            "stop": plan.stop, "risk_pct": plan.risk_pct,
            "targets": [{"label": l, "price": p, "r": r} for l, p, r in plan.targets],
        },
    }


def telegram_message(s: Signal) -> str:
    e = html.escape
    lines = [
        f"🚀 <b>{e(s.symbol)}</b> ({e(s.exchange)}) — Kesinlik Skoru <b>{s.score:.1f}</b>",
        f"Formasyon: {e(s.pattern_label)}",
        f"Fiyat: {_fmt(s.price)} | MA200: {s.ma200_distance * 100:+.1f}% | Hacim: {s.volume_mult:.1f}x | RSI {s.rsi:.1f}",
        f"Likidite: {e(liquidity_label(s))}",
    ]
    if s.manipulation:
        lines.append(f"Tuzak riski: %{s.manipulation.trap_risk * 100:.0f}"
                     + (" | Sweep teyidi ✅" if s.manipulation.sweep_detected else ""))
    if s.plan:
        p = s.plan
        lines += [
            f"Alım bölgesi: {_fmt(p.buy_zone[0])} – {_fmt(p.buy_zone[1])}",
            "Kademeler: " + " | ".join(f"%{w * 100:.0f}@{_fmt(px)}" for px, w in p.tranches),
            f"⛔ Stop: {_fmt(p.stop)} (%{p.risk_pct * 100:.1f})",
            "🎯 " + " | ".join(f"{e(l)} {_fmt(px)} ({r:.1f}R)" for l, px, r in p.targets),
        ]
    lines.append("<i>Yatırım tavsiyesi değildir.</i>")
    return "\n".join(lines)
