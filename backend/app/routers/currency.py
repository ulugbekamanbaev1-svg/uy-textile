from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.currency_rates import (
    BASE_CURRENCY,
    SUPPORTED_CURRENCIES,
    SUPPORTED_SOURCE_TYPES,
    build_rates_response,
    convert_amount,
    ensure_cache_fresh,
    get_cache,
    get_or_create_state,
)
from app.services.rate_limit import client_key, currency_convert_limiter

router = APIRouter(prefix="/api/currency", tags=["Currency"])


def _validate_currency(currency: str) -> str:
    c = currency.upper().strip()
    if c not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    return c


def _validate_source_type(source_type: str) -> str:
    s = source_type.lower().strip()
    if s not in SUPPORTED_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported source type")
    return s


@router.get("/rates")
async def currency_rates(
    currency: str = Query("USD"),
    source_type: str = Query("bank"),
    sort: str = Query("name"),
    db: AsyncSession = Depends(get_db),
):
    cur = _validate_currency(currency)
    st = _validate_source_type(source_type)
    state = await get_or_create_state(db)
    if not state.enabled:
        raise HTTPException(status_code=503, detail="Currency module is disabled")
    await ensure_cache_fresh(db)
    cache = await get_cache(db, cur, st)
    data = build_rates_response(cache, state, cur, st)
    banks = data.get("banks") or []
    if sort == "buy_desc":
        banks = sorted(banks, key=lambda b: (b.get("buy") is None, -(b.get("buy") or 0), b.get("name") or ""))
    elif sort == "sell_asc":
        banks = sorted(banks, key=lambda b: (b.get("sell") is None, b.get("sell") or 10**18, b.get("name") or ""))
    else:
        banks = sorted(banks, key=lambda b: (b.get("name") or "").lower())
    data["banks"] = banks
    return data


@router.get("/best")
async def currency_best(
    currency: str = Query("USD"),
    source_type: str = Query("bank"),
    db: AsyncSession = Depends(get_db),
):
    cur = _validate_currency(currency)
    st = _validate_source_type(source_type)
    state = await get_or_create_state(db)
    if not state.enabled:
        raise HTTPException(status_code=503, detail="Currency module is disabled")
    await ensure_cache_fresh(db)
    cache = await get_cache(db, cur, st)
    data = build_rates_response(cache, state, cur, st)
    return {
        "currency": data["currency"],
        "base": BASE_CURRENCY,
        "source_type": data["source_type"],
        "updated_at": data.get("updated_at"),
        "is_stale": data.get("is_stale", False),
        "best_buy": data.get("best_buy"),
        "best_sell": data.get("best_sell"),
    }


@router.get("/sources")
async def currency_sources(db: AsyncSession = Depends(get_db)):
    state = await get_or_create_state(db)
    sources = []
    for cur in SUPPORTED_CURRENCIES:
        cache = await get_cache(db, cur, "bank")
        if cache:
            payload = build_rates_response(cache, state, cur, "bank")
            sources.append({
                "provider": state.provider,
                "name": payload.get("source_name"),
                "url": payload.get("source_url"),
                "attribution": payload.get("attribution", ""),
                "supported_currencies": SUPPORTED_CURRENCIES,
                "supported_source_types": SUPPORTED_SOURCE_TYPES,
                "updated_at": payload.get("updated_at"),
                "fetched_at": payload.get("fetched_at"),
                "is_stale": payload.get("is_stale", False),
                "stale_reason": payload.get("stale_reason", ""),
            })
            break
    if not sources:
        sources.append({
            "provider": state.provider,
            "name": "Wasyt (bank.uz)",
            "url": state.source_url or "https://bank.uz/uz/currency",
            "attribution": state.attribution or "bank.uz orqali Wasyt API",
            "supported_currencies": SUPPORTED_CURRENCIES,
            "supported_source_types": SUPPORTED_SOURCE_TYPES,
            "updated_at": None,
            "fetched_at": None,
            "is_stale": True,
            "stale_reason": "no_data",
        })
    return {
        "enabled": bool(state.enabled),
        "active_provider": state.provider,
        "refresh_minutes": state.refresh_minutes,
        "last_success_at": state.last_success_at.isoformat() if state.last_success_at else None,
        "last_error": state.last_error or "",
        "sources": sources,
    }


@router.get("/convert")
async def currency_convert(
    request: Request,
    amount: float = Query(..., gt=0, le=10_000_000_000),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    operation: str = Query("buy"),
    bank: str | None = Query(None),
    source_type: str = Query("bank"),
    db: AsyncSession = Depends(get_db),
):
    host = request.client.host if request.client else "unknown"
    if not currency_convert_limiter.allow(client_key(host, "currency_convert")):
        raise HTTPException(status_code=429, detail="Too many requests")
    state = await get_or_create_state(db)
    if not state.enabled:
        raise HTTPException(status_code=503, detail="Currency module is disabled")
    st = _validate_source_type(source_type)
    await ensure_cache_fresh(db)
    try:
        result = await convert_amount(
            db, amount=amount, from_currency=from_currency, to_currency=to_currency,
            operation=operation, bank_slug=bank, source_type=st,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc