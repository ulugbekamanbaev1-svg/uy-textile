"""Запись событий QR-аналитики с защитой от дублей."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.qr import QR_EVENT_TYPES, QrEvent


def _event_time() -> datetime:
    return datetime.now(timezone.utc)


async def log_qr_event(
    db: AsyncSession,
    event_type: str,
    token: str,
    visitor_id: str | None = None,
    session_id: str | None = None,
    order_id: int | None = None,
    dedupe_minutes: int | None = None,
    meta: str = "",
) -> bool:
    """
    Пишет событие и возвращает True, если оно действительно сохранено.

    Дубли отсекаются:
    - для order_created / order_completed — по order_id (навсегда);
    - для остальных событий — по visitor_id за последние dedupe_minutes.
    """
    if event_type not in QR_EVENT_TYPES:
        raise ValueError(f"Unknown QR event type: {event_type}")

    if event_type in ("order_created", "order_completed"):
        if order_id is None:
            return False

        exists = await db.scalar(
            select(QrEvent.id)
            .where(
                QrEvent.event_type == event_type,
                QrEvent.order_id == order_id,
            )
            .limit(1)
        )
        if exists is not None:
            return False

    elif visitor_id and dedupe_minutes:
        cutoff = _event_time() - timedelta(minutes=max(1, dedupe_minutes))
        exists = await db.scalar(
            select(QrEvent.id)
            .where(
                QrEvent.event_type == event_type,
                QrEvent.token == token,
                QrEvent.visitor_id == visitor_id,
                QrEvent.created_at >= cutoff,
            )
            .limit(1)
        )
        if exists is not None:
            return False

    db.add(
        QrEvent(
            event_type=event_type,
            token=token,
            visitor_id=visitor_id,
            session_id=session_id,
            order_id=order_id,
            meta=(meta or "")[:200],
        )
    )
    await db.commit()
    return True
