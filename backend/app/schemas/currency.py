from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CurrencyCode = Literal["USD", "EUR", "RUB"]
SourceType = Literal["bank"]
SortMode = Literal["name", "buy_desc", "sell_asc"]


class CurrencyBankOut(BaseModel):
    name: str
    slug: str
    logo_url: str | None = None
    buy: float | None = None
    sell: float | None = None
    source_type: str = "bank"
    updated_at: str | None = None


class CurrencyBestOut(BaseModel):
    bank: str | None = None
    slug: str | None = None
    rate: float | None = None


class CurrencyRatesOut(BaseModel):
    currency: str
    base: str = "UZS"
    source_type: str = "bank"
    provider: str
    source_name: str
    source_url: str
    attribution: str = ""
    updated_at: str | None = None
    fetched_at: str | None = None
    is_stale: bool = False
    stale_reason: str = ""
    best_buy: CurrencyBestOut | None = None
    best_sell: CurrencyBestOut | None = None
    banks: list[CurrencyBankOut] = []


class CurrencyBestResponse(BaseModel):
    currency: str
    base: str = "UZS"
    source_type: str = "bank"
    updated_at: str | None = None
    is_stale: bool = False
    best_buy: CurrencyBestOut | None = None
    best_sell: CurrencyBestOut | None = None


class CurrencySourceOut(BaseModel):
    provider: str
    name: str
    url: str
    attribution: str = ""
    supported_currencies: list[str] = []
    supported_source_types: list[str] = []
    updated_at: str | None = None
    fetched_at: str | None = None
    is_stale: bool = False
    stale_reason: str = ""


class CurrencySourcesOut(BaseModel):
    enabled: bool
    active_provider: str
    refresh_minutes: int
    last_success_at: str | None = None
    last_error: str = ""
    sources: list[CurrencySourceOut] = []


class CurrencyConvertOut(BaseModel):
    amount: float
    from_currency: str = Field(alias="from")
    to_currency: str = Field(alias="to")
    operation: str
    bank: str | None = None
    bank_slug: str | None = None
    rate: float | None = None
    result: float | None = None
    currency: str | None = None
    base: str = "UZS"
    source_type: str = "bank"
    updated_at: str | None = None
    is_stale: bool = False
    warning: str = ""

    model_config = {"populate_by_name": True}


class CurrencyAdminStatusOut(BaseModel):
    enabled: bool
    provider: str
    provider_name: str
    source_url: str
    attribution: str = ""
    supported_currencies: list[str]
    supported_source_types: list[str]
    refresh_minutes: int
    last_success_at: str | None = None
    last_error: str = ""
    last_error_at: str | None = None
    last_refresh_at: str | None = None
    cache_entries: int
    bank_counts: dict[str, int]
    stale_currencies: list[str]
    manual_refresh_seconds: int


class CurrencyAdminSettingsIn(BaseModel):
    enabled: bool
    refresh_minutes: int = Field(ge=5, le=1440)
