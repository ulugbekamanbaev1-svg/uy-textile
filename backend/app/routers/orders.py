import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Order, OrderItem, Product
from app.schemas.order import (
    OrderCreate,
    OrderCreated,
    OrderOut,
    OrderStatusUpdate,
)
from app.services.cart_reminders import cancel_cart_reminder
from app.services.notify import notify_admin_about_order
from app.services.pricing import (
    effective_unit_price,
    normalize_meters,
    round_money,
)

router = APIRouter(prefix="/api/orders", tags=["Orders"])


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
        created_at=order.created_at,
        items=order.items,
    )


@router.get("/track", response_model=list[OrderOut])
async def track_orders(
    phone: str | None = Query(default=None, max_length=40),
    number: str | None = Query(default=None, max_length=20),
    db: AsyncSession = Depends(get_db),
):
    phone_digits = re.sub(r"\D", "", phone or "")
    number_clean = (number or "").strip().upper()

    if len(phone_digits) < 7 and not number_clean:
        raise HTTPException(
            status_code=422,
            detail="Укажите номер телефона или номер заказа",
        )

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(20)
    )

    if number_clean:
        # UY-00012 -> id 12
        match = re.search(r"(\d+)$", number_clean)
        if not match:
            raise HTTPException(status_code=422, detail="Некорректный номер заказа")
        order_id = int(match.group(1))
        stmt = stmt.where(Order.id == order_id)
    elif phone_digits:
        tail = phone_digits[-9:]
        stmt = stmt.where(
            func.regexp_replace(Order.phone, r"\D", "", "g").like(f"%{tail}%")
        )

    result = await db.execute(stmt)
    return [order_to_out(order) for order in result.scalars().all()]


@router.post("", response_model=OrderCreated, status_code=201)
async def create_order(
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    digits = sum(character.isdigit() for character in payload.phone)

    if digits < 7:
        raise HTTPException(
            status_code=422,
            detail="Укажите корректный номер телефона",
        )

    order = Order(
        customer_name=payload.customer_name.strip(),
        phone=payload.phone.strip(),
        address=payload.address.strip(),
        comment=payload.comment.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        telegram_id=payload.telegram_id,
        telegram_username=payload.telegram_username,
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

    background_tasks.add_task(notify_admin_about_order, order)

    return OrderCreated(
        id=order.id,
        number=order.number,
        status=order.status,
        total=order.total,
    )
