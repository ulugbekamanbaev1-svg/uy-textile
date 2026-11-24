from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import GroupPurchase, GroupPurchaseEvent, GroupPurchaseParticipant, GroupPurchasePayment, Order, OrderItem, Product, User
from app.models.group_purchase import GROUP_STATUSES
from app.services.telegram_auth import require_admin
from app.services.group_purchase_notify import notify_group_payment_confirmed

router = APIRouter(prefix="/api/admin/group-purchases", tags=["Admin Group Purchases"], dependencies=[Depends(require_admin)])


@router.get("")
async def admin_list_groups(status: str | None = None, db: AsyncSession = Depends(get_db)):
    q = select(GroupPurchase).options(selectinload(GroupPurchase.participants)).order_by(GroupPurchase.created_at.desc())
    if status:
        q = q.where(GroupPurchase.status == status)
    groups = (await db.execute(q)).scalars().unique().all()
    items = []
    for g in groups:
        org = await db.get(User, g.organizer_user_id)
        items.append({
            "id": g.id,
            "public_code": g.public_code,
            "product_id": g.product_id,
            "variant_id": g.variant_id,
            "color_id": g.color_id,
            "organizer": (f"{org.first_name or ''} {org.last_name or ''}".strip() or (f"@{org.username}" if org and org.username else str(g.organizer_telegram_id))) if org else str(g.organizer_telegram_id),
            "participants_count": len(g.participants),
            "confirmed_meters": float(g.confirmed_meters or 0),
            "minimum_meters": float(g.minimum_meters or 10),
            "wholesale_price": g.wholesale_price,
            "total_amount": sum(int(p.total_amount or 0) for p in g.participants),
            "payment_mode": g.payment_mode,
            "status": g.status,
            "expires_at": g.expires_at.isoformat() if g.expires_at else None,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    return {"items": items}


@router.get("/{group_id}")
async def admin_group_detail(group_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).options(selectinload(GroupPurchase.participants), selectinload(GroupPurchase.payments), selectinload(GroupPurchase.events)))
    g = res.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    participants = []
    for p in g.participants:
        u = await db.get(User, p.user_id)
        participants.append({
            "id": p.id, "user_id": p.user_id, "telegram_id": p.telegram_id,
            "display_name": (f"{u.first_name or ''} {u.last_name or ''}".strip() or (f"@{u.username}" if u and u.username else p.display_name)) if u else p.display_name,
            "is_organizer": p.is_organizer, "meters": float(p.meters or 0),
            "unit_price": p.unit_price, "total_amount": p.total_amount,
            "payment_status": p.payment_status, "fulfillment_status": p.fulfillment_status,
            "order_id": p.order_id, "phone": p.phone, "address": p.address, "delivery_district": p.delivery_district,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        })
    return {
        "id": g.id, "public_code": g.public_code, "status": g.status, "payment_mode": g.payment_mode,
        "product_id": g.product_id, "variant_id": g.variant_id, "color_id": g.color_id,
        "organizer_user_id": g.organizer_user_id, "organizer_telegram_id": g.organizer_telegram_id,
        "minimum_meters": float(g.minimum_meters or 10), "confirmed_meters": float(g.confirmed_meters or 0),
        "wholesale_price": g.wholesale_price, "retail_price": g.retail_price,
        "expires_at": g.expires_at.isoformat() if g.expires_at else None,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "participants": participants,
        "payments": [{"id": x.id, "amount": x.amount, "status": x.status, "provider": x.provider, "payer_user_id": x.payer_user_id, "participant_id": x.participant_id, "created_at": x.created_at.isoformat() if x.created_at else None, "paid_at": x.paid_at.isoformat() if x.paid_at else None} for x in g.payments],
        "events": [{"id": e.id, "event_type": e.event_type, "old_value": e.old_value, "new_value": e.new_value, "reason": e.reason, "created_at": e.created_at.isoformat() if e.created_at else None} for e in g.events],
    }


async def _ensure_participant_orders(group: GroupPurchase, db: AsyncSession):
    res = await db.execute(select(Product).options(selectinload(Product.variants), selectinload(Product.colors), selectinload(Product.images)).where(Product.id == group.product_id))
    product = res.scalar_one_or_none()
    for p in group.participants:
        if p.order_id or p.payment_status != "paid":
            continue
        u = await db.get(User, p.user_id)
        order = Order(
            status="confirmed",
            customer_name=(f"{u.first_name or ''} {u.last_name or ''}".strip() or p.display_name or "Mijoz") if u else (p.display_name or "Mijoz"),
            phone=p.phone or "",
            address=p.address or "",
            comment=f"[Birgalikda #{group.public_code}] {p.comment or ''}".strip(),
            latitude=p.latitude,
            longitude=p.longitude,
            total=int(p.total_amount or 0),
            telegram_id=p.telegram_id,
            telegram_username=(u.username if u else None),
        )
        db.add(order)
        await db.flush()
        variant_label = ""
        color_ru = color_uz = color_uzc = color_hex = ""
        if product and group.variant_id:
            for v in product.variants:
                if v.id == group.variant_id:
                    variant_label = v.label
                    break
        if product and group.color_id:
            for c in product.colors:
                if c.id == group.color_id:
                    color_ru, color_uz, color_uzc, color_hex = c.name_ru, c.name_uz, c.name_uzc, c.hex
        item = OrderItem(
            order_id=order.id,
            product_id=group.product_id,
            product_slug=product.slug if product else "",
            name_ru=product.name_ru if product else "",
            name_uz=product.name_uz if product else "",
            name_uzc=product.name_uzc if product else "",
            variant_label=variant_label,
            color_ru=color_ru, color_uz=color_uz, color_uzc=color_uzc, color_hex=color_hex,
            meters=float(p.meters or 0),
            pricing_type="meter",
            image_url=(product.image_url if product else "") or "",
            unit_price=int(p.unit_price or 0),
            quantity=1,
            line_total=int(p.total_amount or 0),
        )
        db.add(item)
        p.order_id = order.id
        if p.fulfillment_status in {"joined","payment_pending","paid"}:
            p.fulfillment_status = "preparing"


@router.post("/{group_id}/extend")
async def admin_extend_group(group_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id))
    g = res.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    reason = str(payload.get("reason") or "").strip()
    expires_at = payload.get("expires_at")
    if not reason:
        raise HTTPException(status_code=400, detail="Reason required")
    if not expires_at:
        raise HTTPException(status_code=400, detail="expires_at required")
    try:
        dt = datetime.fromisoformat(str(expires_at).replace("Z","+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid expires_at")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    old = g.expires_at.isoformat() if g.expires_at else ""
    g.expires_at = dt
    g.extended_reason = reason
    if g.status == "expired" and float(g.confirmed_meters or 0) < float(g.minimum_meters or 10):
        g.status = "open"
    db.add(GroupPurchaseEvent(group_id=g.id, event_type="extended", old_value=old, new_value=dt.isoformat(), reason=reason))
    await db.commit()
    return {"ok": True, "expires_at": g.expires_at.isoformat()}


@router.post("/{group_id}/confirm-payment")
async def admin_confirm_payment(group_id: int, payload: dict, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Manual admin confirmation after real payment verification. No fake payment."""
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).options(selectinload(GroupPurchase.participants)))
    g = res.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    reason = str(payload.get("reason") or "").strip()
    participant_id = payload.get("participant_id")
    now = datetime.now(timezone.utc)
    targets = g.participants
    if participant_id:
        targets = [p for p in g.participants if p.id == int(participant_id)]
        if not targets:
            raise HTTPException(status_code=404, detail="Participant not found")
    if g.payment_mode == "organizer":
        targets = g.participants
    for p in targets:
        p.payment_status = "paid"
        if p.fulfillment_status in {"joined", "payment_pending"}:
            p.fulfillment_status = "paid"
    pay_q = select(GroupPurchasePayment).where(GroupPurchasePayment.group_id == g.id, GroupPurchasePayment.status == "pending")
    pays = (await db.execute(pay_q)).scalars().all()
    for pay in pays:
        if g.payment_mode == "organizer" or not participant_id or pay.participant_id == int(participant_id):
            pay.status = "paid"
            pay.paid_at = now
    if all(p.payment_status == "paid" for p in g.participants):
        g.status = "paid"
    await _ensure_participant_orders(g, db)
    db.add(GroupPurchaseEvent(group_id=g.id, event_type="payment_confirmed", new_value=g.status, reason=reason))
    tids = [p.telegram_id for p in g.participants if p.telegram_id]
    await db.commit()
    background_tasks.add_task(notify_group_payment_confirmed, tids, g.public_code)
    return {"ok": True, "status": g.status}


@router.post("/{group_id}/status")
async def admin_update_group_status(group_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(GroupPurchase).where(GroupPurchase.id == group_id).options(selectinload(GroupPurchase.participants)))
    g = res.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    new_status = str(payload.get("status") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    if new_status not in GROUP_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    old = g.status
    g.status = new_status
    if new_status == "cancelled":
        g.cancelled_reason = reason
        for p in g.participants:
            if p.payment_status != "paid":
                p.payment_status = "cancelled"
            if p.fulfillment_status not in {"delivered"}:
                p.fulfillment_status = "cancelled"
    if new_status == "paid":
        for p in g.participants:
            if p.payment_status != "paid":
                p.payment_status = "paid"
        await _ensure_participant_orders(g, db)
    if new_status == "admin_confirmed":
        for p in g.participants:
            if p.payment_status == "paid" and p.fulfillment_status in {"paid", "joined", "payment_pending"}:
                p.fulfillment_status = "preparing"
    db.add(GroupPurchaseEvent(group_id=g.id, event_type="status_changed", old_value=old, new_value=new_status, reason=reason))
    await db.commit()
    return {"ok": True, "status": g.status}