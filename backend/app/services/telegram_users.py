"""Telegram users audit, activity tracking, and safe recovery helpers.

All recovery operations in this module are READ-ONLY unless explicitly
implemented as apply with confirmation flags in a dedicated script.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import String, cast, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _display_name(user: User) -> str:
    name = " ".join(
        part for part in [(user.first_name or "").strip(), (user.last_name or "").strip()] if part
    ).strip()
    return name or (user.username or "") or f"TG {user.telegram_id}"


async def upsert_telegram_user(
    db: AsyncSession,
    *,
    telegram_id: int,
    first_name: str = "",
    last_name: str = "",
    username: str | None = None,
    language_code: str | None = None,
    source: str,
    event: str,
    seen_at: datetime | None = None,
    commit: bool = True,
) -> User:
    """Create or update a Telegram user from a verified Telegram identity.

    `source` is a registration/acquisition source, not faked history.
    `event` is the current activity event: bot_start, mini_app_auth, mini_app_open.
    """
    if telegram_id <= 0:
        raise ValueError("telegram_id must be positive")

    seen_at = seen_at or utcnow()
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    is_new = user is None
    if is_new:
        user = User(
            telegram_id=telegram_id,
            first_name=first_name or "",
            last_name=last_name or "",
            username=username,
            language_code=language_code,
            registration_source=source or "unknown",
            created_at=seen_at,
        )
        db.add(user)
        await db.flush()

    # Profile fields: update only when we have verified data.
    user.first_name = first_name or user.first_name or ""
    user.last_name = last_name or user.last_name or ""
    if username is not None:
        user.username = username
    if language_code is not None:
        user.language_code = language_code

    if not user.registration_source or user.registration_source == "unknown":
        user.registration_source = source or "unknown"

    # Activity timestamps. Never invent bot_started_at.
    user.last_seen_at = seen_at

    if event == "bot_start":
        user.last_bot_activity_at = seen_at
        user.bot_starts_count = int(user.bot_starts_count or 0) + 1
        if user.bot_started_at is None:
            user.bot_started_at = seen_at
        if is_new and (not user.registration_source or user.registration_source == "unknown"):
            user.registration_source = "bot_start"

    elif event in {"mini_app_auth", "mini_app_open"}:
        last_mini = user.last_mini_app_at
        if last_mini is not None and last_mini.tzinfo is None:
            last_mini = last_mini.replace(tzinfo=timezone.utc)
        # Debounce: avoid double-counting React remounts / repeated auth calls.
        if last_mini is None or (seen_at - last_mini) >= timedelta(minutes=2):
            user.mini_app_visits_count = int(user.mini_app_visits_count or 0) + 1
        user.last_mini_app_at = seen_at
        if user.first_mini_app_at is None:
            user.first_mini_app_at = seen_at
        if is_new and user.registration_source == "unknown":
            user.registration_source = "mini_app"

    if commit:
        await db.commit()
        await db.refresh(user)
    else:
        await db.flush()

    return user


async def get_audit_summary(db: AsyncSession) -> dict:
    """Read-only audit summary for admin dashboard."""
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    week_start = today_start - timedelta(days=7)
    days7 = now - timedelta(days=7)
    days30 = now - timedelta(days=30)

    users_total = int(await db.scalar(select(func.count()).select_from(User)) or 0)

    # New users: by created_at (DB record creation). We also expose this as "known in DB".
    new_today = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.created_at >= today_start)
        )
        or 0
    )
    new_week = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.created_at >= week_start)
        )
        or 0
    )

    # Active: prefer last_seen_at; fall back to created_at only when last_seen_at is null.
    last_seen_or_created = func.coalesce(User.last_seen_at, User.created_at)
    active_7d = int(
        await db.scalar(
            select(func.count()).select_from(User).where(last_seen_or_created >= days7)
        )
        or 0
    )
    active_30d = int(
        await db.scalar(
            select(func.count()).select_from(User).where(last_seen_or_created >= days30)
        )
        or 0
    )
    inactive_30d = max(0, users_total - active_30d)

    bot_start_users = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.bot_started_at.is_not(None))
        )
        or 0
    )
    miniapp_users = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.first_mini_app_at.is_not(None))
        )
        or 0
    )
    recovered_users = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.is_recovered.is_(True))
        )
        or 0
    )

    # Recovery candidates from existing sources (read-only).
    orders_distinct_tg = int(
        await db.scalar(
            text("SELECT COUNT(DISTINCT telegram_id) FROM orders WHERE telegram_id IS NOT NULL")
        )
        or 0
    )
    missing_from_orders = int(
        await db.scalar(
            text(
                """
                SELECT COUNT(DISTINCT o.telegram_id)
                FROM orders o
                LEFT JOIN users u ON u.telegram_id = o.telegram_id
                WHERE o.telegram_id IS NOT NULL AND u.id IS NULL
                """
            )
        )
        or 0
    )
    cart_distinct_tg = int(
        await db.scalar(
            text("SELECT COUNT(DISTINCT telegram_id) FROM cart_reminders WHERE telegram_id IS NOT NULL")
        )
        or 0
    )
    missing_from_cart = int(
        await db.scalar(
            text(
                """
                SELECT COUNT(DISTINCT cr.telegram_id)
                FROM cart_reminders cr
                LEFT JOIN users u ON u.telegram_id = cr.telegram_id
                WHERE cr.telegram_id IS NOT NULL AND u.id IS NULL
                """
            )
        )
        or 0
    )
    missing_total_union = int(
        await db.scalar(
            text(
                """
                SELECT COUNT(*) FROM (
                    SELECT DISTINCT o.telegram_id AS tid
                    FROM orders o
                    WHERE o.telegram_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = o.telegram_id)
                    UNION
                    SELECT DISTINCT cr.telegram_id AS tid
                    FROM cart_reminders cr
                    WHERE cr.telegram_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = cr.telegram_id)
                ) t
                """
            )
        )
        or 0
    )

    return {
        "users_total": users_total,
        "new_today": new_today,
        "new_week": new_week,
        "active_7d": active_7d,
        "active_30d": active_30d,
        "inactive_30d": inactive_30d,
        "bot_start_users": bot_start_users,
        "miniapp_users": miniapp_users,
        "recovered_users": recovered_users,
        "recovery_audit": {
            "orders_distinct_telegram_id": orders_distinct_tg,
            "missing_from_orders": missing_from_orders,
            "cart_distinct_telegram_id": cart_distinct_tg,
            "missing_from_cart": missing_from_cart,
            "missing_total_union": missing_total_union,
            "recoverable_now": missing_total_union,
            "known_after_recovery_estimate": users_total + missing_total_union,
            "unrecoverable_note": "Telegram Bot API не даёт исторический список всех пользователей. Индивидуально восстановимы только ID, уже сохранённые в нашей БД (orders/cart_reminders/users).",
        },
        "generated_at": _iso(now),
    }


async def list_telegram_users(
    db: AsyncSession,
    *,
    q: str = "",
    source: str = "",
    activity: str = "",
    recovered: str = "",
    page: int = 1,
    limit: int = 25,
) -> dict:
    page = max(1, int(page or 1))
    limit = min(100, max(1, int(limit or 25)))
    offset = (page - 1) * limit
    now = utcnow()
    days7 = now - timedelta(days=7)
    days30 = now - timedelta(days=30)
    last_seen_or_created = func.coalesce(User.last_seen_at, User.created_at)

    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)

    if q.strip():
        like = f"%{q.strip()}%"
        cond = or_(
            User.first_name.ilike(like),
            User.last_name.ilike(like),
            User.username.ilike(like),
            cast(User.telegram_id, String).ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    if source:
        stmt = stmt.where(User.registration_source == source)
        count_stmt = count_stmt.where(User.registration_source == source)

    if recovered == "yes":
        stmt = stmt.where(User.is_recovered.is_(True))
        count_stmt = count_stmt.where(User.is_recovered.is_(True))
    elif recovered == "no":
        stmt = stmt.where(User.is_recovered.is_(False))
        count_stmt = count_stmt.where(User.is_recovered.is_(False))

    if activity == "active_7d":
        cond = last_seen_or_created >= days7
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif activity == "active_30d":
        cond = last_seen_or_created >= days30
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif activity == "inactive_30d":
        cond = last_seen_or_created < days30
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif activity == "miniapp":
        stmt = stmt.where(User.first_mini_app_at.is_not(None))
        count_stmt = count_stmt.where(User.first_mini_app_at.is_not(None))
    elif activity == "bot_start":
        stmt = stmt.where(User.bot_started_at.is_not(None))
        count_stmt = count_stmt.where(User.bot_started_at.is_not(None))

    total = int(await db.scalar(count_stmt) or 0)
    result = await db.execute(
        stmt.order_by(last_seen_or_created.desc().nullslast(), User.id.desc())
        .offset(offset)
        .limit(limit)
    )
    users = result.scalars().all()

    return {
        "items": [serialize_telegram_user(u, now=now) for u in users],
        "total": total,
        "page": page,
        "limit": limit,
    }


def serialize_telegram_user(user: User, now: datetime | None = None) -> dict:
    now = now or utcnow()
    last_seen = user.last_seen_at or user.created_at
    if last_seen and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    active_7d = bool(last_seen and last_seen >= now - timedelta(days=7))
    active_30d = bool(last_seen and last_seen >= now - timedelta(days=30))
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "name": _display_name(user),
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "username": user.username,
        "created_at": _iso(user.created_at),
        "bot_started_at": _iso(user.bot_started_at),
        "first_mini_app_at": _iso(user.first_mini_app_at),
        "last_seen_at": _iso(user.last_seen_at),
        "last_mini_app_at": _iso(user.last_mini_app_at),
        "last_bot_activity_at": _iso(user.last_bot_activity_at),
        "mini_app_visits_count": int(user.mini_app_visits_count or 0),
        "bot_starts_count": int(user.bot_starts_count or 0),
        "sessions_count": int(user.sessions_count or 0),
        "registration_source": user.registration_source or "unknown",
        "is_recovered": bool(user.is_recovered),
        "recovered_at": _iso(user.recovered_at),
        "recovery_note": user.recovery_note,
        "active_7d": active_7d,
        "active_30d": active_30d,
    }


async def get_telegram_user_detail(db: AsyncSession, user_id: int) -> dict | None:
    user = await db.get(User, user_id)
    if user is None:
        return None

    # Read-only context from orders for visibility.
    orders_count = int(
        await db.scalar(
            text("SELECT COUNT(*) FROM orders WHERE telegram_id = :tid"),
            {"tid": user.telegram_id},
        )
        or 0
    )
    first_order_at = await db.scalar(
        text("SELECT MIN(created_at) FROM orders WHERE telegram_id = :tid"),
        {"tid": user.telegram_id},
    )
    last_order_at = await db.scalar(
        text("SELECT MAX(created_at) FROM orders WHERE telegram_id = :tid"),
        {"tid": user.telegram_id},
    )
    cart = await db.scalar(
        text("SELECT created_at FROM cart_reminders WHERE telegram_id = :tid LIMIT 1"),
        {"tid": user.telegram_id},
    )

    detail = serialize_telegram_user(user)
    detail["orders_count"] = orders_count
    detail["first_order_at"] = _iso(first_order_at)
    detail["last_order_at"] = _iso(last_order_at)
    detail["cart_reminder_at"] = _iso(cart)
    return detail
