import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.models.user import User
from app.models.order import Order
from app.models.referral import ReferralReward
from app.routers import referral as referral_router
from app.routers import vip as vip_router
from app.routers import admin_calendar, admin_referral, admin_vip
from app.services import telegram_auth
from app.services.referral import attach_referral, maybe_award_referral_for_completed_order


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows if isinstance(rows, list) else ([rows] if rows is not None else [])

    def scalars(self):
        class _S:
            def __init__(self, rows): self._rows = rows
            def all(self): return self._rows
            def first(self): return self._rows[0] if self._rows else None
        return _S(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class FakeDB:
    def __init__(self, execute_results=None):
        self.execute_results = list(execute_results or [])
        self.added = []
        self.commits = 0
        self.refreshed = []

    async def execute(self, _stmt):
        if self.execute_results:
            return FakeScalarResult(self.execute_results.pop(0))
        return FakeScalarResult([])

    async def scalar(self, _stmt):
        if self.execute_results:
            val = self.execute_results.pop(0)
            if isinstance(val, list):
                return val[0] if val else None
            return val
        return None

    async def get(self, model, pk):
        return None

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = len(self.added) + 100

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj, _attrs=None):
        self.refreshed.append(obj)


def make_init_data(bot_token: str, user: dict, auth_date: int | None = None) -> str:
    auth_date = int(auth_date or time.time())
    payload = {
        "auth_date": str(auth_date),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": json.dumps(user, separators=(",", ":"), ensure_ascii=False),
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


def build_client(fake_db, monkeypatch, routers, bot_token="test-token", admin_pw="admin123"):
    monkeypatch.setattr(telegram_auth.settings, "BOT_TOKEN", bot_token)
    monkeypatch.setattr(telegram_auth.settings, "ADMIN_PASSWORD", admin_pw)
    monkeypatch.setattr(telegram_auth.settings, "APP_ENV", "development")
    monkeypatch.setattr(telegram_auth.settings, "ADMIN_DEV_BYPASS", False)
    app = FastAPI()
    for r in routers:
        app.include_router(r)

    async def override_db():
        yield fake_db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_referral_me_requires_telegram_auth(monkeypatch):
    db = FakeDB()
    client = build_client(db, monkeypatch, [referral_router.router])
    resp = client.get("/api/referral/me")
    assert resp.status_code == 401


def test_vip_me_requires_telegram_auth(monkeypatch):
    db = FakeDB()
    client = build_client(db, monkeypatch, [vip_router.router])
    resp = client.get("/api/vip/me")
    assert resp.status_code == 401


def test_admin_calendar_requires_admin(monkeypatch):
    db = FakeDB()
    client = build_client(db, monkeypatch, [admin_calendar.router])
    resp = client.get("/api/admin/calendar/orders")
    assert resp.status_code in (401, 403)


def test_admin_referral_requires_admin(monkeypatch):
    db = FakeDB()
    client = build_client(db, monkeypatch, [admin_referral.router])
    resp = client.get("/api/admin/referral/stats")
    assert resp.status_code in (401, 403)


def test_attach_referral_rejects_self():
    user = User(telegram_id=111, first_name="A")
    user.id = 1
    user.referral_code = "AAAA"
    user.referred_by_user_id = None

    db = FakeDB(execute_results=[[user]])  # select User where referral_code==code

    result = asyncio.run(attach_referral(db, referred_user=user, referral_code="AAAA"))
    assert result["ok"] is False
    assert result["reason"] == "self_referral"


def test_attach_referral_rejects_already_referred():
    user = User(telegram_id=111, first_name="A")
    user.id = 1
    user.referred_by_user_id = 99

    db = FakeDB()
    result = asyncio.run(attach_referral(db, referred_user=user, referral_code="CODE1"))
    assert result["ok"] is False
    assert result["reason"] == "already_referred"


def test_reward_not_given_for_non_done_order():
    order = Order(customer_name="A", phone="1", address="", comment="", total=1000, telegram_id=111)
    order.id = 10
    order.status = "new"
    db = FakeDB()
    reward = asyncio.run(maybe_award_referral_for_completed_order(db, order))
    assert reward is None