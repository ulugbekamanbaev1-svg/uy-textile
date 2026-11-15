from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.admin import StoreSettingsOut
from app.services.store_settings import get_store_settings

router = APIRouter(prefix="/api", tags=["Store"])


@router.get("/settings", response_model=StoreSettingsOut)
async def public_store_settings(db: AsyncSession = Depends(get_db)):
    """Контакты и условия магазина для витрины."""
    return await get_store_settings(db)
