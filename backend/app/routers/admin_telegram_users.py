"""Admin endpoints for Telegram users audit and recovery (read-only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.telegram_auth import require_admin
from app.services.telegram_users import (
    get_audit_summary,
    get_telegram_user_detail,
    list_telegram_users,
)

router = APIRouter(
    prefix="/api/admin/telegram-users",
    tags=["Admin Telegram Users"],
    dependencies=[Depends(require_admin)],
)


@router.get("/summary")
async def telegram_users_summary(db: AsyncSession = Depends(get_db)):
    return await get_audit_summary(db)


@router.get("")
async def telegram_users_list(
    q: str = Query(default="", max_length=120),
    source: str = Query(default="", max_length=32),
    activity: str = Query(default="", max_length=32),
    recovered: str = Query(default="", max_length=8),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await list_telegram_users(
        db,
        q=q,
        source=source,
        activity=activity,
        recovered=recovered,
        page=page,
        limit=limit,
    )


@router.get("/recovery-candidates")
async def telegram_users_recovery_candidates(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Read-only dry-run: Telegram IDs found in orders/cart_reminders but missing in users."""
    page = max(1, page)
    limit = min(100, max(1, limit))
    offset = (page - 1) * limit

    total = int(
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

    rows = (
        await db.execute(
            text(
                """
                WITH candidates AS (
                    SELECT DISTINCT o.telegram_id AS tid
                    FROM orders o
                    WHERE o.telegram_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = o.telegram_id)
                    UNION
                    SELECT DISTINCT cr.telegram_id AS tid
                    FROM cart_reminders cr
                    WHERE cr.telegram_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = cr.telegram_id)
                )
                SELECT
                    c.tid AS telegram_id,
                    (SELECT o.telegram_username FROM orders o WHERE o.telegram_id = c.tid AND o.telegram_username IS NOT NULL AND o.telegram_username <> '' ORDER BY o.created_at DESC LIMIT 1) AS telegram_username,
                    (SELECT o.customer_name FROM orders o WHERE o.telegram_id = c.tid AND o.customer_name IS NOT NULL AND o.customer_name <> '' ORDER BY o.created_at DESC LIMIT 1) AS customer_name,
                    (SELECT MIN(o.created_at) FROM orders o WHERE o.telegram_id = c.tid) AS first_order_at,
                    (SELECT MAX(o.created_at) FROM orders o WHERE o.telegram_id = c.tid) AS last_order_at,
                    (SELECT COUNT(*) FROM orders o WHERE o.telegram_id = c.tid) AS orders_count,
                    EXISTS(SELECT 1 FROM cart_reminders cr WHERE cr.telegram_id = c.tid) AS has_cart_reminder
                FROM candidates c
                ORDER BY last_order_at DESC NULLS LAST, c.tid DESC
                OFFSET :offset LIMIT :limit
                """
            ),
            {"offset": offset, "limit": limit},
        )
    ).mappings().all()

    items = []
    for r in rows:
        first_order_at = r.get("first_order_at")
        last_order_at = r.get("last_order_at")
        items.append(
            {
                "telegram_id": int(r["telegram_id"]),
                "telegram_username": r.get("telegram_username"),
                "customer_name": r.get("customer_name"),
                "first_order_at": first_order_at.isoformat() if first_order_at else None,
                "last_order_at": last_order_at.isoformat() if last_order_at else None,
                "orders_count": int(r.get("orders_count") or 0),
                "has_cart_reminder": bool(r.get("has_cart_reminder")),
                "recovery_source": "orders/cart_reminders",
                "bot_started_at_known": False,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "dry_run": True,
        "note": "Только read-only аудит. Никакие записи не создаются. Точная дата /start неизвестна для восстановленных кандидатов.",
    }


@router.get("/{user_id}")
async def telegram_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    detail = await get_telegram_user_detail(db, user_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Telegram user not found")
    return detail
