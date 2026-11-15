from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import models  # noqa: F401  (регистрирует модели в Base.metadata)
from app.config import settings
from app.database import Base, engine
from app.routers import admin, auth, catalog, orders, store
from app.seed import seed_data

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    await seed_data()

    yield

    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="Uy Textile online store API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(store.router)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    return {
        "name": "Uy Textile",
        "message": "Welcome to Uy Textile API",
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
            "application": "Uy Textile",
        }

    except Exception:
        return {
            "status": "unhealthy",
            "database": "disconnected",
        }


@app.get("/api")
async def api_info():
    return {
        "project": "Uy Textile",
        "version": "1.0.0",
        "environment": settings.APP_ENV,
    }
