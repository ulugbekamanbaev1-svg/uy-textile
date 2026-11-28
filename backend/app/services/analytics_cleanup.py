"""Фоновые задачи аналитики посетителей.

Два независимых цикла в одном корутине:
* каждые 5 минут закрываем «зависшие» активные сессии;
* раз в сутки удаляем данные старше настроенного срока хранения.

Циклы лёгкие: один UPDATE и батчевые DELETE. Тяжёлые агрегаты
считаются только по запросу администратора, не здесь.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import AsyncSessionLocal
from app.services.analytics import cleanup_old_data, expire_stale_sessions
from app.services.store_settings import get_store_settings

logger = logging.getLogger(__name__)

SESSION_SWEEP_SECONDS = 300
CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60


async def analytics_maintenance_loop(stop_event: asyncio.Event) -> None:
    # Первый проход делаем сразу: после деплоя могли остаться старые сессии.
    elapsed_since_cleanup = CLEANUP_INTERVAL_SECONDS
    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                expired = await expire_stale_sessions(db)
            if expired:
                logger.info("Analytics: expired %s stale sessions", expired)
        except Exception as exc:  # noqa: BLE001 - фоновый цикл не должен падать
            logger.warning("Analytics session sweep failed: %s", exc)

        if elapsed_since_cleanup >= CLEANUP_INTERVAL_SECONDS:
            try:
                async with AsyncSessionLocal() as db:
                    store = await get_store_settings(db)
                    retention = int(
                        getattr(store, "analytics_retention_days", 30) or 30
                    )
                    result = await cleanup_old_data(db, retention_days=retention)
                logger.info("Analytics cleanup: %s", result)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Analytics cleanup failed: %s", exc)
            finally:
                # Пробуем снова только через сутки, даже если была ошибка.
                elapsed_since_cleanup = 0

        try:
            await asyncio.wait_for(
                stop_event.wait(), timeout=SESSION_SWEEP_SECONDS
            )
        except asyncio.TimeoutError:
            pass
        elapsed_since_cleanup += SESSION_SWEEP_SECONDS
