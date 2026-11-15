from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.services.telegram_auth import verify_telegram_init_data

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class TelegramAuthPayload(BaseModel):
    initData: str


@router.post("/telegram")
async def telegram_login(
    payload: TelegramAuthPayload,
    db: AsyncSession = Depends(get_db),
):
    if not payload.initData:
        raise HTTPException(
            status_code=400,
            detail="Telegram initData is required",
        )

    telegram_user = verify_telegram_init_data(payload.initData)
    telegram_id = telegram_user.get("id")

    if not telegram_id:
        raise HTTPException(
            status_code=401,
            detail="Telegram user ID is missing",
        )

    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=telegram_id,
            first_name=telegram_user.get("first_name", ""),
            last_name=telegram_user.get("last_name", ""),
            username=telegram_user.get("username"),
            language_code=telegram_user.get("language_code"),
        )
        db.add(user)
    else:
        user.first_name = telegram_user.get("first_name", "")
        user.last_name = telegram_user.get("last_name", "")
        user.username = telegram_user.get("username")
        user.language_code = telegram_user.get("language_code")

    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "message": "Telegram authentication successful",
        "user": {
            "id": user.id,
            "telegram_id": user.telegram_id,
            "first_name": user.first_name,
            "username": user.username,
        },
    }
