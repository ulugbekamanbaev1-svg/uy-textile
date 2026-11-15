from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PricingType = Literal["piece", "meter", "area"]

HEX_PATTERN = r"^#[0-9a-fA-F]{6}$"


class AdminVariantIn(BaseModel):
    id: int | None = None
    label: str = Field(min_length=1, max_length=80)
    width_cm: int | None = Field(default=None, ge=1, le=1000)
    height_cm: int | None = Field(default=None, ge=1, le=1000)
    price: int = Field(ge=0, le=1_000_000_000)
    is_active: bool = True


class AdminColorIn(BaseModel):
    id: int | None = None
    name_ru: str = Field(min_length=1, max_length=80)
    name_uz: str = Field(min_length=1, max_length=80)
    name_uzc: str = Field(min_length=1, max_length=80)
    hex: str = Field(default="#ffffff", pattern=HEX_PATTERN)


class AdminProductIn(BaseModel):
    slug: str | None = Field(default=None, max_length=80)
    category_id: int

    name_ru: str = Field(min_length=1, max_length=160)
    name_uz: str = Field(min_length=1, max_length=160)
    name_uzc: str = Field(min_length=1, max_length=160)

    description_ru: str = Field(default="", max_length=4000)
    description_uz: str = Field(default="", max_length=4000)
    description_uzc: str = Field(default="", max_length=4000)

    material_ru: str = Field(default="", max_length=120)
    material_uz: str = Field(default="", max_length=120)
    material_uzc: str = Field(default="", max_length=120)

    image_url: str = Field(default="", max_length=255)

    pricing_type: PricingType = "piece"
    price_per_m2: int | None = Field(default=None, ge=0, le=1_000_000_000)

    custom_size_allowed: bool = False
    is_active: bool = True
    is_featured: bool = False
    in_stock: bool = True

    variants: list[AdminVariantIn] = Field(default_factory=list, max_length=50)
    colors: list[AdminColorIn] = Field(default_factory=list, max_length=50)


class AdminVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    width_cm: int | None = None
    height_cm: int | None = None
    price: int
    is_active: bool
    sort_order: int


class AdminColorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_ru: str
    name_uz: str
    name_uzc: str
    hex: str
    sort_order: int


class AdminProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    category_id: int

    name_ru: str
    name_uz: str
    name_uzc: str

    description_ru: str
    description_uz: str
    description_uzc: str

    material_ru: str
    material_uz: str
    material_uzc: str

    image_url: str
    pricing_type: str
    price_per_m2: int | None = None

    custom_size_allowed: bool
    is_active: bool
    is_featured: bool
    in_stock: bool = True

    variants: list[AdminVariantOut] = []
    colors: list[AdminColorOut] = []


class UploadResult(BaseModel):
    url: str
    size: int


class ClientOut(BaseModel):
    name: str
    phone: str
    telegram_username: str | None = None
    address: str = ""
    orders_count: int
    total_spent: int
    last_order_at: datetime | None = None


class DailySalesOut(BaseModel):
    day: str
    revenue: int
    orders: int


class TopProductOut(BaseModel):
    name_ru: str
    name_uz: str
    name_uzc: str
    quantity: int
    revenue: int


class StatusCountOut(BaseModel):
    status: str
    count: int


class AnalyticsOut(BaseModel):
    days: int
    revenue: int
    orders: int
    average_order: int
    clients: int
    delivered: int
    cancelled: int
    daily: list[DailySalesOut] = []
    top_products: list[TopProductOut] = []
    statuses: list[StatusCountOut] = []


class StoreSettingsIn(BaseModel):
    store_name: str = Field(default="Uy Textile", max_length=120)
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=255)
    working_hours: str = Field(default="", max_length=120)
    delivery_info: str = Field(default="", max_length=2000)
    payment_info: str = Field(default="", max_length=2000)
    instagram: str = Field(default="", max_length=120)
    telegram: str = Field(default="", max_length=120)

    hero_title_ru: str = Field(default="", max_length=160)
    hero_title_uz: str = Field(default="", max_length=160)
    hero_title_uzc: str = Field(default="", max_length=160)
    hero_text_ru: str = Field(default="", max_length=2000)
    hero_text_uz: str = Field(default="", max_length=2000)
    hero_text_uzc: str = Field(default="", max_length=2000)


class StoreSettingsOut(StoreSettingsIn):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime | None = None


class ReorderBody(BaseModel):
    ordered_ids: list[int] = Field(default_factory=list)
