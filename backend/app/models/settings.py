from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StoreSettings(Base):
    """Единственная строка настроек магазина (id = 1)."""

    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    store_name: Mapped[str] = mapped_column(
        String(120), default="Farrux shop (Hozoosp)"
    )
    phone: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    working_hours: Mapped[str] = mapped_column(String(120), default="")

    delivery_info: Mapped[str] = mapped_column(Text, default="")
    payment_info: Mapped[str] = mapped_column(Text, default="")

    instagram: Mapped[str] = mapped_column(String(120), default="")
    telegram: Mapped[str] = mapped_column(String(120), default="")

    hero_title_ru: Mapped[str] = mapped_column(String(160), default="")
    hero_title_uz: Mapped[str] = mapped_column(String(160), default="")
    hero_title_uzc: Mapped[str] = mapped_column(String(160), default="")
    hero_text_ru: Mapped[str] = mapped_column(Text, default="")
    hero_text_uz: Mapped[str] = mapped_column(Text, default="")
    hero_text_uzc: Mapped[str] = mapped_column(Text, default="")

    banner_active: Mapped[bool] = mapped_column(Boolean, default=False)
    banner_text_ru: Mapped[str] = mapped_column(String(200), default="")
    banner_text_uz: Mapped[str] = mapped_column(String(200), default="")
    banner_text_uzc: Mapped[str] = mapped_column(String(200), default="")
    banner_category: Mapped[str] = mapped_column(String(80), default="")

    logo_url: Mapped[str] = mapped_column(String(255), default="")
    store_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    store_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
