import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException

from app.config import settings


def verify_telegram_init_data(init_data: str) -> dict:
    """
    Проверяет подпись initData, которую Telegram передаёт Mini App.
    Без этой проверки нельзя доверять telegram_id из браузера.
    """
    if not settings.BOT_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Telegram bot is not configured",
        )

    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)

        if not received_hash:
            raise ValueError("Missing hash")

        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(parsed.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            settings.BOT_TOKEN.encode(),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            raise ValueError("Invalid signature")

        auth_date = int(parsed.get("auth_date", "0"))

        if time.time() - auth_date > 86400:
            raise ValueError("Expired authentication")

        user_raw = parsed.get("user")

        if not user_raw:
            raise ValueError("Missing user")

        return json.loads(user_raw)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram authentication data",
        )


def admin_telegram_ids() -> set[int]:
    """ADMIN_TELEGRAM_ID может содержать несколько ID через запятую."""
    ids: set[int] = set()

    for chunk in settings.ADMIN_TELEGRAM_ID.replace(";", ",").split(","):
        value = chunk.strip()

        if value.isdigit():
            ids.add(int(value))

    return ids


def password_matches(authorization: str | None) -> bool:
    """
    Проверяет Basic Auth (admin:<пароль>) для входа в админку из браузера.
    Пароль берётся из ADMIN_PASSWORD.
    """
    expected = settings.ADMIN_PASSWORD or ""

    if not expected or not authorization:
        return False

    scheme, _, encoded = authorization.partition(" ")

    if scheme.lower() != "basic" or not encoded:
        return False

    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except Exception:
        return False

    _, _, password = decoded.partition(":")

    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))


def require_admin(
    x_telegram_init_data: str | None = Header(
        default=None,
        alias="X-Telegram-Init-Data",
    ),
    authorization: str | None = Header(default=None),
) -> int:
    """
    Закрывает /api/admin/*.

    Доступ разрешён, если выполнено хотя бы одно условие:
    - передан корректный Basic Auth с паролем ADMIN_PASSWORD (вход из браузера);
    - передан корректный Telegram initData владельца из ADMIN_TELEGRAM_ID;
    - включён ADMIN_DEV_BYPASS вне production.
    """
    if password_matches(authorization):
        return 0

    if not x_telegram_init_data:
        if settings.ADMIN_DEV_BYPASS and settings.APP_ENV != "production":
            return 0

        raise HTTPException(
            status_code=401,
            detail="Требуется пароль администратора или вход через Telegram",
        )

    user = verify_telegram_init_data(x_telegram_init_data)
    telegram_id = int(user.get("id") or 0)

    if telegram_id not in admin_telegram_ids():
        raise HTTPException(
            status_code=403,
            detail="Нет доступа к админке",
        )

    return telegram_id
