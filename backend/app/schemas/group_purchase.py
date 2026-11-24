from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

GroupStatus = Literal["open","target_reached","payment_pending","paid","admin_confirmed","preparing","completed","expired","cancelled"]
ParticipantStatus = Literal["joined","payment_pending","paid","preparing","ready","shipped","delivered","cancelled"]
PaymentMode = Literal["individual","organizer"]


class GroupCreateIn(BaseModel):
    product_slug: str = Field(min_length=1, max_length=80)
    variant_id: int | None = None
    color_id: int | None = None
    meters: float = Field(gt=0, le=10000)
    payment_mode: PaymentMode = "individual"
    delivery_district: str = Field(default="", max_length=120)


class GroupJoinIn(BaseModel):
    token: str = Field(min_length=8, max_length=128)
    meters: float = Field(gt=0, le=10000)
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=500)
    delivery_district: str = Field(default="", max_length=120)
    comment: str = Field(default="", max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class GroupParticipantOut(BaseModel):
    id: int
    user_id: int
    display_name: str
    is_organizer: bool
    meters: float
    unit_price: int | None = None
    total_amount: int | None = None
    payment_status: str
    fulfillment_status: str
    order_id: int | None = None
    joined_at: datetime | None = None


class GroupOut(BaseModel):
    id: int
    public_code: str
    status: str
    payment_mode: str
    product_id: int
    product_slug: str
    product_name_ru: str
    product_name_uz: str
    product_name_uzc: str
    product_image: str = ""
    variant_id: int | None = None
    variant_label: str = ""
    color_id: int | None = None
    color_name_ru: str = ""
    color_name_uz: str = ""
    color_name_uzc: str = ""
    color_hex: str = ""
    minimum_meters: float
    target_meters: float
    confirmed_meters: float
    remaining_meters: float
    wholesale_price: int | None = None
    retail_price: int | None = None
    unit_price: int | None = None
    expires_at: datetime | None = None
    invite_token: str | None = None
    invite_url: str | None = None
    is_organizer: bool = False
    my_meters: float | None = None
    my_total: int | None = None
    my_payment_status: str | None = None
    my_fulfillment_status: str | None = None
    participants_count: int = 0
    participants: list[GroupParticipantOut] = []
    created_at: datetime | None = None


class GroupListOut(BaseModel):
    items: list[GroupOut]


class GroupAdminActionIn(BaseModel):
    reason: str = Field(default="", max_length=1000)
    expires_at: datetime | None = None
    status: str | None = None