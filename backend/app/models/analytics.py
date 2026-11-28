"""Модели аналитики посетителей.

Данные первой стороны: без IP-адресов, fingerprinting и сторонних трекеров.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Visitor(Base):
    __tablename__ = "visitors"
    __table_args__ = (
        Index("ix_visitors_last_seen_at", "last_seen_at"),
        Index("ix_visitors_first_seen_at", "first_seen_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, index=True, nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    visitor_type: Mapped[str] = mapped_column(
        String(20), default="anonymous", index=True
    )
    device_type: Mapped[str] = mapped_column(String(20), default="unknown")
    session_count: Mapped[int] = mapped_column(Integer, default=0)

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    sessions: Mapped[list["VisitorSession"]] = relationship(
        back_populates="visitor", cascade="all, delete-orphan"
    )
    events: Mapped[list["VisitorEvent"]] = relationship(
        back_populates="visitor", cascade="all, delete-orphan"
    )
    consent: Mapped["VisitorConsent | None"] = relationship(
        back_populates="visitor", cascade="all, delete-orphan", uselist=False
    )


class VisitorSession(Base):
    __tablename__ = "visitor_sessions"
    __table_args__ = (
        UniqueConstraint("session_uuid", name="uq_visitor_sessions_uuid"),
        Index("ix_visitor_sessions_visitor_started", "visitor_id", "started_at"),
        Index("ix_visitor_sessions_status_seen", "status", "last_seen_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[int] = mapped_column(
        ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_page: Mapped[str] = mapped_column(String(500), default="")
    referrer: Mapped[str] = mapped_column(String(500), default="")
    device_type: Mapped[str] = mapped_column(String(20), default="unknown")
    browser: Mapped[str] = mapped_column(String(40), default="unknown")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visitor: Mapped[Visitor] = relationship(back_populates="sessions")
    events: Mapped[list["VisitorEvent"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class VisitorEvent(Base):
    __tablename__ = "visitor_events"
    __table_args__ = (
        UniqueConstraint("event_uuid", name="uq_visitor_events_uuid"),
        Index("ix_visitor_events_visitor_created", "visitor_id", "created_at"),
        Index("ix_visitor_events_session_created", "session_id", "created_at"),
        Index("ix_visitor_events_type_created", "event_type", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[int] = mapped_column(
        ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("visitor_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    event_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    page_url: Mapped[str] = mapped_column(String(500), default="")
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_data: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    visitor: Mapped[Visitor] = relationship(back_populates="events")
    session: Mapped[VisitorSession | None] = relationship(back_populates="events")


class VisitorConsent(Base):
    __tablename__ = "visitor_consents"
    __table_args__ = (
        UniqueConstraint("visitor_id", name="uq_visitor_consents_visitor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[int] = mapped_column(
        ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analytics_consent: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_version: Mapped[str] = mapped_column(String(20), default="1")
    consent_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visitor: Mapped[Visitor] = relationship(back_populates="consent")
