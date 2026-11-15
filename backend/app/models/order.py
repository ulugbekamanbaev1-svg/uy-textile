from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

ORDER_STATUSES = ("new", "confirmed", "delivering", "done", "cancelled")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)

    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    address: Mapped[str] = mapped_column(Text, default="")
    comment: Mapped[str] = mapped_column(Text, default="")

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    total: Mapped[int] = mapped_column(Integer, default=0)

    telegram_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, index=True
    )
    telegram_username: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.id",
    )

    @property
    def number(self) -> str:
        return f"UY-{self.id:05d}"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )

    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    product_slug: Mapped[str] = mapped_column(String(80), default="")

    name_ru: Mapped[str] = mapped_column(String(160), default="")
    name_uz: Mapped[str] = mapped_column(String(160), default="")
    name_uzc: Mapped[str] = mapped_column(String(160), default="")

    variant_label: Mapped[str] = mapped_column(String(80), default="")
    color_ru: Mapped[str] = mapped_column(String(80), default="")
    color_uz: Mapped[str] = mapped_column(String(80), default="")
    color_uzc: Mapped[str] = mapped_column(String(80), default="")
    color_hex: Mapped[str] = mapped_column(String(7), default="")

    width_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    unit_price: Mapped[int] = mapped_column(Integer, default=0)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    line_total: Mapped[int] = mapped_column(Integer, default=0)

    order: Mapped["Order"] = relationship(back_populates="items")
