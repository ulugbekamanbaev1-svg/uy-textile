import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import (
    GroupPurchase,
    GroupPurchaseEvent,
    GroupPurchaseParticipant,
    GroupPurchasePayment,
    Order,
    OrderItem,
    Product,
    User,
)
from app.models.group_purchase import (
    GROUP_STATUSES,
    PARTICIPANT_STATUSES,
    PAYMENT_MODES,
    generate_invite_token,
)
from app.schemas.group_purchase import GroupCreateIn, GroupJoinIn
from app.services.pricing import effective_unit_price, normalize_meters, round_money
from app.services.qr import resolve_bot_username
from app.services.telegram_auth import require_telegram_user
from app.services.group_purchase_notify import notify_group_created, notify_group_joined, notify_group_target_reached

router = APIRouter(prefix="/api/group-purchases", tags=["Group Purchases"])

MIN_GROUP_METERS = 10.0
DEFAULT_GROUP_HOURS = 48


async def _get_user(db: AsyncSession, tg_user: dict) -> User:
    tg_id = tg_user.get("id")
    result = await db.execute(select(User).where(User.telegram_id == tg_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            telegram_id=tg_id,
            first_name=tg_user.get("first_name") or "",
            last_name=tg_user.get("last_name") or "",
            username=tg_user.get("username") or "",
            language_code=tg_user.get("language_code") or "",
        )
        db.add(user)
        await db.flush()
    return user


def _now():
    return datetime.now(timezone.utc)


def _group_expired(group: GroupPurchase) -> bool:
    return bool(group.expires_at and group.expires_at <= _now() and group.status in {"open", "target_reached", "payment_pending"})


async def _refresh_group_status(group: GroupPurchase, db: AsyncSession):
    if group.status in {"completed", "cancelled"}:
        return
    if _group_expired(group):
        total = float(group.confirmed_meters or 0)
        min_m = float(group.minimum_meters or MIN_GROUP_METERS)
        if total < min_m:
            old = group.status
            group.status = "expired"
            for p in group.participants:
                if p.fulfillment_status not in {"delivered", "cancelled"} and p.payment_status != "paid":
                    p.fulfillment_status = "cancelled"
                    p.payment_status = "cancelled" if p.payment_status != "paid" else p.payment_status
            db.add(GroupPurchaseEvent(group_id=group.id, event_type="expired", old_value=old, new_value="expired"))


def _safe_display_name(user: User | None, fallback: str = "") -> str:
    if not user:
        return fallback or "Ishtirokchi"
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    if name:
        return name
    if user.username:
        return f"@{user.username}"
    return fallback or "Ishtirokchi"


async def _invite_url(token: str) -> str:
    username = await resolve_bot_username()
    # Telegram startapp payload limit: keep short. Use gp_<token>
    param = f"gp_{token}"
    if username:
        return f"https://t.me/{username}?startapp={param}"
    base = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}?startapp={param}"


async def _group_to_out(group: GroupPurchase, db: AsyncSession, viewer_user_id: int | None = None, include_invite: bool = False) -> dict:
    p_res = await db.execute(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.colors), selectinload(Product.images))
        .where(Product.id == group.product_id)
    )
    product = p_res.scalar_one_or_none()
    participants = (await db.execute(
        select(GroupPurchaseParticipant, User)
        .outerjoin(User, User.id == GroupPurchaseParticipant.user_id)
        .where(GroupPurchaseParticipant.group_id == group.id)
        .order_by(GroupPurchaseParticipant.id.asc())
    )).all()

    variant_label = ""
    color_ru = color_uz = color_uzc = color_hex = ""
    if group.variant_id and product:
        for v in product.variants:
            if v.id == group.variant_id:
                variant_label = v.label
                break
    if group.color_id and product:
        for c in product.colors:
            if c.id == group.color_id:
                color_ru, color_uz, color_uzc, color_hex = c.name_ru, c.name_uz, c.name_uzc, c.hex

    unit_price = group.wholesale_price or group.retail_price
    out_participants = []
    my = None
    for p, u in participants:
        is_viewer = viewer_user_id is not None and p.user_id == viewer_user_id
        if is_viewer:
            my = p
        out_participants.append({
            "id": p.id,
            "user_id": p.user_id if is_viewer else 0,
            "display_name": _safe_display_name(u, p.display_name),
            "is_organizer": bool(p.is_organizer),
            "meters": float(p.meters or 0),
            "unit_price": p.unit_price,
            "total_amount": p.total_amount,
            "payment_status": p.payment_status,
            "fulfillment_status": p.fulfillment_status,
            "order_id": p.order_id if is_viewer else None,
            "joined_at": p.joined_at,
        })

    remaining = max(0.0, float(group.minimum_meters or MIN_GROUP_METERS) - float(group.confirmed_meters or 0))
    invite_url = await _invite_url(group.invitation_token) if include_invite else None
    return {
        "id": group.id,
        "public_code": group.public_code,
        "status": group.status,
        "payment_mode": group.payment_mode,
        "product_id": group.product_id,
        "product_slug": product.slug if product else "",
        "product_name_ru": product.name_ru if product else "",
        "product_name_uz": product.name_uz if product else "",
        "product_name_uzc": product.name_uzc if product else "",
        "product_image": (product.image_url if product else "") or (product.images[0].url if product and product.images else ""),
        "variant_id": group.variant_id,
        "variant_label": variant_label,
        "color_id": group.color_id,
        "color_name_ru": color_ru,
        "color_name_uz": color_uz,
        "color_name_uzc": color_uzc,
        "color_hex": color_hex,
        "minimum_meters": float(group.minimum_meters or MIN_GROUP_METERS),
        "target_meters": float(group.target_meters or MIN_GROUP_METERS),
        "confirmed_meters": float(group.confirmed_meters or 0),
        "remaining_meters": remaining,
        "wholesale_price": group.wholesale_price,
        "retail_price": group.retail_price,
        "unit_price": unit_price,
        "expires_at": group.expires_at,
        "invite_token": group.invitation_token if include_invite else None,
        "invite_url": invite_url,
        "is_organizer": bool(my and my.is_organizer),
        "my_meters": float(my.meters) if my else None,
        "my_total": my.total_amount if my else None,
        "my_payment_status": my.payment_status if my else None,
        "my_fulfillment_status": my.fulfillment_status if my else None,
        "participants_count": len(out_participants),
        "participants": out_participants,
        "created_at": group.created_at,
    }


@router.post("")
async def create_group(payload: GroupCreateIn, background_tasks: BackgroundTasks, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    result = await db.execute(
        select(Product).options(
            selectinload(Product.variants),
            selectinload(Product.colors),
            selectinload(Product.images),
            selectinload(Product.price_tiers),
        ).where(Product.slug == payload.product_slug)
    )
    product = result.scalar_one_or_none()
    if not product or not product.is_active or not product.in_stock:
        raise HTTPException(status_code=404, detail="Product not available")

    if product.pricing_type != "meter":
        raise HTTPException(status_code=400, detail="Group purchase is currently available only for meter products")

    meters = normalize_meters(payload.meters)
    if meters < 0.5:
        raise HTTPException(status_code=400, detail="Invalid meters")
    if payload.payment_mode not in PAYMENT_MODES:
        raise HTTPException(status_code=400, detail="Invalid payment mode")

    variant = None
    if payload.variant_id:
        variant = next((v for v in product.variants if v.id == payload.variant_id and v.is_active), None)
        if not variant:
            raise HTTPException(status_code=400, detail="Invalid variant")
    elif product.variants:
        active = [v for v in product.variants if v.is_active]
        if len(active) == 1:
            variant = active[0]
        else:
            raise HTTPException(status_code=400, detail="Variant required")

    if payload.color_id:
        ok = any(c.id == payload.color_id for c in product.colors)
        if not ok:
            raise HTTPException(status_code=400, detail="Invalid color")

    base_price = variant.price if variant else 0
    retail = effective_unit_price(product.price_tiers, meters, base_price)
    # wholesale at minimum 10m
    wholesale = effective_unit_price(product.price_tiers, MIN_GROUP_METERS, base_price)
    if wholesale <= 0 or retail <= 0:
        raise HTTPException(status_code=400, detail="Invalid product price")

    token = generate_invite_token()
    code = secrets.token_hex(6)
    group = GroupPurchase(
        public_code=code,
        product_id=product.id,
        variant_id=variant.id if variant else None,
        color_id=payload.color_id,
        organizer_user_id=user.id,
        organizer_telegram_id=user.telegram_id,
        minimum_meters=MIN_GROUP_METERS,
        target_meters=MIN_GROUP_METERS,
        confirmed_meters=meters,
        wholesale_price=wholesale,
        retail_price=retail,
        payment_mode=payload.payment_mode,
        status="target_reached" if meters >= MIN_GROUP_METERS else "open",
        invitation_token=token,
        invite_active=True,
        expires_at=_now() + timedelta(hours=DEFAULT_GROUP_HOURS),
    )
    db.add(group)
    await db.flush()

    p = GroupPurchaseParticipant(
        group_id=group.id,
        user_id=user.id,
        telegram_id=user.telegram_id,
        display_name=_safe_display_name(user),
        is_organizer=True,
        meters=meters,
        unit_price=wholesale if meters >= MIN_GROUP_METERS else retail,
        total_amount=round_money((wholesale if meters >= MIN_GROUP_METERS else retail) * meters),
        payment_status="pending",
        fulfillment_status="joined",
        delivery_district=(payload.delivery_district or "").strip()[:120],
    )
    db.add(p)
    db.add(GroupPurchaseEvent(group_id=group.id, actor_user_id=user.id, actor_telegram_id=user.telegram_id, event_type="created", new_value=group.status))
    await db.commit()
    await db.refresh(group)
    background_tasks.add_task(notify_group_created, user.telegram_id, group.public_code, product.name_uz or product.name_ru or product.slug)
    return await _group_to_out(group, db, viewer_user_id=user.id, include_invite=True)


@router.get("/my")
async def my_groups(tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    rows = await db.execute(
        select(GroupPurchase)
        .join(GroupPurchaseParticipant, GroupPurchaseParticipant.group_id == GroupPurchase.id)
        .where(GroupPurchaseParticipant.user_id == user.id)
        .options(selectinload(GroupPurchase.participants))
        .order_by(GroupPurchase.created_at.desc())
    )
    groups = rows.scalars().unique().all()
    out = []
    for g in groups:
        await _refresh_group_status(g, db)
        out.append(await _group_to_out(g, db, viewer_user_id=user.id, include_invite=True))
    await db.commit()
    return {"items": out}


@router.get("/invite/{token}")
async def group_by_invite(token: str, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.invitation_token == token).options(selectinload(GroupPurchase.participants)))
    group = res.scalar_one_or_none()
    if not group or not group.invite_active:
        raise HTTPException(status_code=404, detail="Invite not found")
    await _refresh_group_status(group, db)
    await db.commit()
    # invited-only: user can see if invited (has token) - token is secret.
    return await _group_to_out(group, db, viewer_user_id=user.id, include_invite=bool(any(p.user_id == user.id and p.is_organizer for p in group.participants)))


@router.get("/{group_id}")
async def group_detail(group_id: int, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).options(selectinload(GroupPurchase.participants)))
    group = res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    is_member = any(p.user_id == user.id for p in group.participants)
    if not is_member:
        raise HTTPException(status_code=403, detail="Access denied")
    await _refresh_group_status(group, db)
    await db.commit()
    return await _group_to_out(group, db, viewer_user_id=user.id, include_invite=bool(any(p.user_id == user.id and p.is_organizer for p in group.participants)))


@router.post("/join")
async def join_group(payload: GroupJoinIn, background_tasks: BackgroundTasks, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    # lock group row
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.invitation_token == payload.token).with_for_update())
    group = res.scalar_one_or_none()
    if not group or not group.invite_active:
        raise HTTPException(status_code=404, detail="Invite not found")
    await _refresh_group_status(group, db)
    if group.status in {"expired", "cancelled", "completed", "admin_confirmed", "preparing", "paid"}:
        raise HTTPException(status_code=400, detail="Group is closed")
    if group.status not in {"open", "target_reached", "payment_pending"}:
        raise HTTPException(status_code=400, detail="Group is not joinable")

    existing = await db.execute(select(GroupPurchaseParticipant).where(GroupPurchaseParticipant.group_id == group.id, GroupPurchaseParticipant.user_id == user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already joined")

    product_res = await db.execute(select(Product).options(selectinload(Product.variants), selectinload(Product.price_tiers), selectinload(Product.colors), selectinload(Product.images)).where(Product.id == group.product_id))
    product = product_res.scalar_one_or_none()
    if not product or not product.is_active or not product.in_stock:
        raise HTTPException(status_code=400, detail="Product not available")

    meters = normalize_meters(payload.meters)
    if meters <= 0:
        raise HTTPException(status_code=400, detail="Invalid meters")

    # no stock quantity model exists; enforce in_stock boolean only.
    new_total = float(group.confirmed_meters or 0) + meters
    group.confirmed_meters = new_total
    # Recalculate price at current total (minimum 10m gives wholesale)
    variant = next((v for v in product.variants if v.id == group.variant_id), None) if group.variant_id else None
    base_price = variant.price if variant else 0
    unit = effective_unit_price(product.price_tiers, max(new_total, MIN_GROUP_METERS), base_price)
    group.wholesale_price = unit
    group.status = "target_reached" if new_total >= float(group.minimum_meters or MIN_GROUP_METERS) and group.status == "open" else group.status

    p = GroupPurchaseParticipant(
        group_id=group.id, user_id=user.id, telegram_id=user.telegram_id,
        display_name=_safe_display_name(user), is_organizer=False, meters=meters,
        unit_price=unit, total_amount=round_money(unit * meters),
        payment_status="pending", fulfillment_status="joined",
        phone=(payload.phone or "").strip(), address=(payload.address or "").strip(),
        delivery_district=(payload.delivery_district or "").strip()[:120],
        comment=(payload.comment or "").strip(), latitude=payload.latitude, longitude=payload.longitude,
    )
    db.add(p)
    # update all participant totals to current group unit price once target reached
    if float(group.confirmed_meters or 0) >= float(group.minimum_meters or MIN_GROUP_METERS):
        all_parts = (await db.execute(select(GroupPurchaseParticipant).where(GroupPurchaseParticipant.group_id == group.id))).scalars().all()
        for part in all_parts:
            part.unit_price = unit
            part.total_amount = round_money(unit * float(part.meters or 0))
            if part.fulfillment_status == "joined":
                part.fulfillment_status = "joined"
    db.add(GroupPurchaseEvent(group_id=group.id, actor_user_id=user.id, actor_telegram_id=user.telegram_id, event_type="joined", new_value=str(meters)))
    reached = float(group.confirmed_meters or 0) >= float(group.minimum_meters or MIN_GROUP_METERS)
    participant_ids = [p.telegram_id for p in (await db.execute(select(GroupPurchaseParticipant).where(GroupPurchaseParticipant.group_id == group.id))).scalars().all()]
    await db.commit()
    await db.refresh(group)
    background_tasks.add_task(notify_group_joined, group.organizer_telegram_id, group.public_code, _safe_display_name(user), meters)
    if reached:
        background_tasks.add_task(notify_group_target_reached, participant_ids, group.public_code)
    return await _group_to_out(group, db, viewer_user_id=user.id, include_invite=False)


@router.post("/{group_id}/leave")
async def leave_group(group_id: int, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).with_for_update())
    group = res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    p_res = await db.execute(select(GroupPurchaseParticipant).where(GroupPurchaseParticipant.group_id == group.id, GroupPurchaseParticipant.user_id == user.id))
    p = p_res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    if p.is_organizer:
        raise HTTPException(status_code=400, detail="Organizer cannot leave")
    if p.payment_status == "paid" or p.fulfillment_status not in {"joined", "payment_pending", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot leave after payment/processing")
    group.confirmed_meters = max(0.0, float(group.confirmed_meters or 0) - float(p.meters or 0))
    await db.delete(p)
    if float(group.confirmed_meters or 0) < float(group.minimum_meters or MIN_GROUP_METERS) and group.status == "target_reached":
        group.status = "open"
    db.add(GroupPurchaseEvent(group_id=group.id, actor_user_id=user.id, actor_telegram_id=user.telegram_id, event_type="left", old_value=str(p.meters)))
    await db.commit()
    return {"ok": True}


@router.post("/{group_id}/regenerate-invite")
async def regenerate_invite(group_id: int, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, tg_user)
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).with_for_update().options(selectinload(GroupPurchase.participants)))
    group = res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    my = next((p for p in group.participants if p.user_id == user.id), None)
    if not my or not my.is_organizer:
        raise HTTPException(status_code=403, detail="Only organizer")
    if group.status in {"cancelled", "completed", "expired"}:
        raise HTTPException(status_code=400, detail="Group closed")
    old_token = group.invitation_token
    group.invitation_token = generate_invite_token()
    group.invite_active = True
    db.add(GroupPurchaseEvent(group_id=group.id, actor_user_id=user.id, actor_telegram_id=user.telegram_id, event_type="invite_regenerated", old_value="revoked", new_value="new"))
    await db.commit()
    return await _group_to_out(group, db, viewer_user_id=user.id, include_invite=True)


@router.post("/{group_id}/payment-request")
async def create_payment_request(group_id: int, payload: dict, tg_user: dict = Depends(require_telegram_user), db: AsyncSession = Depends(get_db)):
    """Safe manual/COD payment request. No fake success. Admin confirms after real verification."""
    user = await _get_user(db, tg_user)
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).with_for_update().options(selectinload(GroupPurchase.participants)))
    group = res.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    my = next((p for p in group.participants if p.user_id == user.id), None)
    if not my:
        raise HTTPException(status_code=403, detail="Not a participant")
    if float(group.confirmed_meters or 0) < float(group.minimum_meters or MIN_GROUP_METERS):
        raise HTTPException(status_code=400, detail="Minimum not reached")
    if group.status in {"cancelled", "expired", "completed"}:
        raise HTTPException(status_code=400, detail="Group not payable")

    my.phone = str(payload.get("phone") or my.phone or "").strip()[:40]
    my.address = str(payload.get("address") or my.address or "").strip()[:500]
    my.delivery_district = str(payload.get("delivery_district") or my.delivery_district or "").strip()[:120]
    my.comment = str(payload.get("comment") or my.comment or "").strip()[:1000]

    mode = group.payment_mode
    if mode == "organizer" and not my.is_organizer:
        raise HTTPException(status_code=400, detail="Organizer pays for this group")

    for p in group.participants:
        if not p.unit_price or not p.total_amount:
            unit = group.wholesale_price or group.retail_price or 0
            p.unit_price = int(unit)
            p.total_amount = round_money(int(unit) * float(p.meters or 0))

    if mode == "organizer":
        amount = sum(int(p.total_amount or 0) for p in group.participants)
        participants_target = list(group.participants)
    else:
        amount = int(my.total_amount or 0)
        participants_target = [my]

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    existing_q = select(GroupPurchasePayment).where(
        GroupPurchasePayment.group_id == group.id,
        GroupPurchasePayment.payer_user_id == user.id,
        GroupPurchasePayment.payment_mode == mode,
        GroupPurchasePayment.status == "pending",
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()
    if existing:
        existing.amount = amount
        payment = existing
    else:
        payment = GroupPurchasePayment(
            group_id=group.id,
            participant_id=my.id if mode == "individual" else None,
            payer_user_id=user.id,
            payer_telegram_id=user.telegram_id,
            payment_mode=mode,
            amount=amount,
            provider="manual_cod",
            status="pending",
            idempotency_key=secrets.token_hex(16),
        )
        db.add(payment)

    for p in participants_target:
        if p.payment_status != "paid":
            p.payment_status = "payment_pending"
            p.fulfillment_status = "payment_pending"
    if group.status in {"open", "target_reached"}:
        group.status = "payment_pending"
    db.add(GroupPurchaseEvent(group_id=group.id, actor_user_id=user.id, actor_telegram_id=user.telegram_id, event_type="payment_requested", new_value=mode, reason=str(amount)))
    await db.commit()
    return {"ok": True, "payment_status": "pending", "amount": amount, "provider": "manual_cod"}