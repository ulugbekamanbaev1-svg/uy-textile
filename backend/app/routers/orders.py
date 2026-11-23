import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Order, OrderItem, Product, QrEvent
from app.schemas.order import (
    OrderClaim,
    OrderCreate,
    OrderCreated,
    OrderOut,
)
from app.services.cart_reminders import cancel_cart_reminder
from app.services.notify import notify_admin_about_order
from app.services.pricing import (
    effective_unit_price,
    normalize_meters,
    round_money,
)
from app.services.qr import (
    attribution_cutoff,
    is_valid_token,
    is_valid_visitor_id,
    qr_token,
)
from app.services.qr_events import log_qr_event
from app.services.rate_limit import client_key, order_claim_limiter, order_read_limiter
from app.services.telegram_auth import require_telegram_user

router = APIRouter(prefix="/api/orders", tags=["Orders"])


def _request_host(request: Request) -> str | None:
    return request.client.host if request.client else None


def _normalize_phone(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _parse_order_id(number: str | None) -> int | None:
    match = re.search(r"(\d+)$", (number or "").strip())
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def order_to_out(order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        number=order.number,
        status=order.status,
        customer_name=order.customer_name,
        phone=order.phone,
        address=order.address,
        comment=order.comment,
        latitude=order.latitude,
        longitude=order.longitude,
        total=order.total,
        telegram_id=order.telegram_id,
        telegram_username=order.telegram_username,
        qr_label=order.qr_label,
        planned_delivery_at=order.planned_delivery_at,
        sewing_at=order.sewing_at,
        created_at=order.created_at,
        items=order.items,
    )


async def _load_my_orders(db: AsyncSession, telegram_id: int) -> list[OrderOut]:
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.telegram_id == telegram_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    return [order_to_out(order) for order in result.scalars().all()]


@router.get("/my", response_model=list[OrderOut])
async def my_orders(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    telegram_id = int(tg_user.get("id") or 0)
    if not order_read_limiter.allow(client_key(_request_host(request), f"orders:{telegram_id}")):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    return await _load_my_orders(db, telegram_id)


@router.get("/track", response_model=list[OrderOut])
async def track_orders(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    """
    Совместимый endpoint. Раньше принимал phone/number/username и раскрывал чужие заказы.
    Теперь требует Telegram авторизацию и возвращает ТОЛЬКО заказы текущего пользователя.
    Любые переданные phone/number/username игнорируются.
    """
    telegram_id = int(tg_user.get("id") or 0)
    if not order_read_limiter.allow(client_key(_request_host(request), f"orders:{telegram_id}")):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    return await _load_my_orders(db, telegram_id)


@router.post("/claim", response_model=OrderOut)
async def claim_order(
    payload: OrderClaim,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    """
    Безопасная привязка старого заказа без подтверждённого владельца.
    Заказ показывается/привязывается только при строгом совпадении номера и телефона,
    и только если у заказа ещё нет telegram_id.
    """
    telegram_id = int(tg_user.get("id") or 0)
    if not order_claim_limiter.allow(client_key(_request_host(request), f"claim:{telegram_id}")):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    order_id = _parse_order_id(payload.number)
    if order_id is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    phone_digits = _normalize_phone(payload.phone)
    if len(phone_digits) < 7:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Не раскрываем существование чужих/привязанных заказов.
    if order.telegram_id is not None:
        if order.telegram_id == telegram_id:
            return order_to_out(order)
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order_phone = _normalize_phone(order.phone)
    tail = phone_digits[-9:]
    if not tail or not order_phone.endswith(tail):
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order.telegram_id = telegram_id
    tg_username = (tg_user.get("username") or "").strip() or None
    if tg_username:
        order.telegram_username = tg_username

    await db.commit()
    await db.refresh(order, ["items"])
    return order_to_out(order)


@router.post("", response_model=OrderCreated, status_code=201)
async def create_order(
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    digits = sum(character.isdigit() for character in payload.phone)

    if digits < 7:
        raise HTTPException(
            status_code=422,
            detail="Укажите корректный номер телефона",
        )

    verified_telegram_id = int(tg_user.get("id") or 0)
    verified_username = (tg_user.get("username") or "").strip() or None

    qr_label: str | None = None
    qr_visitor = (payload.qr_visitor_id or "").strip()
    if payload.qr_label and qr_visitor:
        if is_valid_token(payload.qr_label) and is_valid_visitor_id(qr_visitor):
            cutoff = attribution_cutoff()
            has_open = await db.scalar(
                select(QrEvent.id)
                .where(
                    QrEvent.event_type == "miniapp_open",
                    QrEvent.token == qr_token(),
                    QrEvent.visitor_id == qr_visitor,
                    QrEvent.created_at >= cutoff,
                )
                .limit(1)
            )
            if has_open is not None:
                qr_label = qr_token()

    order = Order(
        customer_name=payload.customer_name.strip(),
        phone=payload.phone.strip(),
        address=payload.address.strip(),
        comment=payload.comment.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        telegram_id=verified_telegram_id,
        telegram_username=verified_username,
        qr_label=qr_label,
    )

    total = 0

    for item in payload.items:
        result = await db.execute(
            select(Product)
            .options(
                selectinload(Product.variants),
                selectinload(Product.colors),
                selectinload(Product.price_tiers),
                selectinload(Product.images),
            )
            .where(
                Product.slug == item.slug,
                Product.is_active.is_(True),
            )
        )
        product = result.scalar_one_or_none()

        if product is None:
            raise HTTPException(
                status_code=422,
                detail=f"Товар не найден: {item.slug}",
            )

        if not product.in_stock:
            raise HTTPException(
                status_code=422,
                detail=f"Товар временно отсутствует: {product.name_ru}",
            )

        width_cm = None
        height_cm = None
        meters = None
        variant_label = ""
        unit_price = 0
        line_amount = float(item.quantity)

        if product.pricing_type == "area":
            if not item.width_cm or not item.height_cm:
                raise HTTPException(
                    status_code=422,
                    detail="Для индивидуального заказа укажите размеры",
                )

            width_cm = item.width_cm
            height_cm = item.height_cm
            area = (width_cm * height_cm) / 10000
            base_price = product.price_per_m2 or 0
            line_amount = area * item.quantity
            unit_price = effective_unit_price(
                product.price_tiers, line_amount, base_price
            )
            variant_label = f"{width_cm}×{height_cm} см"

        elif product.pricing_type == "meter":
            if not item.meters or item.meters <= 0:
                raise HTTPException(
                    status_code=422,
                    detail="Укажите, сколько метров нужно",
                )

            meters = normalize_meters(item.meters)
            active_variants = [
                variant for variant in product.variants if variant.is_active
            ]
            variant = next(
                (
                    candidate
                    for candidate in active_variants
                    if candidate.id == item.variant_id
                ),
                None,
            )

            if variant is None and active_variants:
                raise HTTPException(
                    status_code=422,
                    detail=f"Выберите ширину ткани: {product.slug}",
                )

            base_price = (
                variant.price
                if variant is not None
                else (product.price_per_m2 or 0)
            )
            unit_price = effective_unit_price(
                product.price_tiers, meters, base_price
            )
            variant_label = variant.label if variant is not None else ""
            line_amount = meters

        else:
            active_variants = [
                variant for variant in product.variants if variant.is_active
            ]
            variant = next(
                (
                    candidate
                    for candidate in active_variants
                    if candidate.id == item.variant_id
                ),
                None,
            )

            if variant is None and active_variants:
                raise HTTPException(
                    status_code=422,
                    detail=f"Выберите размер товара: {product.slug}",
                )

            base_price = (
                variant.price
                if variant is not None
                else (product.price_per_m2 or 0)
            )
            unit_price = effective_unit_price(
                product.price_tiers, float(item.quantity), base_price
            )
            variant_label = variant.label if variant is not None else ""
            line_amount = float(item.quantity)

        if unit_price <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"Не удалось рассчитать цену: {product.slug}",
            )

        color = None

        if item.color_id is not None:
            color = next(
                (
                    candidate
                    for candidate in product.colors
                    if candidate.id == item.color_id
                ),
                None,
            )

            if color is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Цвет не найден: {product.slug}",
                )

        line_total = round_money(unit_price * line_amount)
        total += line_total

        image_url = product.image_url or ""
        if not image_url and product.images:
            image_url = product.images[0].url

        order.items.append(
            OrderItem(
                product_id=product.id,
                product_slug=product.slug,
                name_ru=product.name_ru,
                name_uz=product.name_uz,
                name_uzc=product.name_uzc,
                variant_label=variant_label,
                color_ru=color.name_ru if color else "",
                color_uz=color.name_uz if color else "",
                color_uzc=color.name_uzc if color else "",
                color_hex=color.hex if color else "",
                width_cm=width_cm,
                height_cm=height_cm,
                meters=meters,
                pricing_type=product.pricing_type,
                image_url=image_url or "",
                unit_price=unit_price,
                quantity=1 if product.pricing_type == "meter" else item.quantity,
                line_total=line_total,
            )
        )

    order.total = total
    if order.telegram_id:
        await cancel_cart_reminder(db, order.telegram_id)

    db.add(order)
    await db.commit()

    if order.qr_label:
        try:
            await log_qr_event(
                db,
                "order_created",
                order.qr_label,
                visitor_id=qr_visitor if is_valid_visitor_id(qr_visitor) else None,
                order_id=order.id,
                meta="order",
            )
        except Exception:
            await db.rollback()

    background_tasks.add_task(notify_admin_about_order, order)

    return OrderCreated(
        id=order.id,
        number=order.number,
        status=order.status,
        total=order.total,
    )
