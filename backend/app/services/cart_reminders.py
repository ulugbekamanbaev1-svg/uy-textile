import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import CartReminder
from app.models.settings import StoreSettings

logger = logging.getLogger(__name__)

TZ_TASHKENT = timezone(timedelta(hours=5))


def _money(value: int | float) -> str:
    return f"{int(round(value)):,}".replace(",", " ") + " so'm"


def _cart_button_url() -> str | None:
    base = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").strip().rstrip("/")
    if not base:
        return None
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}startapp=cart"


def _reminder_image_url(url: str | None) -> str | None:
    if not url:
        return None

    value = url.strip()
    if value.startswith("http://") or value.startswith("https://"):
        return value

    base = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").strip().rstrip("/")
    if value.startswith("/") and base:
        return f"{base}{value}"

    return None


def _slot_for_time(dt_utc: datetime) -> str:
    local = dt_utc.astimezone(TZ_TASHKENT)
    # 12:00 slot for morning/day, 18:00 slot for evening
    return "evening" if local.hour >= 15 else "day"


def _next_slot(now_utc: datetime) -> tuple[datetime, str]:
    local = now_utc.astimezone(TZ_TASHKENT)
    day_slot = local.replace(hour=12, minute=0, second=0, microsecond=0)
    evening_slot = local.replace(hour=18, minute=0, second=0, microsecond=0)

    if local < day_slot:
        return day_slot.astimezone(timezone.utc), "day"
    if local < evening_slot:
        return evening_slot.astimezone(timezone.utc), "evening"

    next_day = (local + timedelta(days=1)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    return next_day.astimezone(timezone.utc), "day"


def _same_day_evening(now_utc: datetime) -> datetime:
    local = now_utc.astimezone(TZ_TASHKENT)
    evening = local.replace(hour=18, minute=0, second=0, microsecond=0)
    if evening <= local:
        evening = evening + timedelta(days=1)
    return evening.astimezone(timezone.utc)


def _format_cart_message(items: list[dict], total: int, slot: str) -> str:
    if slot == "evening":
        lines = [
            "🌙 <b>Xaridingizni yakunlash vaqti keldi!</b>",
            "",
            "Savatingizda siz tanlagan mahsulotlar bor.",
            "Farrux Shop sizni kutmoqda! ❤️",
        ]
    else:
        lines = [
            "🛍 <b>Savatingizda mahsulotlar qolib ketdi!</b>",
            "",
            "Sizga yoqqan mahsulotlar hali ham savatingizda kutmoqda ❤️",
            "Xaridingizni yakunlashni unutmang!",
        ]

    lines.append("")
    for item in items[:10]:
        name = item.get("name") or item.get("name_ru") or "Mahsulot"
        qty = item.get("qty_label") or item.get("qty") or item.get("meters") or 1
        price = item.get("line_total") or item.get("total") or item.get("price") or 0
        lines.append(f"• {name} — {qty} — {_money(price)}")
    if len(items) > 10:
        lines.append(f"• ... yana {len(items) - 10} ta mahsulot")
    lines.append("")
    lines.append(f"<b>Jami: {_money(total)}</b>")
    return "\n".join(lines)


async def _get_reminder_settings(db: AsyncSession) -> tuple[bool, bool, bool]:
    result = await db.execute(select(StoreSettings).where(StoreSettings.id == 1))
    store = result.scalar_one_or_none()
    if store is None:
        return True, True, True
    return (
        bool(getattr(store, "cart_reminders_enabled", True)),
        bool(getattr(store, "cart_reminder_day_enabled", True)),
        bool(getattr(store, "cart_reminder_evening_enabled", True)),
    )


async def sync_cart_reminder(
    db: AsyncSession,
    telegram_id: int,
    items: list[dict],
    total: int,
) -> None:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(CartReminder).where(CartReminder.telegram_id == telegram_id)
    )
    reminder = result.scalar_one_or_none()

    normalized = []
    item_count = 0
    for item in items:
        name = (
            item.get("name")
            or item.get("name_ru")
            or item.get("name_uz")
            or item.get("title")
            or "Mahsulot"
        )
        qty_label = item.get("qty_label")
        if not qty_label:
            meters = item.get("meters")
            if meters:
                qty_label = f"{meters} m"
            else:
                qty_label = str(item.get("qty") or item.get("quantity") or 1)
        line_total = int(item.get("line_total") or item.get("total") or item.get("price") or 0)
        normalized.append(
            {
                "name": str(name)[:120],
                "qty_label": str(qty_label)[:40],
                "line_total": line_total,
                "image_url": str(item.get("image_url") or item.get("image") or item.get("photo") or "")[:255],
            }
        )
        item_count += 1

    if item_count == 0:
        if reminder and reminder.status == "pending":
            reminder.status = "cancelled"
            reminder.cancelled_at = now
            reminder.cart_json = "[]"
            reminder.total = 0
            reminder.item_count = 0
        return

    payload = json.dumps(normalized, ensure_ascii=False)
    scheduled_at, _slot = _next_slot(now)

    if reminder is None:
        reminder = CartReminder(
            telegram_id=telegram_id,
            cart_json=payload,
            total=int(total),
            item_count=item_count,
            status="pending",
            scheduled_at=scheduled_at,
        )
        db.add(reminder)
    else:
        reminder.cart_json = payload
        reminder.total = int(total)
        reminder.item_count = item_count
        reminder.status = "pending"
        reminder.scheduled_at = scheduled_at
        reminder.sent_at = None
        reminder.cancelled_at = None


async def cancel_cart_reminder(db: AsyncSession, telegram_id: int) -> None:
    result = await db.execute(
        select(CartReminder).where(
            CartReminder.telegram_id == telegram_id,
            CartReminder.status == "pending",
        )
    )
    reminder = result.scalar_one_or_none()
    if reminder:
        reminder.status = "cancelled"
        reminder.cancelled_at = datetime.now(timezone.utc)


async def send_due_cart_reminders() -> int:
    if not settings.BOT_TOKEN:
        return 0

    now = datetime.now(timezone.utc)
    sent = 0
    async with AsyncSessionLocal() as db:
        enabled, day_enabled, evening_enabled = await _get_reminder_settings(db)
        if not enabled:
            return 0

        result = await db.execute(
            select(CartReminder)
            .where(
                CartReminder.status == "pending",
                CartReminder.scheduled_at.is_not(None),
                CartReminder.scheduled_at <= now,
            )
            .limit(50)
        )
        reminders = list(result.scalars().all())

        if not reminders:
            return 0

        url = _cart_button_url()
        async with httpx.AsyncClient(timeout=15) as client:
            for reminder in reminders:
                try:
                    items = json.loads(reminder.cart_json or "[]")
                except Exception:
                    items = []
                if not items:
                    reminder.status = "cancelled"
                    reminder.cancelled_at = now
                    continue

                slot = _slot_for_time(reminder.scheduled_at or now)
                if slot == "day" and not day_enabled:
                    # Skip day slot, move to evening or next day
                    if evening_enabled:
                        reminder.scheduled_at = _same_day_evening(now)
                    else:
                        reminder.scheduled_at = _next_slot(now + timedelta(hours=1))[0]
                    continue
                if slot == "evening" and not evening_enabled:
                    reminder.status = "sent"
                    reminder.sent_at = now
                    continue

                text = _format_cart_message(items, reminder.total, slot)
                keyboard = None
                if url:
                    button = {"text": "🛒 Savatga qaytish", "web_app": {"url": url}}
                    if not url.startswith("https://"):
                        button = {"text": "🛒 Savatga qaytish", "url": url}
                    keyboard = {"inline_keyboard": [[button]]}

                image_url = _reminder_image_url(items[0].get("image_url")) if items else None

                try:
                    if image_url:
                        photo_payload = {
                            "chat_id": reminder.telegram_id,
                            "photo": image_url,
                            "caption": text[:1020],
                            "parse_mode": "HTML",
                        }
                        if keyboard:
                            photo_payload["reply_markup"] = keyboard
                        resp = await client.post(
                            f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendPhoto",
                            json=photo_payload,
                        )
                    else:
                        msg_payload = {
                            "chat_id": reminder.telegram_id,
                            "text": text,
                            "parse_mode": "HTML",
                            "disable_web_page_preview": True,
                        }
                        if keyboard:
                            msg_payload["reply_markup"] = keyboard
                        resp = await client.post(
                            f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                            json=msg_payload,
                        )
                    ok = resp.status_code == 200 and resp.json().get("ok")
                except Exception as exc:
                    logger.warning("Cart reminder send error: %s", exc)
                    ok = False

                if ok:
                    sent += 1
                    reminder.sent_at = now
                    if slot == "day" and evening_enabled:
                        reminder.status = "pending"
                        reminder.scheduled_at = _same_day_evening(now)
                    else:
                        reminder.status = "sent"
                else:
                    reminder.scheduled_at = now + timedelta(minutes=30)

        await db.commit()
    return sent


async def cart_reminder_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await send_due_cart_reminders()
        except Exception as exc:
            logger.warning("Cart reminder loop error: %s", exc)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass