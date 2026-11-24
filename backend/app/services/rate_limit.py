"""Простое ограничение частоты запросов без хранения IP-адресов.

IP-адрес хешируется с случайной солью процесса и живёт только в памяти.
Ни хеш, ни IP не записываются в базу и не попадают в QR-аналитику.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import deque

_PROCESS_SALT = secrets.token_hex(16)


def client_key(client_host: str | None, extra: str = "") -> str:
    raw = f"{client_host or 'unknown'}:{extra}".encode("utf-8")
    return hashlib.sha256(_PROCESS_SALT.encode("utf-8") + raw).hexdigest()


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int, max_keys: int = 10_000):
        self.limit = max(1, int(limit))
        self.window = max(1, int(window_seconds))
        self.max_keys = max(100, int(max_keys))
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window

        with self._lock:
            if len(self._hits) > self.max_keys:
                # Не даём памяти расти бесконечно: удаляем самые старые ключи.
                for old_key in list(self._hits)[: self.max_keys // 4]:
                    self._hits.pop(old_key, None)

            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] < cutoff:
                hits.popleft()

            if len(hits) >= self.limit:
                return False

            hits.append(now)
            return True


# Публичные маршруты QR: щедрые лимиты, но защищают от простого флуда.
qr_scan_limiter = SlidingWindowLimiter(limit=90, window_seconds=60)
qr_event_limiter = SlidingWindowLimiter(limit=60, window_seconds=60)
# Админские выгрузки QR (PNG/SVG/PDF) — дорогие операции.
qr_download_limiter = SlidingWindowLimiter(limit=60, window_seconds=60)
# Пользовательские запросы заказов: защита от перебора/флуда.
order_read_limiter = SlidingWindowLimiter(limit=60, window_seconds=60)
order_claim_limiter = SlidingWindowLimiter(limit=10, window_seconds=600)
# Currency: ручное обновление и конвертер.
currency_refresh_limiter = SlidingWindowLimiter(limit=3, window_seconds=60)
currency_convert_limiter = SlidingWindowLimiter(limit=60, window_seconds=60)
