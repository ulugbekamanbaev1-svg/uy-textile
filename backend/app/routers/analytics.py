"""Публичные эндпоинты аналитики посетителей.

Здесь нет IP-адресов, fingerprinting и сторонних трекеров: только
анонимный UUID из браузера, UUID сессии и whitelist событий.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.schemas.analytics import (
    ConsentIn,
    EventIn,
    HeartbeatIn,
    IdentifyIn,
    SessionEndIn,
    SessionStartIn,
)
from app.services import analytics as service
from app.services.rate_limit import (
    analytics_consent_limiter,
    analytics_event_limiter,
    analytics_heartbeat_limiter,
    analytics_identify_limiter,
    analytics_session_limiter,
)
from app.services.telegram_auth import verify_telegram_init_data

router = APIRouter(prefix="/api/analytics", tags=["Visitor Analytics"])


def _limit(limiter, key: str) -> None:
    if not limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many analytics requests")


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.get("/status")
async def analytics_status(
    visitor_uuid: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает состояние сбора и согласия для текущего браузера."""
    enabled = await service.analytics_enabled(db)
    visitor = await service.get_visitor(db, visitor_uuid)
    consent: bool | None = None
    if visitor is not None:
        row = await service.get_consent(db, visitor.id)
        consent = bool(row.analytics_consent) if row is not None else None
    return {
        "enabled": enabled,
        "consent": consent,
        "heartbeat_seconds": service.settings.ANALYTICS_HEARTBEAT_SECONDS,
        "online_seconds": service.settings.ANALYTICS_ONLINE_SECONDS,
    }


@router.post("/consent")
async def analytics_consent(
    payload: ConsentIn,
    db: AsyncSession = Depends(get_db),
):
    _limit(analytics_consent_limiter, str(payload.visitor_uuid))
    consent = await service.set_consent(
        db,
        payload.visitor_uuid,
        payload.analytics_consent,
        payload.consent_version,
    )
    return {
        "saved": True,
        "analytics_consent": bool(consent.analytics_consent),
        "consent_version": consent.consent_version,
    }


@router.post("/identify")
async def analytics_identify(
    payload: IdentifyIn,
    x_telegram_init_data: str | None = Header(
        default=None, alias="X-Telegram-Init-Data"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Связывает анонимную историю с аккаунтом по подписанному initData."""
    _limit(analytics_identify_limiter, str(payload.visitor_uuid))

    if not x_telegram_init_data:
        # Не ошибка: посетитель просто не авторизован через Telegram.
        return {"linked": False, "reason": "no_auth"}

    telegram_user = verify_telegram_init_data(x_telegram_init_data)
    telegram_id = int(telegram_user.get("id") or 0)
    if telegram_id <= 0:
        raise HTTPException(status_code=401, detail="Invalid Telegram user")

    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        return {"linked": False, "reason": "user_not_found"}

    result = await service.identify_visitor(
        db, visitor_uuid=payload.visitor_uuid, user_id=user.id
    )
    return result


@router.post("/session/start")
async def analytics_session_start(
    payload: SessionStartIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _limit(analytics_session_limiter, str(payload.visitor_uuid))
    return await service.start_session(
        db,
        visitor_uuid=payload.visitor_uuid,
        session_uuid=payload.session_uuid,
        page=payload.page,
        referrer=payload.referrer,
        user_agent=_ua(request),
    )


@router.post("/heartbeat")
async def analytics_heartbeat(
    payload: HeartbeatIn,
    db: AsyncSession = Depends(get_db),
):
    _limit(analytics_heartbeat_limiter, str(payload.session_uuid))
    return await service.heartbeat(
        db,
        visitor_uuid=payload.visitor_uuid,
        session_uuid=payload.session_uuid,
        page=payload.page,
    )


@router.post("/event")
async def analytics_event(
    payload: EventIn,
    db: AsyncSession = Depends(get_db),
):
    _limit(analytics_event_limiter, str(payload.visitor_uuid))
    try:
        return await service.log_event(
            db,
            visitor_uuid=payload.visitor_uuid,
            session_uuid=payload.session_uuid,
            event_uuid=payload.event_uuid,
            event_type=payload.event_type,
            page_url=payload.page_url,
            product_id=payload.product_id,
            category_id=payload.category_id,
            event_data=payload.event_data,
        )
    except service.ConsentRequiredError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except service.AnalyticsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/session/end")
async def analytics_session_end(
    payload: SessionEndIn,
    db: AsyncSession = Depends(get_db),
):
    _limit(analytics_session_limiter, str(payload.visitor_uuid))
    return await service.end_session(
        db,
        visitor_uuid=payload.visitor_uuid,
        session_uuid=payload.session_uuid,
    )
