from io import BytesIO

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import ReferralReward, User
from app.services.referral import attach_referral, ensure_user_referral_code, get_store_settings, referral_stats_for_user
from app.services.telegram_auth import require_telegram_user

router = APIRouter(prefix="/api/referral", tags=["Referral"])


class AttachIn(BaseModel):
    code: str = Field(min_length=3, max_length=64)


def _bot_username() -> str:
    # Prefer explicit config; fallback is empty (frontend/admin can still show code).
    return (getattr(settings, "TELEGRAM_BOT_USERNAME", "") or "").strip().lstrip("@")


def _referral_link(code: str) -> str:
    username = _bot_username()
    if username:
        return f"https://t.me/{username}?startapp=ref_{code}"
    base = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}?startapp=ref_{code}"


async def _current_user(db: AsyncSession, tg_user: dict) -> User:
    telegram_id = int(tg_user.get("id") or 0)
    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        # Should exist after /api/auth/telegram, but create safely from verified initData.
        user = await upsert_telegram_user(
            db,
            telegram_id=telegram_id,
            first_name=tg_user.get("first_name", "") or "",
            last_name=tg_user.get("last_name", "") or "",
            username=tg_user.get("username"),
            language_code=tg_user.get("language_code"),
            source="mini_app",
            event="mini_app_auth",
            commit=False,
        )
    # keep profile fresh
    user.first_name = tg_user.get("first_name", "") or user.first_name
    user.last_name = tg_user.get("last_name", "") or user.last_name
    user.username = tg_user.get("username") or user.username
    return user


@router.get("/me")
async def my_referral(
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    user = await _current_user(db, tg_user)
    code = await ensure_user_referral_code(db, user)
    stats = await referral_stats_for_user(db, user)
    link = _referral_link(code)

    rewards_result = await db.execute(
        select(ReferralReward)
        .where(ReferralReward.referrer_user_id == user.id)
        .order_by(ReferralReward.created_at.desc())
        .limit(20)
    )
    rewards = [
        {
            "id": r.id,
            "amount": r.amount,
            "status": r.status,
            "created_at": r.created_at,
            "cancelled_reason": r.cancelled_reason,
        }
        for r in rewards_result.scalars().all()
    ]

    await db.commit()
    return {
        "code": code,
        "link": link,
        **stats,
        "rewards": rewards,
    }


@router.post("/attach")
async def attach_my_referral(
    payload: AttachIn,
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    user = await _current_user(db, tg_user)
    await ensure_user_referral_code(db, user)
    result = await attach_referral(db, referred_user=user, referral_code=payload.code)
    await db.commit()
    return result


def _make_qr_image(data: str):
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="#111111", back_color="white").convert("RGB")


def _make_referral_card_png(data: str, code: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    W, H = 900, 1350
    img = Image.new("RGB", (W, H), "#111111")
    draw = ImageDraw.Draw(img)
    gold = "#D4AF37"
    white = "#F5F5F5"

    # border
    draw.rectangle([30, 30, W - 30, H - 30], outline=gold, width=6)
    draw.rectangle([50, 50, W - 50, H - 50], outline="#8a6a1f", width=2)

    def font(size, bold=False):
        for name in ["DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf", "DejaVuSans.ttf", "arial.ttf"]:
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                pass
        return ImageFont.load_default()

    title_f = font(64, True)
    sub_f = font(34)
    body_f = font(30)
    code_f = font(38, True)
    small_f = font(24)

    def center(text, y, f, fill):
        bbox = draw.textbbox((0, 0), text, font=f)
        x = (W - (bbox[2] - bbox[0])) / 2
        draw.text((x, y), text, font=f, fill=fill)

    center("FARRUX SHOP", 110, title_f, gold)
    center("Do‘stlarni taklif qiling", 210, sub_f, white)
    center("Sifatli uy tekstili", 260, small_f, "#d9c27a")

    qr_img = _make_qr_image(data).resize((560, 560))
    # white plate
    draw.rectangle([150, 360, 750, 960], fill="white")
    img.paste(qr_img, (170, 380))

    center("QR kodni skanerlang", 1015, body_f, white)
    center("va Farrux Shop'da xarid qiling", 1055, body_f, white)
    center(f"Taklif kodi: {code}", 1145, code_f, gold)
    center("Farrux Shop — uy uchun qulaylik", 1245, small_f, "#d9c27a")

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/qr/png")
async def referral_qr_png(
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    user = await _current_user(db, tg_user)
    code = await ensure_user_referral_code(db, user)
    await db.commit()
    png = _make_referral_card_png(_referral_link(code), code)
    return Response(content=png, media_type="image/png", headers={"Content-Disposition": f'attachment; filename="farrux-referral-{code}.png"'})


@router.get("/qr/pdf")
async def referral_qr_pdf(
    db: AsyncSession = Depends(get_db),
    tg_user: dict = Depends(require_telegram_user),
):
    from reportlab.lib.pagesizes import A6
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import HexColor

    user = await _current_user(db, tg_user)
    code = await ensure_user_referral_code(db, user)
    link = _referral_link(code)
    await db.commit()

    qr_png = _make_referral_card_png(link, code)
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A6)
    w, h = A6
    c.drawImage(ImageReader(BytesIO(qr_png)), 0, 0, w, h)
    c.setStrokeColor(HexColor("#D4AF37"))
    c.setLineWidth(1)
    c.rect(2*mm, 2*mm, w-4*mm, h-4*mm, fill=0, stroke=1)
    c.showPage()
    c.save()
    return Response(content=buf.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="farrux-referral-{code}.pdf"'})