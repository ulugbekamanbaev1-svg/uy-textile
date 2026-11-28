"""Административные эндпоинты Visitor Analytics.

Доступ только через существующий require_admin (Basic Auth или
Telegram initData владельца). Никаких персональных данных: у анонимов
только visitor_uuid, у зарегистрированных — имя/username из Telegram.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    Category,
    Product,
    User,
    Visitor,
    VisitorConsent,
    VisitorEvent,
    VisitorSession,
)
from app.services import analytics as service
from app.services.telegram_auth import require_admin

router = APIRouter(
    prefix="/api/admin/analytics",
    tags=["Admin Visitor Analytics"],
    dependencies=[Depends(require_admin)],
)

TZ_LOCAL = timezone(timedelta(hours=5))  # Asia/Tashkent (без DST)
MAX_PAGE_SIZE = 100


def _range(
    period: str,
    date_from: str | None,
    date_to: str | None,
) -> tuple[datetime, datetime]:
    """Возвращает (start, end) в UTC для выбранного периода."""
    now = datetime.now(TZ_LOCAL)
    period = (period or "7d").lower()

    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif period == "yesterday":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=1)
    elif period in {"7d", "30d", "90d"}:
        days = int(period[:-1])
        start = (now - timedelta(days=days)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = now
    elif period == "custom":
        try:
            start_date = date.fromisoformat(date_from or "")
            end_date = date.fromisoformat(date_to or date_from or "")
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail="date_from/date_to must be YYYY-MM-DD"
            ) from exc
        start = datetime.combine(start_date, time.min, tzinfo=TZ_LOCAL)
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=TZ_LOCAL)
    else:  # all
        start = datetime(2020, 1, 1, tzinfo=TZ_LOCAL)
        end = now

    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _page(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, int(page))
    size = min(MAX_PAGE_SIZE, max(1, int(page_size)))
    return (page - 1) * size, size


def _user_out(user: User | None) -> dict | None:
    if user is None:
        return None
    name = " ".join(
        part for part in (user.first_name or "", user.last_name or "") if part
    ).strip()
    return {
        "id": user.id,
        "name": name or (user.username or f"ID {user.id}"),
        "username": user.username,
    }


def _product_out(product: Product | None) -> dict | None:
    if product is None:
        return None
    return {
        "id": product.id,
        "slug": product.slug,
        "name_ru": product.name_ru,
        "name_uz": product.name_uz,
        "name_uzc": product.name_uzc,
    }


def _category_out(category: Category | None) -> dict | None:
    if category is None:
        return None
    return {
        "id": category.id,
        "slug": category.slug,
        "name_ru": category.name_ru,
        "name_uz": category.name_uz,
        "name_uzc": category.name_uzc,
    }


@router.get("/live")
async def live_visitors(
    q: str = Query(default="", max_length=120),
    type: str = Query(default="all", pattern="^(all|anonymous|registered)$"),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    cutoff = service.now_utc() - timedelta(
        seconds=max(10, settings.ANALYTICS_ONLINE_SECONDS)
    )

    base_conditions = [
        VisitorSession.status == "active",
        VisitorSession.last_seen_at >= cutoff,
    ]
    if type != "all":
        base_conditions.append(Visitor.visitor_type == type)
    if q.strip():
        like = f"%{q.strip()}%"
        base_conditions.append(
            or_(
                func.cast(Visitor.visitor_uuid, String).ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
                User.username.ilike(like),
                VisitorSession.current_page.ilike(like),
            )
        )

    total_online = await db.scalar(
        select(func.count(VisitorSession.id))
        .select_from(VisitorSession)
        .join(Visitor, Visitor.id == VisitorSession.visitor_id)
        .outerjoin(User, User.id == Visitor.user_id)
        .where(*base_conditions)
    )

    anon_online = await db.scalar(
        select(func.count(VisitorSession.id))
        .select_from(VisitorSession)
        .join(Visitor, Visitor.id == VisitorSession.visitor_id)
        .where(
            VisitorSession.status == "active",
            VisitorSession.last_seen_at >= cutoff,
            Visitor.visitor_type == "anonymous",
        )
    )

    rows = (
        await db.execute(
            select(VisitorSession, Visitor, User)
            .join(Visitor, Visitor.id == VisitorSession.visitor_id)
            .outerjoin(User, User.id == Visitor.user_id)
            .where(*base_conditions)
            .order_by(VisitorSession.last_seen_at.desc())
            .limit(limit)
        )
    ).all()

    session_ids = [session.id for session, _, _ in rows]
    last_products: dict[int, dict] = {}
    if session_ids:
        events = (
            await db.execute(
                select(
                    VisitorEvent.session_id,
                    VisitorEvent.product_id,
                    VisitorEvent.page_url,
                    VisitorEvent.created_at,
                )
                .where(
                    VisitorEvent.session_id.in_(session_ids),
                    VisitorEvent.product_id.isnot(None),
                )
                .distinct(VisitorEvent.session_id)
                .order_by(VisitorEvent.session_id, VisitorEvent.created_at.desc())
            )
        ).all()

        product_ids = {row.product_id for row in events if row.product_id}
        products: dict[int, Product] = {}
        if product_ids:
            product_rows = (
                await db.execute(select(Product).where(Product.id.in_(product_ids)))
            ).scalars().all()
            products = {product.id: product for product in product_rows}

        for row in events:
            last_products[row.session_id] = {
                "product": _product_out(products.get(row.product_id)),
                "page_url": row.page_url,
                "at": service.to_iso(row.created_at),
            }

    now = service.now_utc()
    items = []
    for session, visitor, user in rows:
        items.append(
            {
                "visitor_id": visitor.id,
                "visitor_uuid": str(visitor.visitor_uuid),
                "visitor_type": visitor.visitor_type,
                "user": _user_out(user),
                "session_id": session.id,
                "session_uuid": str(session.session_uuid),
                "started_at": service.to_iso(session.started_at),
                "last_seen_at": service.to_iso(session.last_seen_at),
                "online": True,
                "duration_seconds": int(
                    (now - _aware(session.started_at)).total_seconds()
                ),
                "current_page": session.current_page,
                "device_type": session.device_type,
                "browser": session.browser,
                "last_product": last_products.get(session.id),
            }
        )

    return {
        "online": int(total_online or 0),
        "anonymous": int(anon_online or 0),
        "registered": int((total_online or 0) - (anon_online or 0)),
        "online_seconds": settings.ANALYTICS_ONLINE_SECONDS,
        "visitors": items,
    }


def _aware(value: datetime | None) -> datetime:
    if value is None:
        return service.now_utc()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


@router.get("/visitors")
async def visitors(
    period: str = Query(default="7d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    type: str = Query(default="all", pattern="^(all|anonymous|registered)$"),
    kind: str = Query(default="all", pattern="^(all|new|returning)$"),
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    start, end = _range(period, date_from, date_to)
    offset, limit = _page(page, page_size)

    conditions = [
        Visitor.last_seen_at >= start,
        Visitor.last_seen_at <= end,
    ]
    if type != "all":
        conditions.append(Visitor.visitor_type == type)
    if kind == "new":
        conditions.append(Visitor.first_seen_at >= start)
    elif kind == "returning":
        conditions.append(Visitor.first_seen_at < start)
    if q.strip():
        like = f"%{q.strip()}%"
        conditions.append(
            or_(
                func.cast(Visitor.visitor_uuid, String).ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
                User.username.ilike(like),
            )
        )

    count_stmt = (
        select(func.count(Visitor.id))
        .select_from(Visitor)
        .outerjoin(User, User.id == Visitor.user_id)
        .where(*conditions)
    )
    total = int(await db.scalar(count_stmt) or 0)

    rows = (
        await db.execute(
            select(Visitor, User)
            .outerjoin(User, User.id == Visitor.user_id)
            .where(*conditions)
            .order_by(Visitor.last_seen_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    visitor_ids = [visitor.id for visitor, _ in rows]
    session_counts: dict[int, int] = {}
    product_views: dict[int, int] = {}
    if visitor_ids:
        session_counts = dict(
            (
                await db.execute(
                    select(VisitorSession.visitor_id, func.count(VisitorSession.id))
                    .where(VisitorSession.visitor_id.in_(visitor_ids))
                    .group_by(VisitorSession.visitor_id)
                )
            ).all()
        )
        product_views = dict(
            (
                await db.execute(
                    select(VisitorEvent.visitor_id, func.count(VisitorEvent.id))
                    .where(
                        VisitorEvent.visitor_id.in_(visitor_ids),
                        VisitorEvent.event_type == "product_view",
                    )
                    .group_by(VisitorEvent.visitor_id)
                )
            ).all()
        )

    items = []
    for visitor, user in rows:
        items.append(
            {
                "id": visitor.id,
                "visitor_uuid": str(visitor.visitor_uuid),
                "visitor_type": visitor.visitor_type,
                "user": _user_out(user),
                "device_type": visitor.device_type,
                "first_seen_at": service.to_iso(visitor.first_seen_at),
                "last_seen_at": service.to_iso(visitor.last_seen_at),
                "sessions": int(session_counts.get(visitor.id, 0)),
                "product_views": int(product_views.get(visitor.id, 0)),
                "online": service.is_online(visitor.last_seen_at),
            }
        )

    return {
        "total": total,
        "page": page,
        "page_size": limit,
        "items": items,
        "period": {"from": service.to_iso(start), "to": service.to_iso(end)},
    }


@router.get("/visitors/{visitor_id}")
async def visitor_detail(
    visitor_id: int,
    event_page: int = Query(default=1, ge=1),
    event_page_size: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    event_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    visitor = await db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=404, detail="Visitor not found")

    user = await db.get(User, visitor.user_id) if visitor.user_id else None
    consent = await db.scalar(
        select(VisitorConsent.analytics_consent).where(
            VisitorConsent.visitor_id == visitor.id
        )
    )

    sessions = (
        await db.execute(
            select(VisitorSession)
            .where(VisitorSession.visitor_id == visitor.id)
            .order_by(VisitorSession.started_at.desc())
            .limit(50)
        )
    ).scalars().all()

    session_ids = [session.id for session in sessions]
    event_counts: dict[int, int] = {}
    if session_ids:
        event_counts = dict(
            (
                await db.execute(
                    select(VisitorEvent.session_id, func.count(VisitorEvent.id))
                    .where(VisitorEvent.session_id.in_(session_ids))
                    .group_by(VisitorEvent.session_id)
                )
            ).all()
        )

    offset, limit = _page(event_page, event_page_size)
    conditions = [VisitorEvent.visitor_id == visitor.id]
    if event_type:
        conditions.append(VisitorEvent.event_type == event_type)

    total_events = int(
        await db.scalar(
            select(func.count(VisitorEvent.id)).where(*conditions)
        )
        or 0
    )

    event_rows = (
        await db.execute(
            select(VisitorEvent, Product, Category)
            .outerjoin(Product, Product.id == VisitorEvent.product_id)
            .outerjoin(Category, Category.id == VisitorEvent.category_id)
            .where(*conditions)
            .order_by(VisitorEvent.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    return {
        "visitor": {
            "id": visitor.id,
            "visitor_uuid": str(visitor.visitor_uuid),
            "visitor_type": visitor.visitor_type,
            "user": _user_out(user),
            "device_type": visitor.device_type,
            "first_seen_at": service.to_iso(visitor.first_seen_at),
            "last_seen_at": service.to_iso(visitor.last_seen_at),
            "session_count": visitor.session_count,
            "online": service.is_online(visitor.last_seen_at),
            "analytics_consent": consent,
        },
        "sessions": [
            {
                "id": session.id,
                "session_uuid": str(session.session_uuid),
                "started_at": service.to_iso(session.started_at),
                "last_seen_at": service.to_iso(session.last_seen_at),
                "ended_at": service.to_iso(session.ended_at),
                "duration_seconds": int(
                    (
                        _aware(session.ended_at or session.last_seen_at)
                        - _aware(session.started_at)
                    ).total_seconds()
                ),
                "current_page": session.current_page,
                "referrer": session.referrer,
                "device_type": session.device_type,
                "browser": session.browser,
                "status": session.status,
                "events": int(event_counts.get(session.id, 0)),
            }
            for session in sessions
        ],
        "events": {
            "total": total_events,
            "page": event_page,
            "page_size": limit,
            "items": [
                {
                    "id": event.id,
                    "event_type": event.event_type,
                    "page_url": event.page_url,
                    "product": _product_out(product),
                    "category": _category_out(category),
                    "event_data": event.event_data or {},
                    "created_at": service.to_iso(event.created_at),
                    "session_id": event.session_id,
                }
                for event, product, category in event_rows
            ],
        },
    }


@router.get("/stats")
async def stats(
    period: str = Query(default="7d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    start, end = _range(period, date_from, date_to)
    in_range = and_(
        VisitorEvent.created_at >= start,
        VisitorEvent.created_at <= end,
    )

    async def event_count(event_type: str) -> int:
        return int(
            await db.scalar(
                select(func.count(VisitorEvent.id)).where(
                    in_range, VisitorEvent.event_type == event_type
                )
            )
            or 0
        )

    unique_visitors = int(
        await db.scalar(
            select(func.count(func.distinct(VisitorEvent.visitor_id))).where(in_range)
        )
        or 0
    )
    new_visitors = int(
        await db.scalar(
            select(func.count(Visitor.id)).where(
                Visitor.first_seen_at >= start,
                Visitor.first_seen_at <= end,
            )
        )
        or 0
    )
    returning_visitors = int(
        await db.scalar(
            select(func.count(Visitor.id)).where(
                Visitor.first_seen_at < start,
                Visitor.last_seen_at >= start,
            )
        )
        or 0
    )
    sessions_count = int(
        await db.scalar(
            select(func.count(VisitorSession.id)).where(
                VisitorSession.started_at >= start,
                VisitorSession.started_at <= end,
            )
        )
        or 0
    )
    all_visitors = int(
        await db.scalar(
            select(func.count(Visitor.id)).where(
                Visitor.last_seen_at >= start,
                Visitor.last_seen_at <= end,
            )
        )
        or 0
    )

    page_views = await event_count("page_view")
    product_views = await event_count("product_view")
    add_to_cart = await event_count("add_to_cart")
    checkout_start = await event_count("checkout_start")
    orders = await event_count("order_created")
    searches = await event_count("search")
    category_views = await event_count("category_view")

    conversion = round((orders / unique_visitors) * 100, 2) if unique_visitors else 0.0

    # Дневная серия по локальной дате (Asia/Tashkent).
    day_expr = func.date(func.timezone("Asia/Tashkent", VisitorEvent.created_at))
    series_rows = (
        await db.execute(
            select(day_expr.label("day"), VisitorEvent.event_type, func.count())
            .where(in_range)
            .group_by(day_expr, VisitorEvent.event_type)
            .order_by(day_expr)
        )
    ).all()
    daily: dict[str, dict] = {}
    for day_value, event_type, count in series_rows:
        key = str(day_value)
        bucket = daily.setdefault(
            key,
            {
                "date": key,
                "page_view": 0,
                "product_view": 0,
                "add_to_cart": 0,
                "checkout_start": 0,
                "order_created": 0,
            },
        )
        if event_type in bucket:
            bucket[event_type] = int(count)

    device_rows = (
        await db.execute(
            select(VisitorSession.device_type, func.count(VisitorSession.id))
            .where(
                VisitorSession.started_at >= start,
                VisitorSession.started_at <= end,
            )
            .group_by(VisitorSession.device_type)
        )
    ).all()
    devices = [
        {"device_type": device or "unknown", "count": int(count)}
        for device, count in device_rows
    ]

    referrer_rows = (
        await db.execute(
            select(VisitorSession.referrer, func.count(VisitorSession.id))
            .where(
                VisitorSession.started_at >= start,
                VisitorSession.started_at <= end,
            )
            .group_by(VisitorSession.referrer)
        )
    ).all()
    sources: dict[str, int] = {}
    for referrer, count in referrer_rows:
        source = "direct"
        if referrer:
            try:
                host = urlparse(referrer).hostname or ""
                source = host.removeprefix("www.") or "direct"
            except Exception:  # noqa: BLE001
                source = "other"
        sources[source] = sources.get(source, 0) + int(count)
    source_list = sorted(
        ({"source": name, "count": count} for name, count in sources.items()),
        key=lambda item: item["count"],
        reverse=True,
    )[:10]

    popular_products = (
        await db.execute(
            select(Product, func.count(VisitorEvent.id).label("views"))
            .join(VisitorEvent, VisitorEvent.product_id == Product.id)
            .where(in_range, VisitorEvent.event_type == "product_view")
            .group_by(Product.id)
            .order_by(func.count(VisitorEvent.id).desc())
            .limit(10)
        )
    ).all()
    popular_categories = (
        await db.execute(
            select(Category, func.count(VisitorEvent.id).label("views"))
            .join(VisitorEvent, VisitorEvent.category_id == Category.id)
            .where(in_range, VisitorEvent.event_type == "category_view")
            .group_by(Category.id)
            .order_by(func.count(VisitorEvent.id).desc())
            .limit(10)
        )
    ).all()

    return {
        "period": {"from": service.to_iso(start), "to": service.to_iso(end)},
        "totals": {
            "visitors": unique_visitors,
            "all_visitors": all_visitors,
            "new_visitors": new_visitors,
            "returning_visitors": returning_visitors,
            "sessions": sessions_count,
            "page_views": page_views,
            "product_views": product_views,
            "category_views": category_views,
            "searches": searches,
            "add_to_cart": add_to_cart,
            "checkout_start": checkout_start,
            "orders": orders,
            "conversion": conversion,
        },
        "daily": sorted(daily.values(), key=lambda item: item["date"]),
        "devices": devices,
        "sources": source_list,
        "popular_products": [
            {**_product_out(product), "views": int(views)}
            for product, views in popular_products
        ],
        "popular_categories": [
            {**_category_out(category), "views": int(views)}
            for category, views in popular_categories
        ],
    }


@router.get("/popular-products")
async def popular_products(
    period: str = Query(default="7d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    start, end = _range(period, date_from, date_to)
    in_range = and_(
        VisitorEvent.created_at >= start,
        VisitorEvent.created_at <= end,
    )

    rows = (
        await db.execute(
            select(Product, func.count(VisitorEvent.id).label("views"))
            .join(VisitorEvent, VisitorEvent.product_id == Product.id)
            .where(in_range, VisitorEvent.event_type == "product_view")
            .group_by(Product.id)
            .order_by(func.count(VisitorEvent.id).desc())
            .limit(limit)
        )
    ).all()

    product_ids = [product.id for product, _ in rows]
    cart_counts: dict[int, int] = {}
    if product_ids:
        cart_counts = dict(
            (
                await db.execute(
                    select(VisitorEvent.product_id, func.count(VisitorEvent.id))
                    .where(
                        in_range,
                        VisitorEvent.event_type == "add_to_cart",
                        VisitorEvent.product_id.in_(product_ids),
                    )
                    .group_by(VisitorEvent.product_id)
                )
            ).all()
        )

    return {
        "period": {"from": service.to_iso(start), "to": service.to_iso(end)},
        "items": [
            {
                **_product_out(product),
                "views": int(views),
                "add_to_cart": int(cart_counts.get(product.id, 0)),
            }
            for product, views in rows
        ],
    }


@router.get("/events")
async def events(
    visitor_id: int | None = Query(default=None, ge=1),
    session_id: int | None = Query(default=None, ge=1),
    event_type: str | None = Query(default=None),
    period: str = Query(default="7d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    start, end = _range(period, date_from, date_to)
    offset, limit = _page(page, page_size)

    conditions = [
        VisitorEvent.created_at >= start,
        VisitorEvent.created_at <= end,
    ]
    if visitor_id:
        conditions.append(VisitorEvent.visitor_id == visitor_id)
    if session_id:
        conditions.append(VisitorEvent.session_id == session_id)
    if event_type:
        conditions.append(VisitorEvent.event_type == event_type)

    total = int(
        await db.scalar(select(func.count(VisitorEvent.id)).where(*conditions)) or 0
    )
    rows = (
        await db.execute(
            select(VisitorEvent, Product, Category)
            .outerjoin(Product, Product.id == VisitorEvent.product_id)
            .outerjoin(Category, Category.id == VisitorEvent.category_id)
            .where(*conditions)
            .order_by(VisitorEvent.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    return {
        "total": total,
        "page": page,
        "page_size": limit,
        "items": [
            {
                "id": event.id,
                "visitor_id": event.visitor_id,
                "session_id": event.session_id,
                "event_type": event.event_type,
                "page_url": event.page_url,
                "product": _product_out(product),
                "category": _category_out(category),
                "event_data": event.event_data or {},
                "created_at": service.to_iso(event.created_at),
            }
            for event, product, category in rows
        ],
    }


@router.delete("/visitors/{visitor_id}")
async def delete_visitor(
    visitor_id: int,
    db: AsyncSession = Depends(get_db),
):
    deleted = await service.purge_visitor(db, visitor_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Visitor not found")
    return {"deleted": True, "visitor_id": visitor_id}
