"""Публичные и админские маршруты Farrux Shop QR Premium."""

from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.database import get_db
from app.models import Order
from app.models.qr import QrEvent
from app.services.qr import (
    build_label_pdf,
    generate_qr_png,
    generate_qr_svg,
    is_valid_token,
    is_valid_visitor_id,
    label_font_available,
    label_print_tip,
    qr_public_base_url,
    qr_token,
    qr_url,
    resolve_bot_username,
    telegram_start_param,
    telegram_url_for_username,
)
from app.services.qr_events import log_qr_event
from app.services.rate_limit import (
    client_key,
    qr_download_limiter,
    qr_event_limiter,
    qr_scan_limiter,
)
from app.services.telegram_auth import require_admin

public_router = APIRouter(tags=["QR"])
admin_router = APIRouter(
    prefix="/api/admin/qr",
    tags=["Admin QR"],
    dependencies=[Depends(require_admin)],
)

QR_COOKIE = "farrux_qr_vid"


class QrEventIn(BaseModel):
    event_type: Literal["miniapp_open"]
    token: str = Field(min_length=1, max_length=64)
    visitor_id: str = Field(min_length=8, max_length=64)
    session_id: str | None = Field(default=None, max_length=64)


def _host(request: Request) -> str | None:
    return request.client.host if request.client else None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _range(
    days: int, date_from: str | None, date_to: str | None
) -> tuple[datetime, datetime, date, date]:
    today = date.today()
    start_date = _parse_date(date_from) or (today - timedelta(days=days - 1))
    end_date = _parse_date(date_to) or today

    if end_date < start_date:
        start_date, end_date = end_date, start_date

    # Ограничиваем период, чтобы тяжёлые запросы не тормозили админку.
    if (end_date - start_date).days > 365:
        start_date = end_date - timedelta(days=365)

    tz = datetime.now().astimezone().tzinfo or timezone.utc
    start_dt = datetime.combine(start_date, time.min, tzinfo=tz)
    end_dt = datetime.combine(end_date, time.max, tzinfo=tz)

    return start_dt, end_dt, start_date, end_date


# ---------------------------------------------------------------------------
# Публичные маршруты
# ---------------------------------------------------------------------------


@public_router.get("/qr")
async def qr_redirect(
    request: Request,
    t: str | None = Query(default=None, max_length=64),
    db: AsyncSession = Depends(get_db),
):
    """Постоянный QR-адрес: пишет qr_scan/qr_redirect и уводит в Telegram."""
    token = (t or qr_token()).strip()

    if not is_valid_token(token):
        raise HTTPException(status_code=404, detail="QR-код не найден")

    if not qr_scan_limiter.allow(client_key(_host(request), token)):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    visitor_id = request.cookies.get(QR_COOKIE)
    if not is_valid_visitor_id(visitor_id):
        visitor_id = secrets.token_hex(16)

    try:
        await log_qr_event(
            db,
            "qr_scan",
            token,
            visitor_id=visitor_id,
            dedupe_minutes=30,
            meta="cookie",
        )
    except Exception:
        await db.rollback()

    bot_username = await resolve_bot_username()
    target = telegram_url_for_username(bot_username)

    if not target:
        # Резервный вариант: открыть витрину напрямую, но всё равно передать
        # startapp-параметр, чтобы Mini App понял источник.
        webapp = (settings.WEBAPP_URL or settings.FRONTEND_URL or "").rstrip("/")
        if webapp.startswith("https://"):
            target = f"{webapp}?startapp={telegram_start_param()}"

    if not target:
        raise HTTPException(
            status_code=503,
            detail=(
                "Не настроен Telegram-бот или WEBAPP_URL. "
                "Укажите TELEGRAM_BOT_USERNAME (или BOT_TOKEN) и WEBAPP_URL."
            ),
        )

    try:
        await log_qr_event(
            db,
            "qr_redirect",
            token,
            visitor_id=visitor_id,
            dedupe_minutes=30,
            meta="telegram",
        )
    except Exception:
        await db.rollback()

    response = RedirectResponse(url=target, status_code=302)
    response.set_cookie(
        QR_COOKIE,
        visitor_id,
        max_age=365 * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=qr_public_base_url().startswith("https://"),
    )
    return response


@public_router.get("/api/qr/info")
async def qr_info():
    """Публичная информация о постоянном QR (без секретов)."""
    return {
        "url": qr_url(),
        "token": qr_token(),
        "start_param": telegram_start_param(),
        "public_base_url": qr_public_base_url(),
        "configured": not qr_public_base_url().startswith("http://localhost"),
    }


@public_router.post("/api/qr/event", status_code=202)
async def qr_event(
    payload: QrEventIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Подтверждённое открытие Mini App. Один раз на сессию (плюс серверный дедуп)."""
    if not is_valid_token(payload.token):
        raise HTTPException(status_code=400, detail="Неизвестный QR-токен")

    if not is_valid_visitor_id(payload.visitor_id):
        raise HTTPException(status_code=422, detail="Некорректный visitor_id")

    if not qr_event_limiter.allow(
        client_key(_host(request), payload.visitor_id)
    ):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    try:
        recorded = await log_qr_event(
            db,
            "miniapp_open",
            payload.token,
            visitor_id=payload.visitor_id,
            session_id=payload.session_id,
            dedupe_minutes=30,
            meta="telegram_startapp",
        )
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=503, detail="Не удалось записать событие")

    return {"ok": True, "recorded": recorded}


# ---------------------------------------------------------------------------
# Админские маршруты
# ---------------------------------------------------------------------------


@admin_router.get("/info")
async def admin_qr_info():
    bot_username = await resolve_bot_username()
    telegram_url = telegram_url_for_username(bot_username)
    base_url = qr_public_base_url()

    warnings: list[str] = []

    if base_url.startswith("http://localhost") or base_url.startswith(
        "http://127."
    ):
        warnings.append(
            "QR_PUBLIC_BASE_URL не задан: QR ведёт на localhost. "
            "Укажите публичный HTTPS-адрес backend на Render."
        )

    if not telegram_url:
        warnings.append(
            "Не удалось определить Telegram-бота. Задайте "
            "TELEGRAM_BOT_USERNAME или BOT_TOKEN."
        )

    if not label_font_available():
        warnings.append(
            "Не найден TTF-шрифт с кириллицей для PDF. "
            "Будет использован стандартный шрифт Helvetica."
        )

    return {
        "qr_url": qr_url(),
        "token": qr_token(),
        "start_param": telegram_start_param(),
        "telegram_url": telegram_url,
        "bot_username": bot_username,
        "attribution_days": max(1, min(int(settings.QR_ATTRIBUTION_DAYS), 365)),
        "defaults": {
            "hangtag": {
                "width_mm": float(settings.QR_HANGTAG_WIDTH_MM),
                "height_mm": float(settings.QR_HANGTAG_HEIGHT_MM),
            },
            "sticker": {
                "width_mm": float(settings.QR_STICKER_WIDTH_MM),
                "height_mm": float(settings.QR_STICKER_HEIGHT_MM),
            },
            "margin_mm": float(settings.QR_LABEL_MARGIN_MM),
        },
        "print_tip": label_print_tip("hangtag"),
        "warnings": warnings,
    }


@admin_router.get("/analytics")
async def admin_qr_analytics(
    days: int = Query(default=30, ge=1, le=365),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt, start_date, end_date = _range(days, date_from, date_to)

    event_filter = (
        QrEvent.created_at >= start_dt,
        QrEvent.created_at <= end_dt,
    )

    async def count_events(event_type: str) -> int:
        return (
            await db.scalar(
                select(func.count())
                .select_from(QrEvent)
                .where(QrEvent.event_type == event_type, *event_filter)
            )
            or 0
        )

    scans = await count_events("qr_scan")
    redirects = await count_events("qr_redirect")
    miniapp_opens = await count_events("miniapp_open")

    unique_visitors = (
        await db.scalar(
            select(func.count(func.distinct(QrEvent.visitor_id))).where(
                QrEvent.event_type == "qr_scan",
                QrEvent.visitor_id.is_not(None),
                *event_filter,
            )
        )
        or 0
    )

    order_filter = (
        Order.qr_label.is_not(None),
        Order.qr_label != "",
        Order.created_at >= start_dt,
        Order.created_at <= end_dt,
    )

    qr_orders = (
        await db.scalar(
            select(func.count()).select_from(Order).where(*order_filter)
        )
        or 0
    )
    completed_orders = (
        await db.scalar(
            select(func.count())
            .select_from(Order)
            .where(Order.status == "done", *order_filter)
        )
        or 0
    )
    qr_revenue = (
        await db.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.status != "cancelled", *order_filter
            )
        )
        or 0
    )

    conversion = (
        round(qr_orders / miniapp_opens * 100, 1) if miniapp_opens else 0.0
    )
    scan_conversion = round(qr_orders / scans * 100, 1) if scans else 0.0

    daily: dict[str, dict[str, int]] = {}
    current = start_date
    while current <= end_date:
        daily[current.isoformat()] = {
            "scans": 0,
            "miniapp_opens": 0,
            "orders": 0,
        }
        current += timedelta(days=1)

    event_rows = await db.execute(
        select(
            func.date(QrEvent.created_at),
            QrEvent.event_type,
            func.count(),
        )
        .where(*event_filter)
        .group_by(func.date(QrEvent.created_at), QrEvent.event_type)
    )

    for day_value, event_type, amount in event_rows.all():
        key = day_value.isoformat() if hasattr(day_value, "isoformat") else str(day_value)
        if key in daily and event_type in ("qr_scan", "miniapp_open"):
            field = "scans" if event_type == "qr_scan" else "miniapp_opens"
            daily[key][field] = int(amount or 0)

    order_rows = await db.execute(
        select(func.date(Order.created_at), func.count())
        .where(*order_filter)
        .group_by(func.date(Order.created_at))
    )
    for day_value, amount in order_rows.all():
        key = day_value.isoformat() if hasattr(day_value, "isoformat") else str(day_value)
        if key in daily:
            daily[key]["orders"] = int(amount or 0)

    return {
        "days": (end_date - start_date).days + 1,
        "date_from": start_date.isoformat(),
        "date_to": end_date.isoformat(),
        "scans": scans,
        "redirects": redirects,
        "unique_visitors": unique_visitors,
        "miniapp_opens": miniapp_opens,
        "orders": qr_orders,
        "completed_orders": completed_orders,
        "revenue": int(qr_revenue or 0),
        "conversion": conversion,
        "scan_conversion": scan_conversion,
        "daily": [
            {"day": day, **values} for day, values in daily.items()
        ],
        "notes": {
            "unique_visitors": (
                "Уникальные посетители считаются по случайному cookie "
                "браузера. IP-адреса не сохраняются."
            ),
            "miniapp_open": (
                "Событие Mini App фиксируется, когда Telegram передал "
                "startapp-параметр и страница магазина загрузилась."
            ),
        },
    }


@admin_router.get("/download/png")
async def download_qr_png(
    request: Request,
    box_size: int = Query(default=18, ge=6, le=48),
):
    if not qr_download_limiter.allow(client_key(_host(request), "png")):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    content = await run_in_threadpool(generate_qr_png, qr_url(), box_size)
    return Response(
        content=content,
        media_type="image/png",
        headers={
            "Content-Disposition": 'attachment; filename="farrux-shop-qr.png"',
            "Cache-Control": "no-store",
        },
    )


@admin_router.get("/download/svg")
async def download_qr_svg(request: Request):
    if not qr_download_limiter.allow(client_key(_host(request), "svg")):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    content = await run_in_threadpool(generate_qr_svg, qr_url())
    return Response(
        content=content,
        media_type="image/svg+xml",
        headers={
            "Content-Disposition": 'attachment; filename="farrux-shop-qr.svg"',
            "Cache-Control": "no-store",
        },
    )


@admin_router.get("/download/pdf")
async def download_qr_pdf(
    request: Request,
    layout: str = Query(default="hangtag", pattern="^(hangtag|sticker)$"),
    width_mm: float | None = Query(default=None, ge=20, le=200),
    height_mm: float | None = Query(default=None, ge=20, le=200),
    margin_mm: float | None = Query(default=None, ge=1, le=20),
    sheet: bool = Query(default=False),
    lang: str = Query(default="ru", pattern="^(ru|uz|uzc)$"),
):
    if not qr_download_limiter.allow(
        client_key(_host(request), f"pdf-{layout}-{sheet}")
    ):
        raise HTTPException(status_code=429, detail="Слишком много запросов")

    content = await run_in_threadpool(
        build_label_pdf,
        layout,
        qr_url(),
        width_mm,
        height_mm,
        margin_mm,
        sheet,
        lang,
    )

    suffix = "sheet" if sheet else "label"
    filename = f"farrux-qr-{layout}-{suffix}.pdf"

    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
