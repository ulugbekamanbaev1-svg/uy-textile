from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import models  # noqa: F401
from app.config import settings
from app.database import Base, engine
from app.routers import admin, auth, catalog, orders, store
from app.seed import seed_data

# ВАЖНО: __file__ с двумя подчеркиваниями!
STATIC_DIR = Path(__file__).resolve().parent / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT TRUE"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hero_title_ru VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_title_uz VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_title_uzc VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_ru TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_uz TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_uzc TEXT NOT NULL DEFAULT ''"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS banner_active BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS banner_text_ru VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_text_uz VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_text_uzc VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_category VARCHAR(80) NOT NULL DEFAULT ''"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS store_latitude DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS store_longitude DOUBLE PRECISION"))
        await connection.execute(text("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS meters NUMERIC(10, 2), ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) NOT NULL DEFAULT 'piece', ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) NOT NULL DEFAULT ''"))

    await seed_data()
    yield
    await engine.dispose()

app = FastAPI(
    title=settings.APP_NAME,
    description="Farrux shop (Hozoosp) online store API",
    version="1.0.0",
    lifespan=lifespan,
)

# Разрешаем заголовок авторизации и Telegram initData (нужен админке и Mini App)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Telegram-Init-Data"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(store.router)

# Защищенный маршрут: пароль админки (Basic) ИЛИ Telegram initData владельца
app.include_router(admin.router)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def root():
    return {
        "name": "Farrux shop (Hozoosp)",
        "message": "Welcome to Farrux shop (Hozoosp) API",
        "status": "running",
    }

@app.get("/api/health")
async def health():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "application": "Farrux shop (Hozoosp)",
        }
    except Exception:
        return {
            "status": "unhealthy",
            "database": "disconnected",
        }

@app.get("/api")
async def api_info():
    return {
        "project": "Farrux shop (Hozoosp)",
        "version": "1.0.0",
        "environment": settings.APP_ENV,
    }