import secrets
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Order, ReferralReward, User
from app.models.settings import StoreSettings


REFERRAL_PREFIX = "ref_"


def normalize_referral_code(code: str | None) -> str:
    return (code or "").strip().upper()


def make_referral_code() -> str:
    # Short, URL-safe, human-readable enough.
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:10].upper()


async def get_store_settings(db: AsyncSession) -> StoreSettings:
    result = await db.execute(select(StoreSettings).where(StoreSettings.id == 1))
    store = result.scalar_one_or_none()
    if store is None:
        store = StoreSettings(id=1)
        db.add(store)
        await db.flush()
    return store


async def ensure_user_referral_code(db: AsyncSession, user: User) -> str:
    if user.referral_code:
        return user.referral_code

    for _ in range(20):
        code = make_referral_code()
        exists = await db.scalar(select(User.id).where(User.referral_code == code))
        if not exists:
            user.referral_code = code
            await db.flush()
            return code

    # Fallback deterministic
    user.referral_code = f"U{user.id:06d}"
    await db.flush()
    return user.referral_code


async def attach_referral(
    db: AsyncSession,
    *,
    referred_user: User,
    referral_code: str,
) -> dict:
    code = normalize_referral_code(referral_code)
    if not code:
        return {"ok": False, "reason": "empty"}

    if referred_user.referred_by_user_id is not None:
        return {"ok": False, "reason": "already_referred"}

    referrer = await db.scalar(select(User).where(User.referral_code == code))
    if referrer is None:
        return {"ok": False, "reason": "not_found"}

    if referrer.id == referred_user.id:
        return {"ok": False, "reason": "self_referral"}

    referred_user.referred_by_user_id = referrer.id
    referred_user.referred_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ok": True, "referrer_user_id": referrer.id}


async def _notify_referral_reward(referrer_telegram_id: int) -> None:
    if not settings.BOT_TOKEN or not referrer_telegram_id:
        return
    text = (
        "🎉 Tabriklaymiz!\n"
        "Do‘stingiz Farrux Shop orqali xaridni muvaffaqiyatli yakunladi.\n"
        "Sizning bonus hisobingizga yangi bonus qo‘shildi! ❤️"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={"chat_id": referrer_telegram_id, "text": text},
            )
    except Exception:
        pass


async def maybe_award_referral_for_completed_order(
    db: AsyncSession,
    order: Order,
) -> ReferralReward | None:
    """
    Award only once, only for first successfully completed (done) order
    of the referred buyer. Must be called inside a transaction.
    """
    if order.status != "done" or not order.telegram_id:
        return None

    store = await get_store_settings(db)
    if not bool(getattr(store, "referral_enabled", True)):
        return None

    referred = await db.scalar(select(User).where(User.telegram_id == order.telegram_id))
    if referred is None or referred.referred_by_user_id is None:
        return None

    referrer_id = referred.referred_by_user_id
    if referrer_id == referred.id:
        return None

    # Ensure first completed order of referred buyer.
    first_done_id = await db.scalar(
        select(Order.id)
        .where(Order.telegram_id == order.telegram_id, Order.status == "done")
        .order_by(Order.created_at.asc(), Order.id.asc())
        .limit(1)
    )
    if first_done_id != order.id:
        return None

    # Prevent duplicate by referred user (any earned reward).
    existing_for_referred = await db.scalar(
        select(ReferralReward.id).where(
            ReferralReward.referred_user_id == referred.id,
            ReferralReward.status == "earned",
        ).limit(1)
    )
    if existing_for_referred is not None:
        return None

    # Prevent duplicate by order unique constraint as well.
    existing_for_order = await db.scalar(
        select(ReferralReward.id).where(ReferralReward.order_id == order.id).limit(1)
    )
    if existing_for_order is not None:
        return None

    reward = ReferralReward(
        referrer_user_id=referrer_id,
        referred_user_id=referred.id,
        order_id=order.id,
        amount=int(getattr(store, "referral_reward_amount", 0) or 0),
        status="earned",
        reason="first_completed_order",
    )
    db.add(reward)
    await db.flush()

    referrer = await db.get(User, referrer_id)
    if referrer and referrer.telegram_id:
        await _notify_referral_reward(int(referrer.telegram_id))

    return reward


async def referral_stats_for_user(db: AsyncSession, user: User) -> dict:
    invited_count = await db.scalar(
        select(func.count()).select_from(User).where(User.referred_by_user_id == user.id)
    ) or 0
    successful_count = await db.scalar(
        select(func.count()).select_from(ReferralReward).where(
            ReferralReward.referrer_user_id == user.id,
            ReferralReward.status == "earned",
        )
    ) or 0
    earned_total = await db.scalar(
        select(func.coalesce(func.sum(ReferralReward.amount), 0)).where(
            ReferralReward.referrer_user_id == user.id,
            ReferralReward.status == "earned",
        )
    ) or 0
    return {
        "invited_count": int(invited_count),
        "successful_count": int(successful_count),
        "earned_total": int(earned_total),
    }