from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Uy Textile API"
    APP_ENV: str = "development"

    DATABASE_URL: str

    BOT_TOKEN: str = ""
    ADMIN_TELEGRAM_ID: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    ADMIN_URL: str = "http://localhost:5174"

    # Публичный HTTPS-адрес витрины для кнопки Mini App в боте.
    # Если пусто, используется FRONTEND_URL.
    WEBAPP_URL: str = ""

    # Открывать админку без Telegram в dev-режиме (в production всегда False).
    ADMIN_DEV_BYPASS: bool = True

    MAX_UPLOAD_MB: int = 5

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


settings = Settings()
