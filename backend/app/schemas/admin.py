from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import ProductListItem

PricingType = Literal["piece", "meter", "area"]
ExpenseCategory = Literal["delivery", "packaging", "ads", "rent", "other"]

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


class AdminPriceTierIn(BaseModel):
    id: int | None = None
    min_quantity: float = Field(gt=0, le=1_000_000)
    max_quantity: float | None = Field(default=None, gt=0, le=1_000_000)
    price: int = Field(gt=0, le=1_000_000_000)


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
    images: list[str] = Field(default_factory=list, max_length=12)

    pricing_type: PricingType = "piece"
    price_per_m2: int | None = Field(default=None, ge=0, le=1_000_000_000)
    purchase_price: int = Field(default=0, ge=0, le=1_000_000_000)

    custom_size_allowed: bool = False
    is_active: bool = True
    is_featured: bool = False
    in_stock: bool = True

    variants: list[AdminVariantIn] = Field(default_factory=list, max_length=50)
    colors: list[AdminColorIn] = Field(default_factory=list, max_length=50)
    price_tiers: list[AdminPriceTierIn] = Field(
        default_factory=list, max_length=20
    )


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


class AdminImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    sort_order: int


class AdminPriceTierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    min_quantity: float
    max_quantity: float | None = None
    price: int
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
    images: list[AdminImageOut] = []
    pricing_type: str
    price_per_m2: int | None = None
    purchase_price: int = 0

    custom_size_allowed: bool
    is_active: bool
    is_featured: bool
    in_stock: bool = True

    variants: list[AdminVariantOut] = []
    colors: list[AdminColorOut] = []
    price_tiers: list[AdminPriceTierOut] = []


class AdminProductListOut(ProductListItem):
    purchase_price: int = 0


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


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: ExpenseCategory = "other"
    amount: int = Field(gt=0, le=1_000_000_000)
    comment: str = Field(default="", max_length=2000)
    order_id: int | None = None
    spent_at: datetime | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: str
    amount: int
    comment: str = ""
    order_id: int | None = None
    spent_at: datetime
    created_at: datetime


class ExpenseCategoryOut(BaseModel):
    category: str
    amount: int


class ProductProfitOut(BaseModel):
    product_id: int | None = None
    name_ru: str
    name_uz: str
    name_uzc: str
    quantity: float
    revenue: int
    unit_cost: int
    cost: int
    profit: int


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
    cost: int = 0
    gross_profit: int = 0
    expenses: int = 0
    net_profit: int = 0
    daily: list[DailySalesOut] = []
    top_products: list[TopProductOut] = []
    product_profits: list[ProductProfitOut] = []
    expense_categories: list[ExpenseCategoryOut] = []
    expense_history: list[ExpenseOut] = []
    statuses: list[StatusCountOut] = []


class StoreSettingsIn(BaseModel):
    store_name: str = Field(default="Farrux shop (Hozoosp)", max_length=120)
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

    banner_active: bool = False
    banner_text_ru: str = Field(default="", max_length=200)
    banner_text_uz: str = Field(default="", max_length=200)
    banner_text_uzc: str = Field(default="", max_length=200)
    banner_category: str = Field(default="", max_length=80)

    logo_url: str = Field(default="", max_length=255)
    store_latitude: float | None = None
    store_longitude: float | None = None

    cart_reminders_enabled: bool = True
    cart_reminder_day_enabled: bool = True
    cart_reminder_evening_enabled: bool = True


class StoreSettingsOut(StoreSettingsIn):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime | None = None


class ReorderBody(BaseModel):
    ordered_ids: list[int] = Field(default_factory=list)


class BroadcastIn(BaseModel):
    title: str = Field(default="", max_length=160)
    message: str = Field(min_length=1, max_length=4096)
    media_type: Literal["none", "photo", "video"] = "none"
    media_url: str = Field(default="", max_length=500)
    buy_text: str = Field(default="", max_length=80)
    buy_url: str = Field(default="", max_length=500)
    details_text: str = Field(default="", max_length=80)
    details_url: str = Field(default="", max_length=500)


class BroadcastOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str = ""
    message: str
    media_type: str
    media_url: str = ""
    buy_text: str = ""
    buy_url: str = ""
    details_text: str = ""
    details_url: str = ""
    status: str
    total_recipients: int = 0
    sent_count: int = 0
    failed_count: int = 0
    error_log: str = ""
    created_at: datetime
    completed_at: datetime | None = None
