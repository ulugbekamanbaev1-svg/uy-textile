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

logger = logging.getLogger(__name__)


def _money(value: int | float) -> str:
    return f"{int(round(value)):,}".replace(",", " ") + " so'm"


def _cart_button_url() -> str | None:
    base = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").strip().rstrip("/")
    if not base:
        return None
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}startapp=cart"


def _format_cart_message(items: list[dict], total: int) -> str:
    lines = ["🛒 <b>Вы забыли оформить заказ</b>", ""]
    for item in items[:10]:
        name = item.get("name") or item.get("name_ru") or "Товар"
        qty = item.get("qty_label") or item.get("qty") or item.get("meters") or 1
        price = item.get("line_total") or item.get("total") or item.get("price") or 0
        lines.append(f"• {name} — {qty} — {_money(price)}")
    if len(items) > 10:
        lines.append(f"• ... и ещё {len(items) - 10}")
    lines.append("")
    lines.append(f"<b>Сумма: {_money(total)}</b>")
    lines.append("")
    lines.append("Нажмите кнопку ниже, чтобы вернуться в корзину и завершить заказ.")
    return "\n".join(lines)


async def sync_cart_reminder(
    db: AsyncSession,
    telegram_id: int,
    items: list[dict],
    total: int,
) -> None:
    now = datetime.now(timezone.utc)
    delay = max(1, int(settings.CART_REMINDER_DELAY_MINUTES or 60))
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
            or "Товар"
        )
        qty_label = item.get("qty_label")
        if not qty_label:
            meters = item.get("meters")
            if meters:
                qty_label = f"{meters} m"
            else:
                qty_label = str(item.get("qty") or item.get("quantity") or 1)
        line_total = int(item.get("line_total") or item.get("total") or item.get("price") or 0)
        normalized.append({"name": str(name)[:120], "qty_label": str(qty_label)[:40], "line_total": line_total})
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
    scheduled_at = now + timedelta(minutes=delay)

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
        result = await db.execute(
            select(CartReminder).where(
                CartReminder.status == "pending",
                CartReminder.scheduled_at.is_not(None),
                CartReminder.scheduled_at <= now,
            ).limit(50)
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

                text = _format_cart_message(items, reminder.total)
                keyboard = None
                if url:
                    keyboard = {
                        "inline_keyboard": [[{"text": "Вернуться в корзину", "web_app": {"url": url}}]]
                    }
                    # web_app button requires private chat and https; also add fallback not possible in same button.
                    # If not https, use url.
                    if not url.startswith("https://"):
                        keyboard = {"inline_keyboard": [[{"text": "Вернуться в корзину", "url": url}]]}

                payload = {
                    "chat_id": reminder.telegram_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                }
                if keyboard:
                    payload["reply_markup"] = keyboard

                try:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                        json=payload,
                    )
                    ok = resp.status_code == 200 and resp.json().get("ok")
                except Exception as exc:
                    logger.warning("Cart reminder send error: %s", exc)
                    ok = False

                if ok:
                    reminder.status = "sent"
                    reminder.sent_at = now
                    sent += 1
                else:
                    # don't hammer; reschedule 30 min later
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
