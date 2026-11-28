
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    telegram_id: Mapped[int] = mapped_column(
        BigInteger,
        unique=True,
        index=True,
        nullable=False,
    )

    first_name: Mapped[str] = mapped_column(
        String(150),
        default="",
    )

    last_name: Mapped[str] = mapped_column(
        String(150),
        default="",
    )

    username: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    language_code: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    referral_code: Mapped[str | None] = mapped_column(
        String(32),
        unique=True,
        index=True,
        nullable=True,
    )
    referred_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    referred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    vip_level: Mapped[str] = mapped_column(
        String(20),
        default="silver",
        index=True,
    )
    vip_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --- Telegram activity / recovery tracking ---
    # Точная дата /start неизвестна для исторических пользователей — не выдумываем.
    bot_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    first_mini_app_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_mini_app_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_bot_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    mini_app_visits_count: Mapped[int] = mapped_column(Integer, default=0)
    bot_starts_count: Mapped[int] = mapped_column(Integer, default=0)
    sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    registration_source: Mapped[str] = mapped_column(
        String(32), default="unknown"
    )  # bot_start|mini_app|recovered_orders|recovered_cart|unknown
    is_recovered: Mapped[bool] = mapped_column(Boolean, default=False)
    recovered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recovery_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
