from pydantic import BaseModel, ConfigDict


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name_ru: str
    name_uz: str
    name_uzc: str
    sort_order: int
    product_count: int = 0


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    width_cm: int | None = None
    height_cm: int | None = None
    price: int
    sort_order: int = 0


class ColorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_ru: str
    name_uz: str
    name_uzc: str
    hex: str
    sort_order: int = 0


class ProductListItem(BaseModel):
    id: int
    slug: str
    category_slug: str
    category_name_ru: str
    category_name_uz: str
    category_name_uzc: str
    name_ru: str
    name_uz: str
    name_uzc: str
    image_url: str
    pricing_type: str
    min_price: int
    price_per_m2: int | None = None
    custom_size_allowed: bool
    is_featured: bool
    is_active: bool


class ProductDetail(ProductListItem):
    description_ru: str
    description_uz: str
    description_uzc: str
    material_ru: str
    material_uz: str
    material_uzc: str
    variants: list[VariantOut] = []
    colors: list[ColorOut] = []


class AdminSummary(BaseModel):
    products: int
    categories: int
    users: int
    orders_today: int = 0
    orders_new: int = 0
