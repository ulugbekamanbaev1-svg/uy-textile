import secrets
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

GROUP_STATUSES = (
    "open",
    "target_reached",
    "payment_pending",
    "paid",
    "admin_confirmed",
    "preparing",
    "completed",
    "expired",
    "cancelled",
)

PARTICIPANT_STATUSES = (
    "joined",
    "payment_pending",
    "paid",
    "preparing",
    "ready",
    "shipped",
    "delivered",
    "cancelled",
)

PAYMENT_MODES = ("individual", "organizer")
PAYMENT_STATUSES = ("pending", "paid", "failed", "refunded", "cancelled")


def generate_invite_token() -> str:
    return secrets.token_urlsafe(18)


class GroupPurchase(Base):
    __tablename__ = "group_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True, index=True)
    color_id: Mapped[int | None] = mapped_column(ForeignKey("product_colors.id", ondelete="SET NULL"), nullable=True, index=True)

    organizer_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    organizer_telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)

    minimum_meters: Mapped[float] = mapped_column(Numeric(10, 2), default=10)
    target_meters: Mapped[float] = mapped_column(Numeric(10, 2), default=10)
    confirmed_meters: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    # Locked wholesale price per meter at group creation/target; may be null until priced.
    wholesale_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retail_price: Mapped[int | None] = mapped_column(Integer, nullable=True)

    payment_mode: Mapped[str] = mapped_column(String(20), default="individual")
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)

    invitation_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    invite_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    cancelled_reason: Mapped[str] = mapped_column(Text, default="")
    extended_reason: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    participants: Mapped[list["GroupPurchaseParticipant"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="GroupPurchaseParticipant.id"
    )
    payments: Mapped[list["GroupPurchasePayment"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="GroupPurchasePayment.id"
    )
    events: Mapped[list["GroupPurchaseEvent"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="GroupPurchaseEvent.id.desc()"
    )


class GroupPurchaseParticipant(Base):
    __tablename__ = "group_purchase_participants"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_participant_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("group_purchases.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    is_organizer: Mapped[bool] = mapped_column(Boolean, default=False)

    meters: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    unit_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)

    payment_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    fulfillment_status: Mapped[str] = mapped_column(String(30), default="joined", index=True)

    # Personal order created/reused for this participant's fulfillment.
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)

    address: Mapped[str] = mapped_column(Text, default="")
    delivery_district: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)

    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    group: Mapped["GroupPurchase"] = relationship(back_populates="participants")


class GroupPurchasePayment(Base):
    __tablename__ = "group_purchase_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("group_purchases.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int | None] = mapped_column(ForeignKey("group_purchase_participants.id", ondelete="SET NULL"), nullable=True, index=True)
    payer_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    payer_telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)

    payment_mode: Mapped[str] = mapped_column(String(20), default="individual")
    amount: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(40), default="manual_cod")
    provider_payment_id: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), default="", index=True)
    note: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GroupPurchaseEvent(Base):
    __tablename__ = "group_purchase_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("group_purchases.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    old_value: Mapped[str] = mapped_column(Text, default="")
    new_value: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)