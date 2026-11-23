from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Order, User, VipStatusHistory
from app.models.settings import StoreSettings

VIP_LEVELS = ["silver", "gold", "platinum", "diamond"]
VIP_LABELS = {
    "silver": "SILVER — KUMUSH",
    "gold": "GOLD — OLTIN",
    "platinum": "PLATINUM — PLATINA",
    "diamond": "DIAMOND — OLMOS",
}


def normalize_criterion(value: str | None) -> str:
    return "count" if (value or "").lower() == "count" else "amount"


async def get_store_settings(db: AsyncSession) -> StoreSettings:
    result = await db.execute(select(StoreSettings).where(StoreSettings.id == 1))
    store = result.scalar_one_or_none()
    if store is None:
        store = StoreSettings(id=1)
        db.add(store)
        await db.flush()
    return store


def calc_level(metric: int, criterion: str, s: StoreSettings) -> str:
    # thresholds are configured by admin; compare in ascending order and pick highest reached
    thresholds = {
        "silver": int(getattr(s, "vip_silver_threshold", 0) or 0),
        "gold": int(getattr(s, "vip_gold_threshold", 0) or 0),
        "platinum": int(getattr(s, "vip_platinum_threshold", 0) or 0),
        "diamond": int(getattr(s, "vip_diamond_threshold", 0) or 0),
    }
    level = "silver"
    for name in VIP_LEVELS:
        if metric >= thresholds[name]:
            level = name
    return level


async def compute_user_metric(db: AsyncSession, telegram_id: int, criterion: str) -> int:
    if criterion == "count":
        val = await db.scalar(
            select(func.count()).select_from(Order).where(
                Order.telegram_id == telegram_id,
                Order.status == "done",
            )
        )
        return int(val or 0)
    val = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.telegram_id == telegram_id,
            Order.status == "done",
        )
    )
    return int(val or 0)


async def notify_vip_upgrade(telegram_id: int, new_level: str) -> None:
    if not settings.BOT_TOKEN or not telegram_id:
        return
    label = VIP_LABELS.get(new_level, new_level.upper())
    text = (
        "🎉 Tabriklaymiz!\n"
        "Sizning Farrux Shop VIP darajangiz oshdi!\n"
        f"Yangi maqomingiz: {label}.\n"
        "Bizni tanlaganingiz uchun rahmat! ❤️"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={"chat_id": telegram_id, "text": text},
            )
    except Exception:
        pass


async def recalc_vip_for_telegram_id(db: AsyncSession, telegram_id: int | None) -> dict | None:
    if not telegram_id:
        return None
    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        return None

    store = await get_store_settings(db)
    criterion = normalize_criterion(getattr(store, "vip_criterion", "amount"))
    metric = await compute_user_metric(db, telegram_id, criterion)
    new_level = calc_level(metric, criterion, store)
    old_level = (user.vip_level or "silver").lower()
    if old_level not in VIP_LEVELS:
        old_level = "silver"

    changed = old_level != new_level
    if changed:
        db.add(
            VipStatusHistory(
                user_id=user.id,
                old_level=old_level,
                new_level=new_level,
                criterion=criterion,
                metric_value=metric,
            )
        )
        user.vip_level = new_level
        user.vip_updated_at = datetime.now(timezone.utc)
        await db.flush()
        await notify_vip_upgrade(telegram_id, new_level)

    return {
        "changed": changed,
        "old_level": old_level,
        "new_level": new_level,
        "metric": metric,
        "criterion": criterion,
    }