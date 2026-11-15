from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Category, Product, ProductVariant
from app.schemas.catalog import (
    CategoryOut,
    ColorOut,
    ProductDetail,
    ProductListItem,
    VariantOut,
)

router = APIRouter(prefix="/api/catalog", tags=["Catalog"])


def to_list_item(product: Product) -> ProductListItem:
    active_variants = [v for v in product.variants if v.is_active]

    if product.pricing_type == "area":
        min_price = product.price_per_m2 or 0
    elif active_variants:
        min_price = min(v.price for v in active_variants)
    else:
        min_price = 0

    category = product.category

    return ProductListItem(
        id=product.id,
        slug=product.slug,
        category_slug=category.slug,
        category_name_ru=category.name_ru,
        category_name_uz=category.name_uz,
        category_name_uzc=category.name_uzc,
        name_ru=product.name_ru,
        name_uz=product.name_uz,
        name_uzc=product.name_uzc,
        image_url=product.image_url,
        pricing_type=product.pricing_type,
        min_price=min_price,
        price_per_m2=product.price_per_m2,
        custom_size_allowed=product.custom_size_allowed,
        is_featured=product.is_featured,
        is_active=product.is_active,
        in_stock=product.in_stock,
        sort_order=product.sort_order,
    )


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category)
        .options(selectinload(Category.products))
        .order_by(Category.sort_order, Category.id)
    )

    return [
        CategoryOut(
            id=category.id,
            slug=category.slug,
            name_ru=category.name_ru,
            name_uz=category.name_uz,
            name_uzc=category.name_uzc,
            sort_order=category.sort_order,
            product_count=sum(1 for p in category.products if p.is_active),
        )
        for category in result.scalars().all()
    ]


@router.get("/products", response_model=list[ProductListItem])
async def list_products(
    category: str | None = None,
    search: str | None = None,
    featured: bool = False,
    sort: str = Query(default="default"),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.category),
        )
        .where(Product.is_active.is_(True))
    )

    if category:
        stmt = stmt.where(Product.category.has(Category.slug == category))

    if featured:
        stmt = stmt.where(Product.is_featured.is_(True))

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name_ru.ilike(pattern),
                Product.name_uz.ilike(pattern),
                Product.name_uzc.ilike(pattern),
            )
        )

    if sort in ("price_asc", "price_desc"):
        price_expr = func.coalesce(
            select(func.min(ProductVariant.price))
            .where(
                ProductVariant.product_id == Product.id,
                ProductVariant.is_active.is_(True),
            )
            .correlate(Product)
            .scalar_subquery(),
            Product.price_per_m2,
            0,
        )
        stmt = stmt.order_by(
            price_expr.asc() if sort == "price_asc" else price_expr.desc(),
            Product.id,
        )
    elif sort == "newest":
        stmt = stmt.order_by(Product.id.desc())
    else:
        stmt = stmt.order_by(
            Product.is_featured.desc(), Product.sort_order, Product.id
        )

    result = await db.execute(stmt)
    return [to_list_item(product) for product in result.scalars().all()]


@router.get("/products/{slug}", response_model=ProductDetail)
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.colors),
            selectinload(Product.category),
        )
        .where(Product.slug == slug, Product.is_active.is_(True))
    )
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    base = to_list_item(product)

    return ProductDetail(
        **base.model_dump(),
        description_ru=product.description_ru,
        description_uz=product.description_uz,
        description_uzc=product.description_uzc,
        material_ru=product.material_ru,
        material_uz=product.material_uz,
        material_uzc=product.material_uzc,
        variants=[
            VariantOut.model_validate(variant)
            for variant in product.variants
            if variant.is_active
        ],
        colors=[ColorOut.model_validate(color) for color in product.colors],
    )
