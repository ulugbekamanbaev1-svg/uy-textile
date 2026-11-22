from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    name_ru: Mapped[str] = mapped_column(String(120), nullable=False)
    name_uz: Mapped[str] = mapped_column(String(120), nullable=False)
    name_uzc: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(
        String(80), unique=True, index=True, nullable=False
    )

    name_ru: Mapped[str] = mapped_column(String(160), nullable=False)
    name_uz: Mapped[str] = mapped_column(String(160), nullable=False)
    name_uzc: Mapped[str] = mapped_column(String(160), nullable=False)

    description_ru: Mapped[str] = mapped_column(Text, default="")
    description_uz: Mapped[str] = mapped_column(Text, default="")
    description_uzc: Mapped[str] = mapped_column(Text, default="")

    material_ru: Mapped[str] = mapped_column(String(120), default="")
    material_uz: Mapped[str] = mapped_column(String(120), default="")
    material_uzc: Mapped[str] = mapped_column(String(120), default="")

    image_url: Mapped[str] = mapped_column(String(255), default="")

    # piece — цена за штуку, meter — за метр, area — за м²
    pricing_type: Mapped[str] = mapped_column(String(20), default="piece")
    price_per_m2: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Закупочная цена за единицу (штука / метр / м²) — для расчёта прибыли.
    purchase_price: Mapped[int] = mapped_column(Integer, default=0)

    custom_size_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    category: Mapped["Category"] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.sort_order",
    )
    colors: Mapped[list["ProductColor"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductColor.sort_order",
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
    )
    price_tiers: Mapped[list["ProductPriceTier"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductPriceTier.min_quantity",
    )


class ProductImage(Base):
    """Дополнительные фото товара (галерея)."""

    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="images")


class ProductPriceTier(Base):
    """Оптовая цена: действует от количества min_quantity в единицах товара."""

    __tablename__ = "product_price_tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    min_quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    max_quantity: Mapped[float | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="price_tiers")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    width_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="variants")


class ProductColor(Base):
    __tablename__ = "product_colors"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    name_ru: Mapped[str] = mapped_column(String(80), nullable=False)
    name_uz: Mapped[str] = mapped_column(String(80), nullable=False)
    name_uzc: Mapped[str] = mapped_column(String(80), nullable=False)
    hex: Mapped[str] = mapped_column(String(7), default="#ffffff")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship(back_populates="colors")
