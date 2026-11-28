"""Тесты Visitor Analytics: чистые функции, схемы и защита админки.

Интеграционные сценарии с реальным PostgreSQL находятся в
test_analytics_integration.py и запускаются только при TEST_DATABASE_URL.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import settings
from app.routers import admin_analytics
from app.schemas.analytics import EventIn
from app.services import analytics as service


# ---------- UUID / схемы ----------


def test_event_schema_accepts_allowed_type():
    payload = EventIn(
        visitor_uuid=uuid.uuid4(),
        session_uuid=uuid.uuid4(),
        event_uuid=uuid.uuid4(),
        event_type="product_view",
        page_url="/product/test",
        product_id=5,
    )
    assert payload.event_type == "product_view"


def test_event_schema_rejects_unknown_type():
    with pytest.raises(ValidationError):
        EventIn(
            visitor_uuid=uuid.uuid4(),
            session_uuid=uuid.uuid4(),
            event_uuid=uuid.uuid4(),
            event_type="password_stolen",
        )


def test_event_schema_rejects_bad_uuid():
    with pytest.raises(ValidationError):
        EventIn(
            visitor_uuid="not-a-uuid",
            session_uuid=uuid.uuid4(),
            event_uuid=uuid.uuid4(),
            event_type="page_view",
        )


# ---------- User-Agent (без сохранения самого UA) ----------


@pytest.mark.parametrize(
    "ua,device,browser",
    [
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1", "mobile", "Safari"),
        ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "mobile", "Chrome"),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "desktop", "Chrome"),
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", "desktop", "Safari"),
        ("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1", "tablet", "Safari"),
        ("", "unknown", "unknown"),
    ],
)
def test_parse_user_agent(ua, device, browser):
    assert service.parse_user_agent(ua) == (device, browser)


# ---------- Очистка event_data ----------


def test_sanitize_event_data_drops_sensitive_keys():
    cleaned = service.sanitize_event_data(
        {
            "query": "simple",
            "password": "secret",
            "card_number": "8600",
            "phone": "+998",
            "email": "a@b.c",
            "token": "abc",
            "qty": 2,
            "nested": {"deep": "value"},
        }
    )
    assert cleaned == {"query": "simple", "qty": 2}


def test_sanitize_event_data_truncates_long_strings():
    cleaned = service.sanitize_event_data({"query": "x" * 1000})
    assert len(cleaned["query"]) == 300


def test_sanitize_event_data_limits_size():
    huge = {f"k{index}": "v" * 300 for index in range(40)}
    assert service.sanitize_event_data(huge) == {}


def test_sanitize_event_data_rejects_non_dict():
    assert service.sanitize_event_data("string") == {}
    assert service.sanitize_event_data(None) == {}


# ---------- Online-порог ----------


def test_is_online_inside_window():
    assert service.is_online(datetime.now(timezone.utc) - timedelta(seconds=10), 120)


def test_is_online_outside_window():
    assert not service.is_online(
        datetime.now(timezone.utc) - timedelta(seconds=300), 120
    )


def test_is_online_handles_none_and_naive():
    assert not service.is_online(None)
    naive = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=5)
    assert service.is_online(naive, 120)


# ---------- Периоды админки ----------


def test_range_today():
    start, end = admin_analytics._range("today", None, None)
    assert start < end
    assert start.utcoffset() is not None


def test_range_custom_requires_valid_dates():
    with pytest.raises(HTTPException):
        admin_analytics._range("custom", "not-a-date", "2026-01-01")


def test_range_custom_includes_whole_end_day():
    start, end = admin_analytics._range("custom", "2026-01-01", "2026-01-02")
    assert (end - start) == timedelta(days=2)


# ---------- Админские маршруты закрыты ----------


def _admin_app() -> FastAPI:
    app = FastAPI()
    app.include_router(admin_analytics.router)
    return app


def test_admin_analytics_requires_auth(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_DEV_BYPASS", False)
    monkeypatch.setattr(settings, "APP_ENV", "production")

    client = TestClient(_admin_app())
    for path in (
        "/api/admin/analytics/live",
        "/api/admin/analytics/visitors",
        "/api/admin/analytics/stats",
        "/api/admin/analytics/events",
    ):
        response = client.get(path)
        assert response.status_code == 401, path


def test_admin_analytics_rejects_wrong_basic_password(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_DEV_BYPASS", False)
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ADMIN_PASSWORD", "correct-password")

    client = TestClient(_admin_app())
    response = client.get(
        "/api/admin/analytics/live",
        headers={"Authorization": "Basic YWRtaW46d3Jvbmc="},  # admin:wrong
    )
    assert response.status_code == 401


def test_admin_analytics_accepts_dev_bypass(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_DEV_BYPASS", True)
    monkeypatch.setattr(settings, "APP_ENV", "test")

    # Без БД запрос дойдёт до зависимости get_db и упадёт на подключении,
    # поэтому проверяем только то, что require_admin не вернул 401/403.
    from app.services.telegram_auth import require_admin

    assert require_admin(None, None) == 0
