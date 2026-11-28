"""Сервис аналитики посетителей (first-party, без IP и fingerprinting)."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analytics import (
    Visitor,
    VisitorConsent,
    VisitorEvent,
    VisitorSession,
)
from app.models.catalog import Category, Product
from app.services.store_settings import get_store_settings

ALLOWED_EVENT_TYPES = {
    "page_view",
    "product_view",
    "category_view",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "checkout_start",
    "order_created",
    "login",
    "logout",
    "session_start",
    "session_end",
}

_SENSITIVE_KEYS = re.compile(
    r"(pass|pwd|card|cvv|cvc|token|secret|authori[sz]ation|pin|phone|email)",
    re.IGNORECASE,
)


class AnalyticsError(Exception):
    """Ошибка валидации аналитического запроса."""


class ConsentRequiredError(AnalyticsError):
    """Посетитель отключил аналитику."""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def is_online(last_seen: datetime | None, seconds: int | None = None) -> bool:
    if not last_seen:
        return False
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    window = seconds or settings.ANALYTICS_ONLINE_SECONDS
    return (now_utc() - last_seen) <= timedelta(seconds=max(10, int(window)))


def parse_user_agent(user_agent: str | None) -> tuple[str, str]:
    """Возвращает (device_type, browser). Сам User-Agent нигде не сохраняется."""
    ua = (user_agent or "").lower()

    if not ua:
        return "unknown", "unknown"

    if "ipad" in ua or "tablet" in ua or ("android" in ua and "mobile" not in ua):
        device = "tablet"
    elif any(token in ua for token in ("iphone", "android", "mobile", "windows phone")):
        device = "mobile"
    elif any(token in ua for token in ("bot", "crawler", "spider")):
        device = "bot"
    else:
        device = "desktop"

    if "edg/" in ua or "edgios" in ua or "edga" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "firefox" in ua or "fxios" in ua:
        browser = "Firefox"
    elif "chrome" in ua or "crios" in ua:
        browser = "Chrome"
    elif "safari" in ua:
        browser = "Safari"
    elif "telegram" in ua:
        browser = "Telegram"
    else:
        browser = "Other"

    return device, browser


def sanitize_event_data(data: Any, max_bytes: int | None = None) -> dict:
    """Убирает потенциально чувствительные поля и ограничивает размер."""
    if not isinstance(data, dict):
        return {}

    clean: dict[str, Any] = {}
    for key, value in list(data.items())[:40]:
        name = str(key)[:60]
        if _SENSITIVE_KEYS.search(name):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            if isinstance(value, str):
                clean[name] = value[:300]
            else:
                clean[name] = value
        elif isinstance(value, list):
            clean[name] = [
                item[:120] if isinstance(item, str) else item
                for item in value[:20]
                if isinstance(item, (str, int, float, bool))
            ]

    limit = max_bytes or settings.ANALYTICS_MAX_EVENT_BYTES
    try:
        encoded = json.dumps(clean, ensure_ascii=False).encode("utf-8")
    except Exception:
        return {}

    if len(encoded) > limit:
        return {}
    return clean


async def analytics_enabled(db: AsyncSession) -> bool:
    if not settings.ANALYTICS_ENABLED:
        return False
    store = await get_store_settings(db)
    return bool(getattr(store, "analytics_enabled", True))


async def get_visitor(db: AsyncSession, visitor_uuid: uuid.UUID) -> Visitor | None:
    result = await db.execute(select(Visitor).where(Visitor.visitor_uuid == visitor_uuid))
    return result.scalar_one_or_none()


async def get_or_create_visitor(
    db: AsyncSession,
    visitor_uuid: uuid.UUID,
    device_type: str = "unknown",
) -> Visitor:
    visitor = await get_visitor(db, visitor_uuid)
    if visitor is not None:
        return visitor

    visitor = Visitor(
        visitor_uuid=visitor_uuid,
        device_type=device_type or "unknown",
        visitor_type="anonymous",
        session_count=0,
    )
    db.add(visitor)
    try:
        await db.flush()
    except IntegrityError:
        # Параллельный запрос уже создал посетителя — используем его.
        await db.rollback()
        existing = await get_visitor(db, visitor_uuid)
        if existing is None:
            raise
        return existing
    return visitor


async def get_consent(db: AsyncSession, visitor_id: int) -> VisitorConsent | None:
    result = await db.execute(
        select(VisitorConsent).where(VisitorConsent.visitor_id == visitor_id)
    )
    return result.scalar_one_or_none()


async def ensure_consent(db: AsyncSession, visitor: Visitor) -> VisitorConsent:
    """Неявное согласие при первом визите; отключается в профиле."""
    consent = await get_consent(db, visitor.id)
    if consent is not None:
        return consent

    consent = VisitorConsent(
        visitor_id=visitor.id,
        analytics_consent=True,
        consent_version=settings.ANALYTICS_CONSENT_VERSION,
    )
    db.add(consent)
    await db.flush()
    return consent


async def set_consent(
    db: AsyncSession,
    visitor_uuid: uuid.UUID,
    analytics_consent: bool,
    consent_version: str | None = None,
) -> VisitorConsent:
    visitor = await get_or_create_visitor(db, visitor_uuid)
    consent = await get_consent(db, visitor.id)
    version = (consent_version or settings.ANALYTICS_CONSENT_VERSION)[:20]

    if consent is None:
        consent = VisitorConsent(
            visitor_id=visitor.id,
            analytics_consent=analytics_consent,
            consent_version=version,
        )
        db.add(consent)
    else:
        consent.analytics_consent = analytics_consent
        consent.consent_version = version
        consent.consent_updated_at = now_utc()

    if not analytics_consent:
        # Прекращаем все активные сессии, чтобы не собирать данные дальше.
        await db.execute(
            update(VisitorSession)
            .where(
                VisitorSession.visitor_id == visitor.id,
                VisitorSession.status == "active",
            )
            .values(status="ended", ended_at=now_utc())
        )

    await db.commit()
    await db.refresh(consent)
    return consent


async def _insert_event(
    db: AsyncSession,
    *,
    visitor_id: int,
    session_id: int | None,
    event_type: str,
    page_url: str = "",
    product_id: int | None = None,
    category_id: int | None = None,
    event_data: dict | None = None,
    event_uuid: uuid.UUID | None = None,
) -> bool:
    statement = (
        pg_insert(VisitorEvent)
        .values(
            visitor_id=visitor_id,
            session_id=session_id,
            event_uuid=event_uuid or uuid.uuid4(),
            event_type=event_type,
            page_url=(page_url or "")[:500],
            product_id=product_id,
            category_id=category_id,
            event_data=event_data or {},
        )
        .on_conflict_do_nothing(index_elements=["event_uuid"])
    )
    result = await db.execute(statement)
    return bool(result.rowcount)


async def start_session(
    db: AsyncSession,
    *,
    visitor_uuid: uuid.UUID,
    session_uuid: uuid.UUID,
    page: str,
    referrer: str,
    user_agent: str | None,
) -> dict:
    if not await analytics_enabled(db):
        return {"enabled": False, "consent": False, "active": False}

    device_type, browser = parse_user_agent(user_agent)
    visitor = await get_or_create_visitor(db, visitor_uuid, device_type)
    consent = await ensure_consent(db, visitor)

    if not consent.analytics_consent:
        await db.commit()
        return {
            "enabled": True,
            "consent": False,
            "active": False,
            "visitor_type": visitor.visitor_type,
        }

    result = await db.execute(
        select(VisitorSession).where(VisitorSession.session_uuid == session_uuid)
    )
    session = result.scalar_one_or_none()

    if session is None:
        session = VisitorSession(
            visitor_id=visitor.id,
            session_uuid=session_uuid,
            current_page=(page or "")[:500],
            referrer=(referrer or "")[:500],
            device_type=device_type,
            browser=browser,
            status="active",
        )
        db.add(session)
        await db.flush()
        visitor.session_count = (visitor.session_count or 0) + 1
        visitor.last_seen_at = now_utc()
        visitor.device_type = device_type
        await _insert_event(
            db,
            visitor_id=visitor.id,
            session_id=session.id,
            event_type="session_start",
            page_url=page,
            event_data={"referrer": (referrer or "")[:300], "browser": browser},
        )
    else:
        # Повторный start (React StrictMode / перезагрузка) — не дублируем сессию.
        # Если сессия была закрыта вручную, возвращаем её в active.
        if session.status != "active":
            session.status = "active"
            session.ended_at = None
        session.last_seen_at = now_utc()
        session.current_page = (page or "")[:500]
        visitor.last_seen_at = now_utc()

    await db.commit()
    await db.refresh(session)

    return {
        "enabled": True,
        "consent": True,
        "active": session.status == "active",
        "visitor_id": visitor.id,
        "visitor_type": visitor.visitor_type,
        "session_id": session.id,
        "session_uuid": str(session.session_uuid),
        "server_time": to_iso(now_utc()),
    }


async def heartbeat(
    db: AsyncSession,
    *,
    visitor_uuid: uuid.UUID,
    session_uuid: uuid.UUID,
    page: str,
) -> dict:
    result = await db.execute(
        select(
            VisitorSession.id,
            VisitorSession.status,
            Visitor.id,
            VisitorConsent.analytics_consent,
        )
        .join(Visitor, Visitor.id == VisitorSession.visitor_id)
        .outerjoin(VisitorConsent, VisitorConsent.visitor_id == Visitor.id)
        .where(
            VisitorSession.session_uuid == session_uuid,
            Visitor.visitor_uuid == visitor_uuid,
        )
    )
    row = result.first()
    if row is None:
        return {"active": False, "consent": True, "reason": "session_not_found"}

    session_id, status, visitor_id, consent = row
    if consent is False:
        return {"active": False, "consent": False}
    if status != "active":
        return {"active": False, "consent": True, "reason": "session_closed"}

    stamp = now_utc()
    await db.execute(
        update(VisitorSession)
        .where(VisitorSession.id == session_id)
        .values(last_seen_at=stamp, current_page=(page or "")[:500])
    )
    await db.execute(
        update(Visitor).where(Visitor.id == visitor_id).values(last_seen_at=stamp)
    )
    await db.commit()
    return {
        "active": True,
        "consent": True,
        "server_time": to_iso(stamp),
        "online_seconds": settings.ANALYTICS_ONLINE_SECONDS,
    }


async def log_event(
    db: AsyncSession,
    *,
    visitor_uuid: uuid.UUID,
    session_uuid: uuid.UUID,
    event_uuid: uuid.UUID,
    event_type: str,
    page_url: str,
    product_id: int | None,
    category_id: int | None,
    event_data: dict | None,
) -> dict:
    if event_type not in ALLOWED_EVENT_TYPES:
        raise AnalyticsError("unsupported_event_type")

    if not await analytics_enabled(db):
        return {"accepted": False, "reason": "disabled"}

    result = await db.execute(
        select(
            VisitorSession.id,
            VisitorSession.status,
            Visitor.id,
            VisitorConsent.analytics_consent,
        )
        .join(Visitor, Visitor.id == VisitorSession.visitor_id)
        .outerjoin(VisitorConsent, VisitorConsent.visitor_id == Visitor.id)
        .where(
            VisitorSession.session_uuid == session_uuid,
            Visitor.visitor_uuid == visitor_uuid,
        )
    )
    row = result.first()
    if row is None:
        raise AnalyticsError("session_not_found")

    session_id, status, visitor_id, consent = row
    if consent is False:
        raise ConsentRequiredError("consent_required")
    if status != "active":
        raise AnalyticsError("session_closed")

    # Проверяем существование товара/категории только для соответствующих событий.
    if product_id is not None:
        exists = await db.scalar(select(Product.id).where(Product.id == product_id))
        if exists is None:
            product_id = None
    if category_id is not None:
        exists = await db.scalar(select(Category.id).where(Category.id == category_id))
        if exists is None:
            category_id = None

    inserted = await _insert_event(
        db,
        visitor_id=visitor_id,
        session_id=session_id,
        event_type=event_type,
        page_url=page_url,
        product_id=product_id,
        category_id=category_id,
        event_data=sanitize_event_data(event_data),
        event_uuid=event_uuid,
    )

    stamp = now_utc()
    await db.execute(
        update(VisitorSession)
        .where(VisitorSession.id == session_id)
        .values(last_seen_at=stamp, current_page=(page_url or "")[:500])
    )
    await db.execute(
        update(Visitor).where(Visitor.id == visitor_id).values(last_seen_at=stamp)
    )
    await db.commit()
    return {"accepted": inserted, "duplicate": not inserted}


async def end_session(
    db: AsyncSession,
    *,
    visitor_uuid: uuid.UUID,
    session_uuid: uuid.UUID,
) -> dict:
    result = await db.execute(
        select(VisitorSession.id, Visitor.id, VisitorConsent.analytics_consent)
        .join(Visitor, Visitor.id == VisitorSession.visitor_id)
        .outerjoin(VisitorConsent, VisitorConsent.visitor_id == Visitor.id)
        .where(
            VisitorSession.session_uuid == session_uuid,
            Visitor.visitor_uuid == visitor_uuid,
        )
    )
    row = result.first()
    if row is None:
        return {"ended": False}

    session_id, visitor_id, consent = row
    stamp = now_utc()
    await db.execute(
        update(VisitorSession)
        .where(VisitorSession.id == session_id)
        .values(status="ended", ended_at=stamp, last_seen_at=stamp)
    )
    # После отзыва согласия не пишем даже session_end.
    if consent is not False:
        await _insert_event(
            db,
            visitor_id=visitor_id,
            session_id=session_id,
            event_type="session_end",
            event_data={},
        )
    await db.execute(
        update(Visitor).where(Visitor.id == visitor_id).values(last_seen_at=stamp)
    )
    await db.commit()
    return {"ended": True}


async def identify_visitor(
    db: AsyncSession,
    *,
    visitor_uuid: uuid.UUID,
    user_id: int,
) -> dict:
    visitor = await get_or_create_visitor(db, visitor_uuid)
    consent = await ensure_consent(db, visitor)
    if not consent.analytics_consent:
        await db.commit()
        return {"linked": False, "consent": False}

    visitor.user_id = user_id
    visitor.visitor_type = "registered"
    visitor.last_seen_at = now_utc()
    await db.commit()
    return {"linked": True, "consent": True, "visitor_id": visitor.id}


async def expire_stale_sessions(db: AsyncSession) -> int:
    cutoff = now_utc() - timedelta(minutes=max(5, settings.ANALYTICS_SESSION_IDLE_MINUTES))
    result = await db.execute(
        update(VisitorSession)
        .where(VisitorSession.status == "active", VisitorSession.last_seen_at < cutoff)
        .values(status="expired", ended_at=VisitorSession.last_seen_at)
    )
    await db.commit()
    return int(result.rowcount or 0)


async def cleanup_old_data(db: AsyncSession, retention_days: int | None = None) -> dict:
    days = max(1, int(retention_days or settings.ANALYTICS_RETENTION_DAYS))
    cutoff = now_utc() - timedelta(days=days)
    deleted_events = 0
    deleted_sessions = 0
    deleted_visitors = 0

    # Удаляем события батчами, чтобы не держать долгие блокировки.
    for _ in range(20):
        ids = (
            select(VisitorEvent.id)
            .where(VisitorEvent.created_at < cutoff)
            .limit(1000)
            .scalar_subquery()
        )
        result = await db.execute(delete(VisitorEvent).where(VisitorEvent.id.in_(ids)))
        count = int(result.rowcount or 0)
        deleted_events += count
        await db.commit()
        if count < 1000:
            break

    result = await db.execute(
        delete(VisitorSession).where(VisitorSession.started_at < cutoff)
    )
    deleted_sessions = int(result.rowcount or 0)
    await db.commit()

    result = await db.execute(delete(Visitor).where(Visitor.last_seen_at < cutoff))
    deleted_visitors = int(result.rowcount or 0)
    await db.commit()

    return {
        "retention_days": days,
        "deleted_events": deleted_events,
        "deleted_sessions": deleted_sessions,
        "deleted_visitors": deleted_visitors,
    }


async def purge_visitor(db: AsyncSession, visitor_id: int) -> bool:
    result = await db.execute(delete(Visitor).where(Visitor.id == visitor_id))
    await db.commit()
    return bool(result.rowcount)
