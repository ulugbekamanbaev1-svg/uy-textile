from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Раздельные события QR-аналитики. Не смешиваем сканирование и открытие Mini App.
QR_EVENT_TYPES = (
    "qr_scan",
    "qr_redirect",
    "miniapp_open",
    "order_created",
    "order_completed",
)


class QrEvent(Base):
    """
    Событие QR-аналитики.

    Мы намеренно НЕ храним IP-адреса, User-Agent и другие персональные данные.
    visitor_id — случайный идентификатор из cookie/localStorage, который нужен
    только для подсчёта уникальных посетителей и защиты от дублей.
    """

    __tablename__ = "qr_events"

    id: Mapped[int] = mapped_column(primary_key=True)

    event_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), nullable=False, default="farrux")

    # Случайный идентификатор посетителя (cookie на backend или localStorage Mini App).
    visitor_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    # Идентификатор сессии Mini App (необязательный, для будущей аналитики).
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Для событий order_created / order_completed.
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Короткая служебная метка (например, источник или причина пропуска).
    meta: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


Index(
    "ix_qr_events_type_visitor_created",
    QrEvent.event_type,
    QrEvent.visitor_id,
    QrEvent.created_at,
)
Index(
    "ix_qr_events_type_order",
    QrEvent.event_type,
    QrEvent.order_id,
)
