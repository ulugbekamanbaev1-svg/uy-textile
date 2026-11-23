from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

VIP_LEVELS = ("silver", "gold", "platinum", "diamond")


class VipStatusHistory(Base):
    __tablename__ = "vip_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    old_level: Mapped[str] = mapped_column(String(20), default="silver")
    new_level: Mapped[str] = mapped_column(String(20), default="silver")
    criterion: Mapped[str] = mapped_column(String(20), default="amount")
    metric_value: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )