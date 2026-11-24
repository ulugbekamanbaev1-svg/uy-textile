import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import GroupPurchase, GroupPurchaseEvent

logger = logging.getLogger(__name__)


async def expire_group_purchases_once() -> int:
    now = datetime.now(timezone.utc)
    changed = 0
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(GroupPurchase)
            .where(GroupPurchase.status.in_(["open", "target_reached", "payment_pending"]))
            .where(GroupPurchase.expires_at.is_not(None))
            .where(GroupPurchase.expires_at <= now)
            .options(selectinload(GroupPurchase.participants))
        )
        groups = res.scalars().unique().all()
        for g in groups:
            min_m = float(g.minimum_meters or 10)
            total = float(g.confirmed_meters or 0)
            if total >= min_m:
                continue
            old = g.status
            g.status = "expired"
            for p in g.participants:
                if p.payment_status != "paid":
                    p.payment_status = "cancelled"
                if p.fulfillment_status not in {"delivered"}:
                    p.fulfillment_status = "cancelled"
            db.add(GroupPurchaseEvent(group_id=g.id, event_type="expired", old_value=old, new_value="expired", reason="auto"))
            changed += 1
        if changed:
            await db.commit()
    return changed


async def group_purchase_expiry_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await expire_group_purchases_once()
        except Exception as exc:
            logger.warning("Group purchase expiry loop error: %s", exc)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=300)
        except asyncio.TimeoutError:
            pass