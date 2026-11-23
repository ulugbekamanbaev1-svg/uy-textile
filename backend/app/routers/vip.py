from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Order, User, VipStatusHistory
from app.services.telegram_auth import require_telegram_user
from app.services.vip import VIP_LABELS, VIP_LEVELS, compute_user_metric, get_store_settings, normalize_criterion

router = APIRouter(prefix="/api/vip", tags=["VIP"])


def _thresholds(store):
    return {
        "silver": int(getattr(store, "vip_silver_threshold", 0) or 0),
        "gold": int(getattr(store, "vip_gold_threshold", 0) or 0),
        "platinum": int(getattr(store, "vip_platinum_threshold", 0) or 0),
        "diamond": int(getattr(store, "vip_diamond_threshold", 0) or 0),
    }


@router.get("/me")
async def my_vip(
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    telegram_id = int(tg_user.get("id") or 0)
    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        user = User(
            telegram_id=telegram_id,
            first_name=tg_user.get("first_name", "") or "",
            last_name=tg_user.get("last_name", "") or "",
            username=tg_user.get("username"),
            language_code=tg_user.get("language_code"),
        )
        db.add(user)
        await db.flush()

    store = await get_store_settings(db)
    criterion = normalize_criterion(getattr(store, "vip_criterion", "amount"))
    thresholds = _thresholds(store)

    completed_orders = int(
        await db.scalar(
            select(func.count()).select_from(Order).where(
                Order.telegram_id == telegram_id,
                Order.status == "done",
            )
        ) or 0
    )
    completed_amount = int(
        await db.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.telegram_id == telegram_id,
                Order.status == "done",
            )
        ) or 0
    )
    metric = completed_orders if criterion == "count" else completed_amount

    level = (user.vip_level or "silver").lower()
    if level not in VIP_LEVELS:
        level = "silver"

    idx = VIP_LEVELS.index(level)
    next_level = VIP_LEVELS[idx + 1] if idx < len(VIP_LEVELS) - 1 else None
    current_threshold = thresholds[level]
    next_threshold = thresholds[next_level] if next_level else None

    if next_threshold is None:
        progress_percent = 100
        remaining = 0
    else:
        span = max(next_threshold - current_threshold, 1)
        progress_percent = max(0, min(100, int(((metric - current_threshold) / span) * 100)))
        remaining = max(0, next_threshold - metric)

    history_result = await db.execute(
        select(VipStatusHistory)
        .where(VipStatusHistory.user_id == user.id)
        .order_by(VipStatusHistory.created_at.desc())
        .limit(20)
    )
    history = [
        {
            "id": h.id,
            "old_level": h.old_level,
            "new_level": h.new_level,
            "criterion": h.criterion,
            "metric_value": h.metric_value,
            "created_at": h.created_at,
        }
        for h in history_result.scalars().all()
    ]

    await db.commit()
    return {
        "level": level,
        "level_label": VIP_LABELS.get(level, level.upper()),
        "criterion": criterion,
        "metric": metric,
        "completed_orders": completed_orders,
        "completed_amount": completed_amount,
        "next_level": next_level,
        "next_level_label": VIP_LABELS.get(next_level) if next_level else None,
        "current_threshold": current_threshold,
        "next_threshold": next_threshold,
        "remaining": remaining,
        "progress_percent": progress_percent,
        "thresholds": thresholds,
        "history": history,
    }
