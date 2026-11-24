from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OrderStatus = Literal["new", "confirmed", "delivering", "done", "cancelled"]


class OrderItemIn(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    variant_id: int | None = None
    color_id: int | None = None
    width_cm: int | None = Field(default=None, ge=20, le=400)
    height_cm: int | None = Field(default=None, ge=20, le=400)
    meters: float | None = Field(default=None, ge=0.1, le=100000)
    quantity: int = Field(default=1, ge=1, le=99)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=7, max_length=40)
    address: str = Field(default="", max_length=500)
    delivery_district: str = Field(default="", max_length=120)
    comment: str = Field(default="", max_length=1000)

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    telegram_id: int | None = None
    telegram_username: str | None = Field(default=None, max_length=100)

    # QR-атрибуция: токен из постоянного QR и случайный visitor_id Mini App.
    # backend принимает источник только если найдено недавнее событие miniapp_open.
    qr_label: str | None = Field(default=None, max_length=64)
    qr_visitor_id: str | None = Field(default=None, max_length=64)

    items: list[OrderItemIn] = Field(min_length=1, max_length=50)


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_slug: str
    name_ru: str
    name_uz: str
    name_uzc: str
    variant_label: str
    color_ru: str
    color_uz: str
    color_uzc: str
    color_hex: str
    width_cm: int | None = None
    height_cm: int | None = None
    meters: float | None = None
    pricing_type: str = "piece"
    image_url: str = ""
    unit_price: int
    quantity: int
    line_total: int


class OrderOut(BaseModel):
    id: int
    number: str
    status: str
    customer_name: str
    phone: str
    address: str
    delivery_district: str = ""
    comment: str
    latitude: float | None = None
    longitude: float | None = None
    total: int
    telegram_id: int | None = None
    telegram_username: str | None = None
    qr_label: str | None = None
    planned_delivery_at: datetime | None = None
    sewing_at: datetime | None = None
    created_at: datetime
    items: list[OrderItemOut] = []


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderCreated(BaseModel):
    id: int
    number: str
    status: str
    total: int


class OrderClaim(BaseModel):
    # Безопасная привязка старого заказа без telegram_id к подтверждённому аккаунту.
    number: str = Field(min_length=3, max_length=40)
    phone: str = Field(min_length=7, max_length=40)
