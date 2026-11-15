from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StoreSettings(Base):
    """Единственная строка настроек магазина (id = 1)."""

    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    store_name: Mapped[str] = mapped_column(
        String(120), default="Uy Textile"
    )
    phone: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    working_hours: Mapped[str] = mapped_column(String(120), default="")

    delivery_info: Mapped[str] = mapped_column(Text, default="")
    payment_info: Mapped[str] = mapped_column(Text, default="")

    instagram: Mapped[str] = mapped_column(String(120), default="")
    telegram: Mapped[str] = mapped_column(String(120), default="")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
