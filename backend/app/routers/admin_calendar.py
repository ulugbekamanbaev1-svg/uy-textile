from datetime import datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Order
from app.models.order import ORDER_STATUSES
from app.routers.orders import order_to_out
from app.services.telegram_auth import require_admin

router = APIRouter(
    prefix="/api/admin/calendar",
    tags=["Admin Calendar"],
    dependencies=[Depends(require_admin)],
)


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").date()
        except Exception:
            return None


@router.get("/orders")
async def calendar_orders(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80),
    view: Literal["month", "week", "day", "list"] = "month",
    db: AsyncSession = Depends(get_db),
):
    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)
    today = datetime.now().astimezone().date()

    if start_date is None or end_date is None:
        # default current month
        start_date = today.replace(day=1)
        if start_date.month == 12:
            end_date = start_date.replace(year=start_date.year + 1, month=1) - timedelta(days=1)
        else:
            end_date = start_date.replace(month=start_date.month + 1) - timedelta(days=1)

    start_dt = datetime.combine(start_date, time.min).astimezone()
    end_dt = datetime.combine(end_date + timedelta(days=1), time.min).astimezone()

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.created_at >= start_dt, Order.created_at < end_dt)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(1000)
    )

    if status and status in ORDER_STATUSES:
        stmt = stmt.where(Order.status == status)

    if q and q.strip():
        term = q.strip()
        conditions = [
            Order.customer_name.ilike(f"%{term}%"),
            Order.number.ilike(f"%{term}%"),
        ]
        digits = "".join(ch for ch in term if ch.isdigit())
        if digits:
            try:
                conditions.append(Order.id == int(digits))
            except Exception:
                pass
        stmt = stmt.where(or_(*conditions))

    orders = (await db.execute(stmt)).scalars().all()
    items = [order_to_out(o) for o in orders]

    # Stats for selected range, respecting status filter? Better overall range stats by status.
    stats_stmt = (
        select(Order.status, func.count(Order.id))
        .where(Order.created_at >= start_dt, Order.created_at < end_dt)
        .group_by(Order.status)
    )
    status_counts = {s: 0 for s in ORDER_STATUSES}
    for st, cnt in (await db.execute(stats_stmt)).all():
        status_counts[st] = int(cnt)

    today_start = datetime.combine(today, time.min).astimezone()
    today_end = today_start + timedelta(days=1)
    today_count = await db.scalar(
        select(func.count()).select_from(Order).where(Order.created_at >= today_start, Order.created_at < today_end)
    ) or 0

    return {
        "view": view,
        "date_from": start_date.isoformat(),
        "date_to": end_date.isoformat(),
        "stats": {
            "today": int(today_count),
            "new": status_counts.get("new", 0),
            "confirmed": status_counts.get("confirmed", 0),
            "delivering": status_counts.get("delivering", 0),
            "done": status_counts.get("done", 0),
            "cancelled": status_counts.get("cancelled", 0),
            "total": sum(status_counts.values()),
        },
        "orders": [o.model_dump(mode="json") for o in items],
    }
