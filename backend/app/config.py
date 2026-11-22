from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Farrux shop (Hozoosp) API"
    APP_ENV: str = "development"

    DATABASE_URL: str

    BOT_TOKEN: str = ""

    # Поддерживаем и старое имя, и новое (список через запятую).
    ADMIN_TELEGRAM_ID: str = ""
    ADMIN_TELEGRAM_IDS: str = ""

    # Пароль для входа в админку через браузер (Basic Auth).
    # В production обязательно задайте свой пароль в переменных окружения.
    ADMIN_PASSWORD: str = "admin123"

    FRONTEND_URL: str = "http://localhost:5173"
    ADMIN_URL: str = "http://localhost:5174"

    # Публичный HTTPS-адрес витрины для кнопки Mini App в боте.
    # Если пусто, используется FRONTEND_URL.
    WEBAPP_URL: str = ""

    # Публичный адрес backend (для ссылок на /static, например в Telegram).
    # Если пусто, используется первый origin из CORS_ORIGINS, начинающийся с https://
    PUBLIC_API_URL: str = ""

    # Открывать админку без Telegram в dev-режиме (в production всегда False).
    ADMIN_DEV_BYPASS: bool = True

    MAX_UPLOAD_MB: int = 5
    CART_REMINDER_DELAY_MINUTES: int = 60

    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:5174,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174"
    )

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def admin_ids_list(self) -> list[str]:
        raw = self.ADMIN_TELEGRAM_IDS or self.ADMIN_TELEGRAM_ID or ""
        return [
            admin_id.strip()
            for admin_id in raw.replace(";", ",").split(",")
            if admin_id.strip()
        ]

    @property
    def admin_telegram_id(self) -> int | None:
        for value in self.admin_ids_list:
            if value.lstrip("-").isdigit():
                return int(value)
        return None


settings = Settings()