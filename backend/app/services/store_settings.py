from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StoreSettings

SETTINGS_ID = 1


async def get_store_settings(db: AsyncSession) -> StoreSettings:
    """Возвращает строку настроек, создавая её при первом обращении."""
    settings = await db.get(StoreSettings, SETTINGS_ID)

    if settings is None:
        settings = StoreSettings(id=SETTINGS_ID)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    elif settings.store_name == "Uy Textile":
        settings.store_name = "Farrux shop (Hozorosp)"
        await db.commit()
        await db.refresh(settings)

    return settings
