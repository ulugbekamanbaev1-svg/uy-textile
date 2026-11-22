import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Broadcast, User

logger = logging.getLogger(__name__)


def _public_base_url() -> str:
    base = (getattr(settings, "PUBLIC_API_URL", "") or "").strip().rstrip("/")
    if base:
        return base
    for origin in settings.cors_origins_list:
        if origin.startswith("https://"):
            return origin.rstrip("/")
    return ""


def _public_media_url(url: str) -> str | None:
    value = (url or "").strip()
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("/"):
        base = _public_base_url()
        return f"{base}{value}" if base else None
    return None


def _inline_keyboard(broadcast: Broadcast) -> dict | None:
    buttons: list[dict] = []
    for text, url in (
        (broadcast.buy_text, broadcast.buy_url),
        (broadcast.details_text, broadcast.details_url),
    ):
        text = (text or "").strip()
        url = (url or "").strip()
        if not text or not url:
            continue
        if url.startswith("https://"):
            # web_app is convenient for Mini App links; fall back to url on failure handled by caller? 
            # Use url button for maximum compatibility.
            buttons.append({"text": text, "url": url})
        else:
            buttons.append({"text": text, "url": url})
    if not buttons:
        return None
    return {"inline_keyboard": [buttons]}


async def _send_one(
    client: httpx.AsyncClient,
    chat_id: int,
    broadcast: Broadcast,
) -> tuple[bool, str | None]:
    token = settings.BOT_TOKEN
    keyboard = _inline_keyboard(broadcast)
    text = broadcast.message or ""
    media_url = _public_media_url(broadcast.media_url)

    try:
        if broadcast.media_type == "photo" and media_url:
            payload = {
                "chat_id": chat_id,
                "photo": media_url,
                "caption": text[:1024],
                "parse_mode": "HTML",
            }
            if keyboard:
                payload["reply_markup"] = keyboard
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendPhoto", json=payload
            )
        elif broadcast.media_type == "video" and media_url:
            payload = {
                "chat_id": chat_id,
                "video": media_url,
                "caption": text[:1024],
                "parse_mode": "HTML",
            }
            if keyboard:
                payload["reply_markup"] = keyboard
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendVideo", json=payload
            )
        else:
            payload = {
                "chat_id": chat_id,
                "text": text[:4096],
                "disable_web_page_preview": False,
                "parse_mode": "HTML",
            }
            if keyboard:
                payload["reply_markup"] = keyboard
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage", json=payload
            )

        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                return True, None
            return False, str(data)[:200]

        if resp.status_code == 429:
            retry_after = 1
            try:
                retry_after = int(resp.json().get("parameters", {}).get("retry_after", 1))
            except Exception:
                pass
            await asyncio.sleep(min(retry_after, 30))
            return False, f"429 retry_after={retry_after}"

        return False, f"{resp.status_code}: {resp.text[:180]}"
    except Exception as exc:
        return False, str(exc)[:200]


async def run_broadcast(broadcast_id: int) -> None:
    async with AsyncSessionLocal() as db:
        broadcast = await db.get(Broadcast, broadcast_id)
        if broadcast is None:
            return

        if not settings.BOT_TOKEN:
            broadcast.status = "failed"
            broadcast.error_log = "BOT_TOKEN не настроен на сервере"
            broadcast.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return

        try:
            result = await db.execute(
                select(User.telegram_id).where(User.telegram_id.is_not(None))
            )
            chat_ids = [int(row[0]) for row in result.all() if row[0]]

            broadcast.status = "sending"
            broadcast.total_recipients = len(chat_ids)
            broadcast.sent_count = 0
            broadcast.failed_count = 0
            broadcast.error_log = ""
            await db.commit()

            if not chat_ids:
                broadcast.status = "failed"
                broadcast.error_log = "Нет подписчиков: пользователи ещё не запускали бота"
                broadcast.completed_at = datetime.now(timezone.utc)
                await db.commit()
                return

            media_url = _public_media_url(broadcast.media_url)
            if broadcast.media_type in {"photo", "video"} and broadcast.media_url and not media_url:
                broadcast.error_log = "Медиа недоступно по публичному URL; отправлен только текст.\n"

            errors: list[str] = []
            async with httpx.AsyncClient(timeout=30) as client:
                for index, chat_id in enumerate(chat_ids, start=1):
                    ok, err = await _send_one(client, chat_id, broadcast)
                    if not ok and err and err.startswith("429"):
                        ok, err = await _send_one(client, chat_id, broadcast)

                    if ok:
                        broadcast.sent_count += 1
                    else:
                        broadcast.failed_count += 1
                        if err and len(errors) < 20:
                            errors.append(f"{chat_id}: {err}")

                    if index % 20 == 0:
                        broadcast.error_log = ((broadcast.error_log or "") + "\n".join(errors))[-4000:]
                        await db.commit()

                    await asyncio.sleep(0.05)

            base_log = ""
            if broadcast.media_type in {"photo", "video"} and broadcast.media_url and not media_url:
                base_log = "Медиа недоступно по публичному URL; отправлен только текст.\n"
            broadcast.error_log = (base_log + "\n".join(errors))[-4000:]
            broadcast.status = "completed" if broadcast.sent_count > 0 else "failed"
            broadcast.completed_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as exc:
            logger.exception("Broadcast %s failed", broadcast_id)
            broadcast.status = "failed"
            broadcast.error_log = (broadcast.error_log or "") + f"\nОшибка: {exc}"
            broadcast.error_log = broadcast.error_log[-4000:]
            broadcast.completed_at = datetime.now(timezone.utc)
            await db.commit()
