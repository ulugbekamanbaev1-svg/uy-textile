import html
import logging

import httpx

from app.config import settings
from app.models import Order

logger = logging.getLogger(__name__)


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
        name = item.name_ru or item.name_uz or item.product_slug
        details = [f"{item.quantity} × {name}"]

        if item.variant_label:
            details.append(item.variant_label)

        if item.color_ru:
            details.append(item.color_ru)

        lines.append(
            f"• {escape(' · '.join(details))} — "
            f"{item.line_total:,} сум".replace(",", " ")
        )

    lines.append("")
    lines.append(f"💰 <b>Итого: {order.total:,} сум</b>".replace(",", " "))
    lines.append("💵 Оплата при получении")

    if order.comment:
        lines.append("")
        lines.append(f"💬 {escape(order.comment)}")

    return "\n".join(lines)


async def notify_admin_about_order(order: Order) -> bool:
    if not settings.BOT_TOKEN or not settings.ADMIN_TELEGRAM_ID:
        return False

    try:
        text = build_order_message(order)
        url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": settings.ADMIN_TELEGRAM_ID,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            logger.warning(
                "Telegram notification failed: %s %s",
                response.status_code,
                response.text[:300],
            )
            return False

        return True
    except Exception as error:  # заказ не должен падать из-за уведомления
        logger.warning("Telegram notification error: %s", error)
        return False
