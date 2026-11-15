from contextlib import asynccontextmanager
from pathlib import Path
import os
import secrets

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
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

# --- НАСТРОЙКА БЕЗОПАСНОСТИ ---
security = HTTPBasic()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    is_correct_password = secrets.compare_digest(
        credentials.password.encode("utf-8"),
        ADMIN_PASSWORD.encode("utf-8")
    )
    if not is_correct_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль администратора",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
# -------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT TRUE"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hero_title_ru VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_title_uz VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_title_uzc VARCHAR(160) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_ru TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_uz TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS hero_text_uzc TEXT NOT NULL DEFAULT ''"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS banner_active BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS banner_text_ru VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_text_uz VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_text_uzc VARCHAR(200) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS banner_category VARCHAR(80) NOT NULL DEFAULT ''"))
        await connection.execute(text("ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS store_latitude DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS store_longitude DOUBLE PRECISION"))

    await seed_data()
    yield
    await engine.dispose()

app = FastAPI(
    title=settings.APP_NAME,
    description="Farrux shop (Hozoosp) online store API",
    version="1.0.0",
    lifespan=lifespan,
)

# ИСПРАВЛЕНО: Явно указываем разрешенные заголовки для работы пароля
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(store.router)

# Защищенный маршрут
app.include_router(admin.router, dependencies=[Depends(verify_admin)])

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