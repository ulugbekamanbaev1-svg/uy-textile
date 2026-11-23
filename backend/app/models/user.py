
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
