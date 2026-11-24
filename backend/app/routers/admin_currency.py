import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.currency import CurrencyModuleState, CurrencyRateCache
from app.services.currency_rates import (
    PROVIDER_NAME,
    SUPPORTED_CURRENCIES,
    SUPPORTED_SOURCE_TYPES,
    get_or_create_state,
    refresh_currency_cache,
)
from app.services.rate_limit import client_key, currency_refresh_limiter
from app.services.telegram_auth import require_admin

router = APIRouter(
    prefix="/api/admin/currency",
    tags=["Admin Currency"],
    dependencies=[Depends(require_admin)],
)


async def _status(db: AsyncSession) -> dict:
    state = await get_or_create_state(db)
    caches = (await db.execute(select(CurrencyRateCache))).scalars().all()
    bank_counts = {}
    stale = []
    for c in caches:
        try:
            payload = json.loads(c.payload_json or "{}")
            banks = payload.get("banks") or []
        except Exception:
            banks = []
        bank_counts[c.currency] = len(banks)
        if c.is_stale:
            stale.append(c.currency)
    for cur in SUPPORTED_CURRENCIES:
        bank_counts.setdefault(cur, 0)
    return {
        "enabled": bool(state.enabled),
        "provider": state.provider,
        "provider_name": PROVIDER_NAME,
        "source_url": state.source_url or settings.CURRENCY_API_BASE_URL,
        "attribution": state.attribution or "bank.uz orqali Wasyt API",
        "supported_currencies": SUPPORTED_CURRENCIES,
        "supported_source_types": SUPPORTED_SOURCE_TYPES,
        "refresh_minutes": state.refresh_minutes,
        "last_success_at": state.last_success_at.isoformat() if state.last_success_at else None,
        "last_error": state.last_error or "",
        "last_error_at": state.last_error_at.isoformat() if state.last_error_at else None,
        "last_refresh_at": state.last_refresh_at.isoformat() if state.last_refresh_at else None,
        "cache_entries": len(caches),
        "bank_counts": bank_counts,
        "stale_currencies": stale,
        "manual_refresh_seconds": max(10, int(settings.CURRENCY_MANUAL_REFRESH_SECONDS or 60)),
    }


@router.get("/status")
async def currency_status(db: AsyncSession = Depends(get_db)):
    return await _status(db)


@router.put("/settings")
async def currency_settings_update(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    state = await get_or_create_state(db)
    if "enabled" in payload:
        state.enabled = bool(payload["enabled"])
    if "refresh_minutes" in payload:
        try:
            minutes = int(payload["refresh_minutes"])
        except Exception:
            raise HTTPException(status_code=400, detail="refresh_minutes must be integer")
        if minutes < 5 or minutes > 1440:
            raise HTTPException(status_code=400, detail="refresh_minutes must be 5..1440")
        state.refresh_minutes = minutes
    await db.commit()
    return await _status(db)


@router.post("/refresh")
async def currency_refresh(request: Request, db: AsyncSession = Depends(get_db)):
    host = request.client.host if request.client else "unknown"
    if not currency_refresh_limiter.allow(client_key(host, "admin_currency_refresh")):
        raise HTTPException(status_code=429, detail="Too many refresh requests")
    result = await refresh_currency_cache(db, manual=True)
    status = await _status(db)
    status["refresh_result"] = result
    return status