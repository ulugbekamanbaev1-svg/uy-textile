from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Order, ReferralReward, User
from app.services.telegram_auth import require_admin

router = APIRouter(
    prefix="/api/admin/referral",
    tags=["Admin Referral"],
    dependencies=[Depends(require_admin)],
)


class CancelRewardIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.get("/stats")
async def referral_stats(db: AsyncSession = Depends(get_db)):
    total_referrers = await db.scalar(
        select(func.count(func.distinct(User.referred_by_user_id))).where(User.referred_by_user_id.is_not(None))
    ) or 0
    invited_total = await db.scalar(
        select(func.count()).select_from(User).where(User.referred_by_user_id.is_not(None))
    ) or 0
    successful_total = await db.scalar(
        select(func.count()).select_from(ReferralReward).where(ReferralReward.status == "earned")
    ) or 0
    cancelled_total = await db.scalar(
        select(func.count()).select_from(ReferralReward).where(ReferralReward.status == "cancelled")
    ) or 0
    reward_amount_total = await db.scalar(
        select(func.coalesce(func.sum(ReferralReward.amount), 0)).where(ReferralReward.status == "earned")
    ) or 0

    return {
        "total_referrers": int(total_referrers),
        "invited_total": int(invited_total),
        "successful_total": int(successful_total),
        "cancelled_total": int(cancelled_total),
        "reward_amount_total": int(reward_amount_total),
    }


@router.get("/referrers")
async def referral_referrers(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    # Referrers: users who have at least one referred user.
    ref_users = (
        await db.execute(
            select(User)
            .where(User.id.in_(select(User.referred_by_user_id).where(User.referred_by_user_id.is_not(None))))
            .order_by(User.id.desc())
            .limit(limit)
        )
    ).scalars().all()

    out = []
    for u in ref_users:
        invited = await db.scalar(select(func.count()).select_from(User).where(User.referred_by_user_id == u.id)) or 0
        successful = await db.scalar(
            select(func.count()).select_from(ReferralReward).where(
                ReferralReward.referrer_user_id == u.id, ReferralReward.status == "earned"
            )
        ) or 0
        earned = await db.scalar(
            select(func.coalesce(func.sum(ReferralReward.amount), 0)).where(
                ReferralReward.referrer_user_id == u.id, ReferralReward.status == "earned"
            )
        ) or 0
        out.append(
            {
                "user_id": u.id,
                "telegram_id": u.telegram_id,
                "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username or str(u.telegram_id),
                "username": u.username,
                "referral_code": u.referral_code,
                "invited": int(invited),
                "successful": int(successful),
                "earned": int(earned),
            }
        )
    return out


@router.get("/invited")
async def referral_invited(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(User)
            .where(User.referred_by_user_id.is_not(None))
            .order_by(User.referred_at.desc().nullslast(), User.id.desc())
            .limit(limit)
        )
    ).scalars().all()

    referrer_ids = {u.referred_by_user_id for u in rows if u.referred_by_user_id}
    referrers = {}
    if referrer_ids:
        rr = (await db.execute(select(User).where(User.id.in_(referrer_ids)))).scalars().all()
        referrers = {r.id: r for r in rr}

    out = []
    for u in rows:
        referrer = referrers.get(u.referred_by_user_id)
        reward = await db.scalar(
            select(ReferralReward).where(ReferralReward.referred_user_id == u.id).order_by(ReferralReward.id.desc()).limit(1)
        )
        done_orders = await db.scalar(
            select(func.count()).select_from(Order).where(Order.telegram_id == u.telegram_id, Order.status == "done")
        ) or 0
        out.append(
            {
                "user_id": u.id,
                "telegram_id": u.telegram_id,
                "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username or str(u.telegram_id),
                "username": u.username,
                "referred_at": u.referred_at,
                "referrer_user_id": u.referred_by_user_id,
                "referrer_name": (
                    f"{referrer.first_name or ''} {referrer.last_name or ''}".strip() or referrer.username or str(referrer.telegram_id)
                ) if referrer else None,
                "completed_orders": int(done_orders),
                "reward_status": reward.status if reward else None,
                "reward_amount": reward.amount if reward else 0,
            }
        )
    return out


@router.get("/rewards")
async def referral_rewards(
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(select(ReferralReward).order_by(ReferralReward.created_at.desc(), ReferralReward.id.desc()).limit(limit))
    ).scalars().all()

    user_ids = set()
    for r in rows:
        user_ids.add(r.referrer_user_id)
        user_ids.add(r.referred_user_id)
    users = {}
    if user_ids:
        us = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {u.id: u for u in us}

    out = []
    for r in rows:
        referrer = users.get(r.referrer_user_id)
        referred = users.get(r.referred_user_id)
        out.append(
            {
                "id": r.id,
                "order_id": r.order_id,
                "amount": r.amount,
                "status": r.status,
                "reason": r.reason,
                "cancelled_reason": r.cancelled_reason,
                "created_at": r.created_at,
                "cancelled_at": r.cancelled_at,
                "referrer_name": (
                    f"{referrer.first_name or ''} {referrer.last_name or ''}".strip() or referrer.username or str(referrer.telegram_id)
                ) if referrer else str(r.referrer_user_id),
                "referred_name": (
                    f"{referred.first_name or ''} {referred.last_name or ''}".strip() or referred.username or str(referred.telegram_id)
                ) if referred else str(r.referred_user_id),
            }
        )
    return out


@router.get("/suspicious")
async def referral_suspicious(db: AsyncSession = Depends(get_db)):
    # Simple heuristics: self-referral should be impossible, but report anomalies;
    # same referred_by chains not expected; multiple rewards per referred (should be blocked) etc.
    anomalies = []

    # Referred by self (should never happen)
    self_refs = (await db.execute(select(User).where(User.referred_by_user_id == User.id))).scalars().all()
    for u in self_refs:
        anomalies.append({"type": "self_referral", "user_id": u.id, "telegram_id": u.telegram_id})

    # Users with more than one earned reward as referred (should not happen)
    dup = await db.execute(
        select(ReferralReward.referred_user_id, func.count(ReferralReward.id))
        .where(ReferralReward.status == "earned")
        .group_by(ReferralReward.referred_user_id)
        .having(func.count(ReferralReward.id) > 1)
    )
    for uid, cnt in dup.all():
        anomalies.append({"type": "duplicate_reward", "referred_user_id": uid, "count": int(cnt)})

    return anomalies


@router.post("/rewards/{reward_id}/cancel")
async def cancel_reward(
    reward_id: int,
    payload: CancelRewardIn,
    db: AsyncSession = Depends(get_db),
):
    reward = await db.get(ReferralReward, reward_id)
    if reward is None:
        raise HTTPException(status_code=404, detail="Mukofot topilmadi")
    if reward.status == "cancelled":
        return {"ok": True, "status": "cancelled"}

    reward.status = "cancelled"
    reward.cancelled_reason = payload.reason.strip()
    reward.cancelled_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "status": "cancelled"}
