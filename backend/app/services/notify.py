import html
import logging

import httpx

from app.config import settings
from app.models import Order

logger = logging.getLogger(__name__)


def _public_base_url() -> str:
    base = (getattr(settings, "PUBLIC_API_URL", "") or "").strip().rstrip("/")
    if base:
        return base

    for origin in settings.cors_origins_list:
        if origin.startswith("https://"):
            return origin.rstrip("/")

    return ""


def _public_image_url(url: str) -> str | None:
    if not url:
        return None

    value = url.strip()
    if value.startswith("http://") or value.startswith("https://"):
        return value

    if value.startswith("/"):
        base = _public_base_url()
        return f"{base}{value}" if base else None

    return None


def _item_quantity_label(item) -> str:
    if item.pricing_type == "meter" and item.meters:
        return f"{float(item.meters):g} м"
    if item.pricing_type == "area" and item.width_cm and item.height_cm:
        area = (item.width_cm * item.height_cm) / 10000
        return (
            f"{item.quantity} шт · {item.width_cm}×{item.height_cm} см "
            f"({area:.2f} м²)"
        )
    return f"{item.quantity} ×"


def _item_name(item) -> str:
    return item.name_ru or item.name_uz or item.product_slug


def build_order_message(order: Order) -> str:
    def escape(value: str) -> str:
        return html.escape(value or "", quote=False)

    lines = [
        f"🧾 <b>Новый заказ {escape(order.number)}</b>",
        "",
        f"👤 {escape(order.customer_name)}",
        f"📞 {escape(order.phone)}",
    ]

    if order.address:
        lines.append(f"📍 {escape(order.address)}")

    if order.latitude is not None and order.longitude is not None:
        lines.append(
            "🗺 Геолокация: "
            f'<a href="https://maps.google.com/?q={order.latitude},{order.longitude}">'
            "открыть на карте</a>"
        )

    lines.append("")
    lines.append("<b>Состав заказа:</b>")

    for item in order.items:
        details = [_item_quantity_label(item), _item_name(item)]

        if item.variant_label:
            details.append(item.variant_label)

        if item.color_ru:
            details.append(item.color_ru)

        line = (
            f"• {escape(' · '.join(details))} — "
            f"{item.line_total:,} сум".replace(",", " ")
        )

        photo_url = _public_image_url(getattr(item, "image_url", "") or "")
        if photo_url:
            line += f'\n  Фото: <a href="{html.escape(photo_url, quote=True)}">открыть</a>'

        lines.append(line)

    lines.append("")
    lines.append(f"💰 <b>Итого: {order.total:,} сум</b>".replace(",", " "))
    lines.append("💵 Оплата при получении")

    if order.comment:
        lines.append("")
        lines.append(f"💬 {escape(order.comment)}")

    return "\n".join(lines)


def _order_photo_entries(order: Order) -> list[dict]:
    entries: list[dict] = []
    seen: set[str] = set()

    for item in order.items:
        url = _public_image_url(getattr(item, "image_url", "") or "")
        if not url or url in seen:
            continue

        seen.add(url)
        parts = [_item_quantity_label(item), _item_name(item)]
        if item.variant_label:
            parts.append(item.variant_label)
        caption = " · ".join(parts)
        if len(caption) > 1000:
            caption = caption[:997] + "..."
        entries.append({"url": url, "caption": caption})

    return entries


async def notify_admin_about_order(order: Order) -> bool:
    if not settings.BOT_TOKEN or not settings.ADMIN_TELEGRAM_ID:
        return False

    try:
        url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": settings.ADMIN_TELEGRAM_ID,
            "text": build_order_message(order),
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json=payload)

            if response.status_code != 200:
                logger.warning(
                    "Telegram notification failed: %s %s",
                    response.status_code,
                    response.text[:300],
                )
                return False

            photos = _order_photo_entries(order)
            if photos:
                if len(photos) == 1:
                    photo_resp = await client.post(
                        f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendPhoto",
                        json={
                            "chat_id": settings.ADMIN_TELEGRAM_ID,
                            "photo": photos[0]["url"],
                            "caption": photos[0]["caption"],
                        },
                    )
                else:
                    media = [
                        {"type": "photo", "media": entry["url"]}
                        for entry in photos[:10]
                    ]
                    media[0]["caption"] = f"{order.number}: фото товаров"
                    photo_resp = await client.post(
                        f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMediaGroup",
                        json={
                            "chat_id": settings.ADMIN_TELEGRAM_ID,
                            "media": media,
                        },
                    )

                if photo_resp.status_code != 200:
                    logger.warning(
                        "Telegram photo notification failed: %s %s",
                        photo_resp.status_code,
                        photo_resp.text[:300],
                    )

        return True
    except Exception as error:
        logger.warning("Telegram notification error: %s", error)
        return False


STATUS_MESSAGES = {
    "new": "Новый",
    "confirmed": "Подтверждён",
    "delivering": "В доставке",
    "done": "Выполнен",
    "cancelled": "Отменён",
}


async def notify_customer_about_status(order: Order) -> bool:
    """Уведомляет покупателя в Telegram об изменении статуса заказа."""
    if not settings.BOT_TOKEN or not order.telegram_id:
        return False

    try:
        status_label = STATUS_MESSAGES.get(order.status, order.status)
        text = (
            f"📦 <b>Статус заказа {html.escape(order.number, quote=False)}</b>\n\n"
            f"Новый статус: <b>{html.escape(status_label, quote=False)}</b>\n"
            f"Сумма: {order.total:,} сум".replace(",", " ")
        )

        if order.status == "confirmed":
            text += (
                "\n\n✅ <b>Заказ принят!</b> Магазин начал обработку вашего заказа. "
                "Ориентируемся на доставку."
            )
        elif order.status == "done":
            text += "\n\nСпасибо вам за покупку!"
        elif order.status == "cancelled":
            text += "\n\nЕсли есть вопросы — свяжитесь с нами."

        url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": order.telegram_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            logger.warning(
                "Customer Telegram notification failed: %s %s",
                response.status_code,
                response.text[:300],
            )
            return False

        # Отправляем фото заказанных товаров вместе со статусом
        photo_url = None
        for item in order.items:
            candidate = _public_image_url(getattr(item, "image_url", "") or "")
            if candidate:
                photo_url = candidate
                break

        if photo_url:
            try:
                photo_resp = await client.post(
                    f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendPhoto",
                    json={
                        "chat_id": order.telegram_id,
                        "photo": photo_url,
                        "caption": text[:1020],
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True,
                    },
                )
                if photo_resp.status_code != 200:
                    logger.warning(
                        "Customer Telegram photo notification failed: %s %s",
                        photo_resp.status_code,
                        photo_resp.text[:300],
                    )
            except Exception as photo_error:
                logger.warning("Customer Telegram photo notification error: %s", photo_error)

        return True
    except Exception as error:
        logger.warning("Customer Telegram notification error: %s", error)
        return False
