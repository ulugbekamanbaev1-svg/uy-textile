from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CurrencyRateCache(Base):
    """Cached normalized currency rates for one currency/source_type."""

    __tablename__ = "currency_rate_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="wasyt")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bank")
    # JSON: {"banks":[...], "best_buy":..., "best_sell":..., "cbu":..., "source_url":..., "updated_at":...}
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    source_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stale_reason: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CurrencyModuleState(Base):
    """Singleton state/settings for currency module."""

    __tablename__ = "currency_module_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="wasyt")
    refresh_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_error_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_refresh_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_manual_refresh_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    attribution: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
