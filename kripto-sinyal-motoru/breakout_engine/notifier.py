"""Opsiyonel Telegram bildirimleri (tekrar gönderimi engelleyen bekleme süresiyle)."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import aiohttp

from .config import NotifyConfig
from .models import Signal
from .report import telegram_message

log = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, cfg: NotifyConfig) -> None:
        self.cfg = cfg
        self.state_path = Path(cfg.state_file)

    @property
    def enabled(self) -> bool:
        return bool(self.cfg.telegram_token and self.cfg.telegram_chat_id)

    def _load(self) -> dict[str, float]:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save(self, state: dict[str, float]) -> None:
        self.state_path.write_text(json.dumps(state), encoding="utf-8")

    def due(self, signals: list[Signal]) -> list[Signal]:
        """Bekleme süresi dolmamış sembolleri ayıklar."""
        state = self._load()
        horizon = time.time() - self.cfg.cooldown_hours * 3600
        return [s for s in signals if state.get(f"{s.exchange}:{s.symbol}", 0) < horizon]

    async def send(self, signals: list[Signal]) -> int:
        if not self.enabled:
            return 0
        pending = self.due(signals)
        if not pending:
            return 0
        state = self._load()
        url = f"https://api.telegram.org/bot{self.cfg.telegram_token}/sendMessage"
        sent = 0
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            for s in pending:
                payload = {"chat_id": self.cfg.telegram_chat_id, "text": telegram_message(s),
                           "parse_mode": "HTML", "disable_web_page_preview": True}
                try:
                    async with session.post(url, json=payload) as r:
                        if r.status != 200:
                            log.warning("Telegram hatası %s: %s", r.status, await r.text())
                            continue
                    state[f"{s.exchange}:{s.symbol}"] = time.time()
                    sent += 1
                except aiohttp.ClientError as exc:
                    log.warning("Telegram gönderilemedi: %s", exc)
        self._save(state)
        return sent
