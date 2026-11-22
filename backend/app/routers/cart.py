from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.cart_reminders import cancel_cart_reminder, sync_cart_reminder
from app.services.telegram_auth import verify_telegram_init_data

router = APIRouter(prefix="/api/cart", tags=["Cart"])


class CartSyncIn(BaseModel):
    initData: str | None = None
    items: list[dict] = Field(default_factory=list)
    total: int = 0


@router.post("/sync")
async def sync_cart(
    payload: CartSyncIn,
    x_telegram_init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    db: AsyncSession = Depends(get_db),
):
    init_data = payload.initData or x_telegram_init_data
    if not init_data:
        raise HTTPException(status_code=401, detail="Telegram initData required")

    tg_user = verify_telegram_init_data(init_data)
    telegram_id = int(tg_user.get("id") or 0)
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid Telegram user")

    if payload.items:
        await sync_cart_reminder(db, telegram_id, payload.items, payload.total)
    else:
        await cancel_cart_reminder(db, telegram_id)

    await db.commit()
    return {"ok": True}
