import csv
import io
import os
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import uuid4

try:
    import boto3
    from botocore.config import Config as BotoConfig
except Exception:  # optional in local/dev
    boto3 = None
    BotoConfig = None

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool # ДОБАВЛЕНО для асинхронности
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import (
    Broadcast,
    Category,
    Expense,
    Order,
    Product,
    ProductColor,
    ProductImage,
    ProductPriceTier,
    ProductVariant,
    User,
)
from app.models.expense import EXPENSE_CATEGORIES
from app.models.order import ORDER_STATUSES
from app.routers.catalog import to_list_item
from app.routers.orders import order_to_out
from app.schemas.admin import (
    AdminProductIn,
    AdminProductListOut,
    AdminProductOut,
    AnalyticsOut,
    BroadcastIn,
    BroadcastOut,
    ClientOut,
    DailySalesOut,
    ExpenseCategoryOut,
    ExpenseIn,
    ExpenseOut,
    ProductProfitOut,
    ReorderBody,
    StatusCountOut,
    StoreSettingsIn,
    StoreSettingsOut,
    TopProductOut,
    UploadResult,
)
from app.schemas.catalog import AdminSummary, CategoryIn, CategoryOut
from app.schemas.order import OrderOut, OrderStatusUpdate
from app.services.broadcasts import run_broadcast
from app.services.notify import notify_customer_about_status
from app.services.qr import qr_token
from app.services.qr_events import log_qr_event
from app.services.referral import maybe_award_referral_for_completed_order
from app.services.store_settings import get_store_settings
from app.services.telegram_auth import require_admin
from app.services.vip import recalc_vip_for_telegram_id

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
UPLOAD_DIR = STATIC_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
MAX_IMAGE_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024

# --- НАСТРОЙКА CLOUDFLARE R2 ---
R2_BUCKET = os.environ.get("R2_BUCKET_NAME", "uy-textile-photos")
R2_PUBLIC = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")

r2_client = None
if boto3 and BotoConfig and R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY:
    r2_client = boto3.client(
        service_name="s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=BotoConfig(signature_version="s3v4"),
    )
# -------------------------------


async def remove_uploaded_file(url: str) -> None:
    """Удаляет файлы из Cloudflare R2 или из локальной папки (для старых фото)."""
    if not url:
        return

    # Если это ссылка из нашего облака R2
    if R2_PUBLIC and url.startswith(R2_PUBLIC):
        if r2_client is None:
            return
        object_name = url.replace(f"{R2_PUBLIC}/", "")
        try:
            # Выполняем синхронный boto3 в отдельном потоке, чтобы не вешать сервер
            await run_in_threadpool(
                r2_client.delete_object, 
                Bucket=R2_BUCKET, 
                Key=object_name
            )
        except Exception as e:
            print(f"Ошибка при удалении из R2: {e}")
            
    # Если это старое локальное фото
    elif url.startswith("/static/uploads/"):
        path = UPLOAD_DIR / Path(url).name
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/summary", response_model=AdminSummary)
async def summary(db: AsyncSession = Depends(get_db)):
    products = await db.scalar(select(func.count()).select_from(Product))
    categories = await db.scalar(select(func.count()).select_from(Category))
    users = await db.scalar(select(func.count()).select_from(User))

    # «Сегодня» считаем по местному времени, а не по UTC базы.
    day_start = datetime.combine(date.today(), time.min).astimezone()
    day_end = day_start + timedelta(days=1)

    orders_today = await db.scalar(
        select(func.count())
        .select_from(Order)
        .where(
            Order.created_at >= day_start,
            Order.created_at < day_end,
        )
    )
    orders_new = await db.scalar(
        select(func.count()).select_from(Order).where(Order.status == "new")
    )

    return AdminSummary(
        products=products or 0,
        categories=categories or 0,
        users=users or 0, # Это значение показывается в карточке "Покупатели" (или "Пользователи")
        orders_today=orders_today or 0,
        orders_new=orders_new or 0,
    )


@router.get("/categories", response_model=list[CategoryOut])
async def admin_categories(db: AsyncSession = Depends(get_db)):
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


async def get_category_or_404(
    category_id: int,
    db: AsyncSession,
) -> Category:
    result = await db.execute(
        select(Category).where(Category.id == category_id)
    )
    category = result.scalar_one_or_none()

    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    return category


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    payload: CategoryIn,
    db: AsyncSession = Depends(get_db),
):
    slug = payload.slug.strip().lower()

    if not SLUG_PATTERN.match(slug):
        raise HTTPException(
            status_code=422,
            detail="Ссылка: только латиница, цифры и дефис",
        )

    if await db.scalar(select(Category.id).where(Category.slug == slug)) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Категория со ссылкой «{slug}» уже существует",
        )

    category = Category(
        slug=slug,
        name_ru=payload.name_ru.strip(),
        name_uz=payload.name_uz.strip(),
        name_uzc=payload.name_uzc.strip(),
        sort_order=payload.sort_order,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)

    product_count = await db.scalar(
        select(func.count())
        .select_from(Product)
        .where(Product.category_id == category.id, Product.is_active.is_(True))
    )

    return CategoryOut(
        id=category.id,
        slug=category.slug,
        name_ru=category.name_ru,
        name_uz=category.name_uz,
        name_uzc=category.name_uzc,
        sort_order=category.sort_order,
        product_count=product_count or 0,
    )


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    payload: CategoryIn,
    db: AsyncSession = Depends(get_db),
):
    category = await get_category_or_404(category_id, db)

    slug = payload.slug.strip().lower()

    if not SLUG_PATTERN.match(slug):
        raise HTTPException(
            status_code=422,
            detail="Ссылка: только латиница, цифры и дефис",
        )

    if await db.scalar(
        select(Category.id).where(
            Category.slug == slug,
            Category.id != category_id,
        )
    ) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Категория со ссылкой «{slug}» уже существует",
        )

    category.slug = slug
    category.name_ru = payload.name_ru.strip()
    category.name_uz = payload.name_uz.strip()
    category.name_uzc = payload.name_uzc.strip()
    category.sort_order = payload.sort_order

    await db.commit()
    await db.refresh(category)

    result = await db.execute(
        select(Category)
        .options(selectinload(Category.products))
        .where(Category.id == category_id)
    )
    category = result.scalar_one()

    product_count = await db.scalar(
        select(func.count())
        .select_from(Product)
        .where(Product.category_id == category.id, Product.is_active.is_(True))
    )

    return CategoryOut(
        id=category.id,
        slug=category.slug,
        name_ru=category.name_ru,
        name_uz=category.name_uz,
        name_uzc=category.name_uzc,
        sort_order=category.sort_order,
        product_count=product_count or 0,
    )


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
):
    category = await get_category_or_404(category_id, db)

    await db.delete(category)
    await db.commit()


@router.post("/categories/order", response_model=list[CategoryOut])
async def reorder_categories(
    payload: ReorderBody,
    db: AsyncSession = Depends(get_db),
):
    """Переупорядочивает категории: порядок = порядок в списке `ordered_ids`."""
    ordered_ids = payload.ordered_ids
    result = await db.execute(
        select(Category).where(Category.id.in_(ordered_ids))
    )
    categories = {category.id: category for category in result.scalars().all()}

    if len(categories) != len(ordered_ids):
        raise HTTPException(status_code=404, detail="Категория не найдена")

    for index, category_id in enumerate(ordered_ids, start=1):
        categories[category_id].sort_order = index

    await db.commit()

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


def to_admin_list_item(product: Product) -> AdminProductListOut:
    base = to_list_item(product)

    return AdminProductListOut(
        **base.model_dump(),
        purchase_price=product.purchase_price or 0,
    )


@router.get("/products", response_model=list[AdminProductListOut])
async def admin_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.category),
            selectinload(Product.price_tiers),
        )
        .order_by(Product.sort_order, Product.id)
    )

    return [
        to_admin_list_item(product) for product in result.scalars().all()
    ]


async def get_product_or_404(
    product_id: int,
    db: AsyncSession,
) -> Product:
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.colors),
            selectinload(Product.images),
            selectinload(Product.price_tiers),
        )
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(status_code=404, detail="Товар не найден")

    return product


@router.post("/products/order", response_model=dict)
async def reorder_products(
    payload: ReorderBody,
    db: AsyncSession = Depends(get_db),
):
    """Переупорядочивает товары: порядок = порядок в списке `ordered_ids`."""
    ordered_ids = payload.ordered_ids
    result = await db.execute(
        select(Product).where(Product.id.in_(ordered_ids))
    )
    products = {product.id: product for product in result.scalars().all()}

    if len(products) != len(ordered_ids):
        raise HTTPException(status_code=404, detail="Товар не найден")

    for index, product_id in enumerate(ordered_ids, start=1):
        products[product_id].sort_order = index

    await db.commit()

    return {"ordered_ids": ordered_ids}


@router.get("/products/{product_id}", response_model=AdminProductOut)
async def admin_product(product_id: int, db: AsyncSession = Depends(get_db)):
    return await get_product_or_404(product_id, db)


async def ensure_unique_slug(
    slug: str,
    db: AsyncSession,
    product_id: int | None = None,
) -> None:
    stmt = select(Product.id).where(Product.slug == slug)

    if product_id is not None:
        stmt = stmt.where(Product.id != product_id)

    if await db.scalar(stmt) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Товар со ссылкой «{slug}» уже существует",
        )


def apply_payload(product: Product, payload: AdminProductIn) -> None:
    product.category_id = payload.category_id

    product.name_ru = payload.name_ru.strip()
    product.name_uz = payload.name_uz.strip()
    product.name_uzc = payload.name_uzc.strip()

    product.description_ru = payload.description_ru.strip()
    product.description_uz = payload.description_uz.strip()
    product.description_uzc = payload.description_uzc.strip()

    product.material_ru = payload.material_ru.strip()
    product.material_uz = payload.material_uz.strip()
    product.material_uzc = payload.material_uzc.strip()

    product.pricing_type = payload.pricing_type
    product.price_per_m2 = (
        payload.price_per_m2 if payload.pricing_type == "area" else None
    )
    product.purchase_price = payload.purchase_price

    product.custom_size_allowed = payload.custom_size_allowed
    product.is_active = payload.is_active
    product.is_featured = payload.is_featured
    product.in_stock = payload.in_stock

    image_url = payload.image_url.strip()

    def check_image(url: str) -> str:
        if len(url) > 255:
            raise HTTPException(
                status_code=422,
                detail="Ссылка на изображение слишком длинная",
            )

        if not (
            url.startswith("/static/")
            or url.startswith("http://")
            or url.startswith("https://")
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Ссылка на изображение должна начинаться "
                    "с /static/ или http(s)://"
                ),
            )

        return url

    ordered_images: list[ProductImage] = []
    seen_images: set[str] = set()

    for raw_url in payload.images:
        url = raw_url.strip()

        if not url or url in seen_images:
            continue

        seen_images.add(check_image(url))
        ordered_images.append(ProductImage(url=url, sort_order=len(ordered_images)))

    # Совместимость со старыми товарами: одно фото в image_url.
    if not ordered_images and image_url:
        check_image(image_url)
        ordered_images.append(ProductImage(url=image_url, sort_order=0))

    product.images = ordered_images
    product.image_url = ordered_images[0].url if ordered_images else ""

    # --- размеры ---
    existing_variants = {
        variant.id: variant for variant in product.variants
    }
    ordered_variants: list[ProductVariant] = []

    for index, item in enumerate(payload.variants):
        if item.id is not None:
            variant = existing_variants.get(item.id)

            if variant is None:
                raise HTTPException(
                    status_code=422,
                    detail="Размер не найден в этом товаре",
                )
        else:
            variant = ProductVariant()

        variant.label = item.label.strip()
        variant.width_cm = item.width_cm
        variant.height_cm = item.height_cm
        variant.price = item.price
        variant.is_active = item.is_active
        variant.sort_order = index

        ordered_variants.append(variant)

    product.variants = ordered_variants

    # --- цвета ---
    existing_colors = {color.id: color for color in product.colors}
    ordered_colors: list[ProductColor] = []

    for index, item in enumerate(payload.colors):
        if item.id is not None:
            color = existing_colors.get(item.id)

            if color is None:
                raise HTTPException(
                    status_code=422,
                    detail="Цвет не найден в этом товаре",
                )
        else:
            color = ProductColor()

        color.name_ru = item.name_ru.strip()
        color.name_uz = item.name_uz.strip()
        color.name_uzc = item.name_uzc.strip()
        color.hex = item.hex.lower()
        color.sort_order = index

        ordered_colors.append(color)

    product.colors = ordered_colors

    # --- оптовые цены ---
    ordered_tiers: list[ProductPriceTier] = []

    for index, item in enumerate(
        sorted(payload.price_tiers, key=lambda tier: tier.min_quantity)
    ):
        if (
            item.max_quantity is not None
            and item.max_quantity < item.min_quantity
        ):
            raise HTTPException(
                status_code=422,
                detail="Максимум оптового количества меньше минимума",
            )

        ordered_tiers.append(
            ProductPriceTier(
                min_quantity=item.min_quantity,
                max_quantity=item.max_quantity,
                price=item.price,
                sort_order=index,
            )
        )

    product.price_tiers = ordered_tiers


def validate_pricing(payload: AdminProductIn) -> None:
    if payload.pricing_type == "area":
        if not payload.price_per_m2 or payload.price_per_m2 <= 0:
            raise HTTPException(
                status_code=422,
                detail="Укажите цену за м² для индивидуального размера",
            )

        return

    active = [variant for variant in payload.variants if variant.is_active]

    if not active:
        raise HTTPException(
            status_code=422,
            detail="Добавьте хотя бы один размер",
        )

    if any(variant.price <= 0 for variant in active):
        raise HTTPException(
            status_code=422,
            detail="Цена размера должна быть больше нуля",
        )


@router.post("/products", response_model=AdminProductOut, status_code=201)
async def create_product(
    payload: AdminProductIn,
    db: AsyncSession = Depends(get_db),
):
    category = await db.get(Category, payload.category_id)

    if category is None:
        raise HTTPException(status_code=422, detail="Категория не найдена")

    validate_pricing(payload)

    slug = (payload.slug or "").strip().lower()

    if slug:
        if not SLUG_PATTERN.match(slug):
            raise HTTPException(
                status_code=422,
                detail="Ссылка: только латиница, цифры и дефис",
            )

        await ensure_unique_slug(slug, db)
    else:
        slug = f"product-{uuid4().hex[:8]}"

    product = Product(slug=slug)
    apply_payload(product, payload)

    db.add(product)
    await db.commit()

    return await get_product_or_404(product.id, db)


@router.patch("/products/{product_id}", response_model=AdminProductOut)
async def update_product(
    product_id: int,
    payload: AdminProductIn,
    db: AsyncSession = Depends(get_db),
):
    product = await get_product_or_404(product_id, db)

    category = await db.get(Category, payload.category_id)

    if category is None:
        raise HTTPException(status_code=422, detail="Категория не найдена")

    validate_pricing(payload)

    slug = (payload.slug or "").strip().lower()

    if slug and slug != product.slug:
        if not SLUG_PATTERN.match(slug):
            raise HTTPException(
                status_code=422,
                detail="Ссылка: только латиница, цифры и дефис",
            )

        await ensure_unique_slug(slug, db, product.id)
        product.slug = slug

    apply_payload(product, payload)

    await db.commit()

    return await get_product_or_404(product.id, db)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
):
    product = await get_product_or_404(product_id, db)

    for image_url in {product.image_url, *(image.url for image in product.images)}:
        await remove_uploaded_file(image_url) # ДОБАВЛЕНО await

    await db.delete(product)
    await db.commit()


@router.post("/uploads", response_model=UploadResult)
async def upload_image(file: UploadFile = File(...)):
    content = await file.read()

    if not content:
        raise HTTPException(status_code=422, detail="Файл пустой")

    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Файл больше {settings.MAX_UPLOAD_MB} МБ",
        )

    extension = None

    if content.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif content.startswith((b"GIF87a", b"GIF89a")):
        extension = ".gif"
    elif content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        extension = ".webp"

    if extension is None:
        raise HTTPException(
            status_code=422,
            detail="Поддерживаются JPG, PNG, WEBP и GIF",
        )

    filename = f"{uuid4().hex}{extension}"

    # --- ЗАГРУЗКА В CLOUDFLARE R2 ---
    if r2_client and R2_PUBLIC:
        object_name = f"products/{filename}"
        try:
            # Выполняем синхронный boto3 в отдельном потоке, чтобы не вешать сервер
            await run_in_threadpool(
                r2_client.put_object,
                Bucket=R2_BUCKET,
                Key=object_name,
                Body=content,
                ContentType=file.content_type or "application/octet-stream",
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Ошибка при загрузке в облако: {str(e)}"
            )

        return UploadResult(
            url=f"{R2_PUBLIC}/{object_name}",
            size=len(content),
        )

    # Локальное сохранение (dev/без R2)
    (UPLOAD_DIR / filename).write_bytes(content)

    return UploadResult(
        url=f"/static/uploads/{filename}",
        size=len(content),
    )


@router.get("/orders", response_model=list[OrderOut])
async def admin_orders(
    status: str | None = None,
    q: str | None = Query(default=None, max_length=80),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(200)
    )

    if status:
        stmt = stmt.where(Order.status == status)

    if q and q.strip():
        term = q.strip()
        digits = re.sub(r"\D", "", term)
        conditions = [
            Order.customer_name.ilike(f"%{term}%"),
            Order.phone.ilike(f"%{term}%"),
            Order.address.ilike(f"%{term}%"),
        ]
        match = re.search(r"(\d+)$", term)
        if match:
            try:
                conditions.append(Order.id == int(match.group(1)))
            except ValueError:
                pass
        if len(digits) >= 4:
            conditions.append(
                func.regexp_replace(Order.phone, r"\D", "", "g").like(f"%{digits}%")
            )
        stmt = stmt.where(or_(*conditions))

    result = await db.execute(stmt)

    return [order_to_out(order) for order in result.scalars().all()]


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    previous_status = order.status
    order.status = payload.status

    referral_rewarded = False
    if previous_status != order.status and order.status == "done":
        try:
            reward = await maybe_award_referral_for_completed_order(db, order)
            referral_rewarded = reward is not None
        except Exception:
            # Do not block status update because of referral side effects.
            pass

    vip_changed = None
    if previous_status != order.status and (previous_status == "done" or order.status == "done"):
        try:
            vip_changed = await recalc_vip_for_telegram_id(db, order.telegram_id)
        except Exception:
            vip_changed = None

    await db.commit()
    await db.refresh(order, ["items"])

    if previous_status != order.status and order.telegram_id:
        background_tasks.add_task(notify_customer_about_status, order)

    if (
        previous_status != "done"
        and order.status == "done"
        and order.qr_label
    ):
        try:
            await log_qr_event(
                db,
                "order_completed",
                order.qr_label,
                order_id=order.id,
                meta="status",
            )
        except Exception:
            await db.rollback()

    # Referral/VIP notifications are handled in services; admin gets updated order.
    return order_to_out(order)


@router.get("/orders/export")
async def export_orders(
    format: str = Query(default="csv", pattern="^(csv|xlsx|pdf)$"),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт заказов: CSV (по умолчанию), Excel или PDF."""
    from app.services.reports import (
        export_orders_pdf,
        export_orders_xlsx,
    )

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(2000)
    )
    orders = result.scalars().all()

    if format == "xlsx":
        content = export_orders_xlsx(orders)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    elif format == "pdf":
        content = export_orders_pdf(orders)
        media_type = "application/pdf"
        ext = "pdf"
    else:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "id",
                "number",
                "status",
                "customer_name",
                "phone",
                "address",
                "comment",
                "total",
                "created_at",
                "latitude",
                "longitude",
                "qr_label",
            ]
        )

        for order in orders:
            writer.writerow(
                [
                    order.id,
                    order.number,
                    order.status,
                    order.customer_name,
                    order.phone,
                    order.address,
                    order.comment,
                    order.total,
                    order.created_at.isoformat() if order.created_at else "",
                    order.latitude if order.latitude is not None else "",
                    order.longitude if order.longitude is not None else "",
                    order.qr_label or "",
                ]
            )

        content = buffer.getvalue().encode("utf-8")
        media_type = "text/csv; charset=utf-8"
        ext = "csv"

    filename = f"farrux-orders-{date.today().isoformat()}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/clients/export")
async def export_clients(db: AsyncSession = Depends(get_db)):
    """Экспорт клиентов в CSV (агрегация по заказам)."""
    result = await db.execute(
        select(Order).order_by(Order.created_at.desc(), Order.id.desc())
    )
    orders = result.scalars().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "name",
            "phone",
            "telegram_username",
            "address",
            "orders_count",
            "total_spent",
            "last_order_at",
        ]
    )

    for client in collect_clients(orders):
        writer.writerow(
            [
                client["name"],
                client["phone"],
                client["telegram_username"] or "",
                client["address"],
                client["orders_count"],
                client["total_spent"],
                client["last_order_at"].isoformat() if client["last_order_at"] else "",
            ]
        )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clients.csv"'},
    )


@router.get("/clients", response_model=list[ClientOut])
async def admin_clients(db: AsyncSession = Depends(get_db)):
    """Клиенты собираются из заказов: телефон — основной ключ."""
    result = await db.execute(
        select(Order).order_by(Order.created_at.desc(), Order.id.desc())
    )
    orders = result.scalars().all()

    return [ClientOut(**client) for client in collect_clients(orders)]


def collect_clients(orders: list[Order]) -> list[dict]:
    clients: dict[str, dict] = {}

    for order in orders:
        phone = (order.phone or "").strip()

        if phone:
            key = phone
        elif order.telegram_id:
            key = f"tg-{order.telegram_id}"
        else:
            key = f"order-{order.id}"

        client = clients.get(key)

        if client is None:
            client = {
                "name": order.customer_name,
                "phone": order.phone,
                "telegram_username": order.telegram_username,
                "address": order.address,
                "orders_count": 0,
                "total_spent": 0,
                "last_order_at": order.created_at,
            }
            clients[key] = client

        if not client["address"] and order.address:
            client["address"] = order.address

        if not client["telegram_username"] and order.telegram_username:
            client["telegram_username"] = order.telegram_username

        client["orders_count"] += 1

        if order.status != "cancelled":
            client["total_spent"] += order.total

    return list(clients.values())


def sold_units(item) -> float:
    """Сколько единиц товара продано: штук, метров или м²."""
    if item.pricing_type == "meter":
        return float(item.meters) if item.meters else float(item.quantity)

    if item.pricing_type == "area" and item.width_cm and item.height_cm:
        area = (item.width_cm * item.height_cm) / 10000
        return area * float(item.quantity)

    return float(item.quantity)


@router.get("/expenses", response_model=list[ExpenseOut])
async def admin_expenses(
    days: int | None = Query(default=None, ge=1, le=3650),
    db: AsyncSession = Depends(get_db),
):
    """История расходов магазина (доставка, упаковка, реклама и т.д.)."""
    stmt = select(Expense)

    if days:
        start = datetime.combine(date.today(), time.min).astimezone() - timedelta(
            days=days - 1
        )
        stmt = stmt.where(Expense.spent_at >= start)

    stmt = stmt.order_by(Expense.spent_at.desc(), Expense.id.desc()).limit(300)
    result = await db.execute(stmt)

    return list(result.scalars().all())


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
async def create_expense(
    payload: ExpenseIn,
    db: AsyncSession = Depends(get_db),
):
    if payload.order_id is not None and await db.get(Order, payload.order_id) is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    spent_at = payload.spent_at or datetime.now().astimezone()

    if spent_at.tzinfo is None:
        spent_at = spent_at.astimezone()

    expense = Expense(
        title=payload.title.strip(),
        category=payload.category,
        amount=payload.amount,
        comment=payload.comment.strip(),
        order_id=payload.order_id,
        spent_at=spent_at,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    return expense


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
):
    expense = await db.get(Expense, expense_id)

    if expense is None:
        raise HTTPException(status_code=404, detail="Расход не найден")

    await db.delete(expense)
    await db.commit()


async def compute_analytics(days: int, db: AsyncSession) -> AnalyticsOut:
    start = datetime.combine(date.today(), time.min).astimezone() - timedelta(
        days=days - 1
    )

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.created_at >= start)
        .order_by(Order.created_at)
    )

    orders = result.scalars().all()

    # Закупочные цены нужны для расчёта себестоимости проданных товаров.
    product_ids = {
        item.product_id
        for order in orders
        for item in order.items
        if item.product_id
    }
    purchase_prices: dict[int, int] = {}

    if product_ids:
        price_rows = await db.execute(
            select(Product.id, Product.purchase_price).where(
                Product.id.in_(product_ids)
            )
        )
        purchase_prices = {
            product_id: purchase_price or 0
            for product_id, purchase_price in price_rows.all()
        }

    expense_result = await db.execute(
        select(Expense)
        .where(Expense.spent_at >= start)
        .order_by(Expense.spent_at.desc(), Expense.id.desc())
        .limit(300)
    )
    expenses = list(expense_result.scalars().all())

    daily = {
        (start + timedelta(days=index)).date().isoformat(): [0, 0]
        for index in range(days)
    }
    statuses = {status: 0 for status in ORDER_STATUSES}
    clients: set[str] = set()
    top: dict[str, dict] = {}
    profits: dict[str, dict] = {}

    revenue = 0
    cost_total = 0
    paid_orders = 0
    delivered = 0
    cancelled = 0

    for order in orders:
        statuses[order.status] = statuses.get(order.status, 0) + 1

        if order.status == "cancelled":
            cancelled += 1
            continue

        revenue += order.total
        paid_orders += 1

        if order.status == "done":
            delivered += 1

        if order.phone:
            clients.add(order.phone.strip())

        day_key = order.created_at.astimezone().date().isoformat()

        if day_key in daily:
            daily[day_key][0] += order.total
            daily[day_key][1] += 1

        for item in order.items:
            key = item.product_slug or f"{item.name_ru}-{item.id}"
            product = top.get(key)

            if product is None:
                product = {
                    "name_ru": item.name_ru,
                    "name_uz": item.name_uz,
                    "name_uzc": item.name_uzc,
                    "quantity": 0,
                    "revenue": 0,
                }
                top[key] = product

            product["quantity"] += item.quantity
            product["revenue"] += item.line_total

            unit_cost = purchase_prices.get(item.product_id or 0, 0)
            units = sold_units(item)
            item_cost = round(unit_cost * units)
            cost_total += item_cost

            entry = profits.get(key)

            if entry is None:
                entry = {
                    "product_id": item.product_id,
                    "name_ru": item.name_ru,
                    "name_uz": item.name_uz,
                    "name_uzc": item.name_uzc,
                    "quantity": 0.0,
                    "revenue": 0,
                    "unit_cost": unit_cost,
                    "cost": 0,
                    "profit": 0,
                }
                profits[key] = entry

            entry["quantity"] += units
            entry["revenue"] += item.line_total
            entry["cost"] += item_cost
            entry["profit"] += item.line_total - item_cost

    top_products = sorted(
        top.values(), key=lambda entry: entry["revenue"], reverse=True
    )[:5]

    product_profits = sorted(
        profits.values(), key=lambda entry: entry["profit"], reverse=True
    )

    expense_totals = {category: 0 for category in EXPENSE_CATEGORIES}

    for expense in expenses:
        expense_totals[expense.category] = (
            expense_totals.get(expense.category, 0) + expense.amount
        )

    expenses_total = sum(expense.amount for expense in expenses)
    gross_profit = revenue - cost_total

    return AnalyticsOut(
        days=days,
        revenue=revenue,
        orders=paid_orders,
        average_order=round(revenue / paid_orders) if paid_orders else 0,
        clients=len(clients),
        delivered=delivered,
        cancelled=cancelled,
        cost=cost_total,
        gross_profit=gross_profit,
        expenses=expenses_total,
        net_profit=gross_profit - expenses_total,
        daily=[
            DailySalesOut(day=day, revenue=values[0], orders=values[1])
            for day, values in daily.items()
        ],
        top_products=[TopProductOut(**product) for product in top_products],
        product_profits=[
            ProductProfitOut(
                **{
                    **product,
                    "quantity": round(product["quantity"], 2),
                }
            )
            for product in product_profits
        ],
        expense_categories=[
            ExpenseCategoryOut(category=category, amount=amount)
            for category, amount in expense_totals.items()
        ],
        expense_history=[ExpenseOut.model_validate(expense) for expense in expenses],
        statuses=[
            StatusCountOut(status=status, count=count)
            for status, count in statuses.items()
        ],
    )


@router.get("/analytics", response_model=AnalyticsOut)
async def admin_analytics(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    return await compute_analytics(days, db)


@router.get("/reports/export")
async def export_report(
    period: str = Query(default="month", pattern="^(day|week|month)$"),
    format: str = Query(default="xlsx", pattern="^(xlsx|pdf|csv)$"),
    lang: str = Query(default="ru", pattern="^(ru|uz|uzc)$"),
    db: AsyncSession = Depends(get_db),
):
    from app.services.reports import (
        export_analytics_csv,
        export_orders_pdf,
        export_orders_xlsx,
        export_pdf,
        export_xlsx,
        period_days,
    )

    days = period_days(period)
    analytics = await compute_analytics(days, db)
    data = analytics.model_dump()

    if format == "pdf":
        content = export_pdf(data, period, lang)
        media_type = "application/pdf"
        ext = "pdf"
    elif format == "csv":
        content = export_analytics_csv(data, period, lang)
        media_type = "text/csv; charset=utf-8"
        ext = "csv"
    else:
        content = export_xlsx(data, period, lang)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"

    filename = f"farrux-report-{period}-{date.today().isoformat()}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/broadcasts", response_model=list[BroadcastOut])
async def list_broadcasts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Broadcast).order_by(Broadcast.created_at.desc(), Broadcast.id.desc()).limit(100)
    )
    return list(result.scalars().all())


@router.post("/broadcasts", response_model=BroadcastOut, status_code=201)
async def create_broadcast(
    payload: BroadcastIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    broadcast = Broadcast(
        title=payload.title.strip(),
        message=payload.message.strip(),
        media_type=payload.media_type,
        media_url=payload.media_url.strip(),
        buy_text=payload.buy_text.strip(),
        buy_url=payload.buy_url.strip(),
        details_text=payload.details_text.strip(),
        details_url=payload.details_url.strip(),
        status="pending",
    )
    db.add(broadcast)
    await db.commit()
    await db.refresh(broadcast)
    background_tasks.add_task(run_broadcast, broadcast.id)
    return broadcast


@router.get("/broadcasts/{broadcast_id}", response_model=BroadcastOut)
async def get_broadcast(broadcast_id: int, db: AsyncSession = Depends(get_db)):
    broadcast = await db.get(Broadcast, broadcast_id)
    if broadcast is None:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    return broadcast


@router.post("/broadcasts/media", response_model=UploadResult)
async def upload_broadcast_media(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Файл пустой")

    max_bytes = 50 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Файл больше 50 МБ")

    content_type = (file.content_type or "").lower()
    ext = None
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        ext = ".webp"
        content_type = "image/webp"
    elif content.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"
        content_type = "image/jpeg"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = ".png"
        content_type = "image/png"
    elif content.startswith((b"GIF87a", b"GIF89a")):
        ext = ".gif"
        content_type = "image/gif"
    elif content[4:8] == b"ftyp" or content_type.startswith("video/"):
        # mp4/mov/webm quick check; allow common video
        name = (file.filename or "").lower()
        if name.endswith(".webm"):
            ext = ".webm"
            content_type = content_type or "video/webm"
        elif name.endswith(".mov"):
            ext = ".mov"
            content_type = content_type or "video/quicktime"
        else:
            ext = ".mp4"
            content_type = content_type or "video/mp4"

    if ext is None:
        raise HTTPException(status_code=422, detail="Поддерживаются JPG, PNG, WEBP, GIF, MP4, MOV, WEBM")

    filename = f"{uuid4().hex}{ext}"

    if r2_client and R2_PUBLIC:
        object_name = f"broadcasts/{filename}"
        await run_in_threadpool(
            r2_client.put_object,
            Bucket=R2_BUCKET,
            Key=object_name,
            Body=content,
            ContentType=content_type or "application/octet-stream",
        )
        return UploadResult(url=f"{R2_PUBLIC}/{object_name}", size=len(content))

    dest = UPLOAD_DIR / filename
    dest.write_bytes(content)
    return UploadResult(url=f"/static/uploads/{filename}", size=len(content))


@router.get("/settings", response_model=StoreSettingsOut)
async def read_store_settings(db: AsyncSession = Depends(get_db)):
    return await get_store_settings(db)


@router.put("/settings", response_model=StoreSettingsOut)
async def save_store_settings(
    payload: StoreSettingsIn,
    db: AsyncSession = Depends(get_db),
):
    store = await get_store_settings(db)

    for field, value in payload.model_dump().items():
        setattr(store, field, value.strip() if isinstance(value, str) else value)

    if not store.store_name:
        store.store_name = "Farrux shop (Hozorosp)"

    await db.commit()
    await db.refresh(store)

    return store