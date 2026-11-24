import asyncio
import logging

from app.config import settings
from app.database import AsyncSessionLocal
from app.services.currency_rates import get_or_create_state, refresh_currency_cache

logger = logging.getLogger(__name__)


async def run_currency_refresh_once(*, manual: bool = False) -> dict:
    async with AsyncSessionLocal() as db:
        return await refresh_currency_cache(db, manual=manual)


async def currency_refresh_loop(stop_event: asyncio.Event) -> None:
    # Initial refresh on startup (best-effort, non-blocking for app health).
    try:
        async with AsyncSessionLocal() as db:
            state = await get_or_create_state(db)
            if state.enabled and settings.CURRENCY_ENABLED:
                await refresh_currency_cache(db)
    except Exception as exc:
        logger.warning("Initial currency refresh failed: %s", exc)

    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                state = await get_or_create_state(db)
                interval = max(5, int(state.refresh_minutes or settings.CURRENCY_REFRESH_MINUTES or 15))
                enabled = bool(state.enabled and settings.CURRENCY_ENABLED)
            if enabled:
                await run_currency_refresh_once()
            else:
                interval = 60
        except Exception as exc:
            logger.warning("Currency refresh loop error: %s", exc)
            interval = 5
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval * 60)
        except asyncio.TimeoutError:
            pass