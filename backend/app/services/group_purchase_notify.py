import html
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def _send(chat_id: int | None, text: str) -> bool:
    if not settings.BOT_TOKEN or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            )
        return resp.status_code == 200
    except Exception as e:
        logger.warning("Group purchase notify error: %s", e)
        return False


async def notify_group_created(organizer_telegram_id: int, group_code: str, product_name: str) -> None:
    text = (
        f"🛍 <b>Birgalikda xarid yaratildi</b>\n\n"
        f"Guruh: <b>#{html.escape(group_code)}</b>\n"
        f"Mahsulot: {html.escape(product_name or '')}\n\n"
        f"Do'stlaringizni taklif qilish uchun havolani ulashing."
    )
    await _send(organizer_telegram_id, text)


async def notify_group_joined(organizer_telegram_id: int, group_code: str, participant_name: str, meters: float) -> None:
    text = (
        f"👥 <b>Guruhga yangi ishtirokchi qo'shildi</b>\n\n"
        f"Guruh: <b>#{html.escape(group_code)}</b>\n"
        f"Ishtirokchi: {html.escape(participant_name or '')}\n"
        f"Metr: {meters:g}"
    )
    await _send(organizer_telegram_id, text)


async def notify_group_target_reached(telegram_ids: list[int], group_code: str) -> None:
    text = (
        f"✅ <b>Guruh minimal hajmga yetdi!</b>\n\n"
        f"Guruh: <b>#{html.escape(group_code)}</b>\n"
        f"Endi to'lov bosqichiga o'tish mumkin."
    )
    for tid in telegram_ids:
        await _send(tid, text)


async def notify_group_payment_confirmed(telegram_ids: list[int], group_code: str) -> None:
    text = (
        f"💳 <b>To'lov tasdiqlandi</b>\n\n"
        f"Guruh: <b>#{html.escape(group_code)}</b>\n"
        f"Buyurtmangiz qayta ishlanmoqda."
    )
    for tid in telegram_ids:
        await _send(tid, text)