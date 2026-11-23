from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Order, User, VipStatusHistory
from app.services.telegram_auth import require_admin
from app.services.vip import VIP_LABELS, VIP_LEVELS, compute_user_metric, get_store_settings, normalize_criterion, recalc_vip_for_telegram_id

router = APIRouter(
    prefix="/api/admin/vip",
    tags=["Admin VIP"],
    dependencies=[Depends(require_admin)],
)


class VipSettingsIn(BaseModel):
    vip_criterion: str = Field(pattern="^(amount|count)$")
    vip_silver_threshold: int = Field(ge=0, le=1_000_000_000)
    vip_gold_threshold: int = Field(ge=0, le=1_000_000_000)
    vip_platinum_threshold: int = Field(ge=0, le=1_000_000_000)
    vip_diamond_threshold: int = Field(ge=0, le=1_000_000_000)


@router.get("/overview")
async def vip_overview(db: AsyncSession = Depends(get_db)):
    store = await get_store_settings(db)
    criterion = normalize_criterion(getattr(store, "vip_criterion", "amount"))

    counts = {}
    for lvl in VIP_LEVELS:
        c = await db.scalar(select(func.count()).select_from(User).where(User.vip_level == lvl)) or 0
        counts[lvl] = int(c)

    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    return {
        "criterion": criterion,
        "thresholds": {
            "silver": store.vip_silver_threshold,
            "gold": store.vip_gold_threshold,
            "platinum": store.vip_platinum_threshold,
            "diamond": store.vip_diamond_threshold,
        },
        "counts": counts,
        "total_users": int(total_users),
    }


@router.get("/users")
async def vip_users(
    level: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    store = await get_store_settings(db)
    criterion = normalize_criterion(getattr(store, "vip_criterion", "amount"))

    stmt = select(User).order_by(User.id.desc()).limit(limit)
    if level and level in VIP_LEVELS:
        stmt = stmt.where(User.vip_level == level)
    users = (await db.execute(stmt)).scalars().all()

    out = []
    for u in users:
        metric = await compute_user_metric(db, u.telegram_id, criterion)
        done_orders = await db.scalar(
            select(func.count()).select_from(Order).where(Order.telegram_id == u.telegram_id, Order.status == "done")
        ) or 0
        done_amount = await db.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(Order.telegram_id == u.telegram_id, Order.status == "done")
        ) or 0
        out.append(
            {
                "user_id": u.id,
                "telegram_id": u.telegram_id,
                "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username or str(u.telegram_id),
                "username": u.username,
                "vip_level": u.vip_level or "silver",
                "vip_label": VIP_LABELS.get(u.vip_level or "silver", ""),
                "metric": int(metric),
                "completed_orders": int(done_orders),
                "completed_amount": int(done_amount),
                "vip_updated_at": u.vip_updated_at,
            }
        )
    return out


@router.get("/history")
async def vip_history(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(VipStatusHistory).order_by(VipStatusHistory.created_at.desc(), VipStatusHistory.id.desc()).limit(limit)
        )
    ).scalars().all()
    user_ids = {r.user_id for r in rows}
    users = {}
    if user_ids:
        us = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {u.id: u for u in us}
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "user_name": (
                f"{users[r.user_id].first_name or ''} {users[r.user_id].last_name or ''}".strip()
                or users[r.user_id].username
                or str(users[r.user_id].telegram_id)
            ) if r.user_id in users else str(r.user_id),
            "old_level": r.old_level,
            "new_level": r.new_level,
            "criterion": r.criterion,
            "metric_value": r.metric_value,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/recalc")
async def vip_recalc_all(db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(User.telegram_id).where(User.telegram_id.is_not(None)))).scalars().all()
    changed = 0
    for tg_id in users:
        res = await recalc_vip_for_telegram_id(db, int(tg_id))
        if res and res.get("changed"):
            changed += 1
    await db.commit()
    return {"ok": True, "checked": len(users), "changed": changed}
