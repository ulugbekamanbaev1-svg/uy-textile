"""Схемы запросов аналитики посетителей."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EventType = Literal[
    "page_view",
    "product_view",
    "category_view",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "checkout_start",
    "order_created",
    "login",
    "logout",
    "session_start",
    "session_end",
]

ALLOWED_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "page_view",
        "product_view",
        "category_view",
        "search",
        "add_to_cart",
        "remove_from_cart",
        "checkout_start",
        "order_created",
        "login",
        "logout",
        "session_start",
        "session_end",
    }
)


class ConsentIn(BaseModel):
    visitor_uuid: uuid.UUID
    analytics_consent: bool
    consent_version: str = Field(default="1", max_length=20)


class IdentifyIn(BaseModel):
    visitor_uuid: uuid.UUID


class SessionStartIn(BaseModel):
    visitor_uuid: uuid.UUID
    session_uuid: uuid.UUID
    page: str = Field(default="", max_length=500)
    referrer: str = Field(default="", max_length=500)
    language: str = Field(default="", max_length=10)

    @field_validator("page", "referrer", "language")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class HeartbeatIn(BaseModel):
    visitor_uuid: uuid.UUID
    session_uuid: uuid.UUID
    page: str = Field(default="", max_length=500)

    @field_validator("page")
    @classmethod
    def strip_page(cls, value: str) -> str:
        return (value or "").strip()


class EventIn(BaseModel):
    visitor_uuid: uuid.UUID
    session_uuid: uuid.UUID
    event_uuid: uuid.UUID
    event_type: EventType
    page_url: str = Field(default="", max_length=500)
    product_id: int | None = Field(default=None, ge=1)
    category_id: int | None = Field(default=None, ge=1)
    event_data: dict | None = None

    @field_validator("page_url")
    @classmethod
    def strip_page_url(cls, value: str) -> str:
        return (value or "").strip()


class SessionEndIn(BaseModel):
    visitor_uuid: uuid.UUID
    session_uuid: uuid.UUID
