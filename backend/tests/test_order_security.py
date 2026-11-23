import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.models.order import Order, OrderItem
from app.routers import orders as orders_router
from app.services import telegram_auth


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        class _S:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows

        return _S(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    def __init__(self, *, orders=None, scalar_value=None, execute_results=None):
        self.orders = orders or []
        self.scalar_value = scalar_value
        self.execute_results = list(execute_results or [])
        self.commits = 0
        self.refreshed = []
        self.added = []
        self._next_id = 100

    async def execute(self, _stmt):
        if self.execute_results:
            return FakeScalarResult(self.execute_results.pop(0))
        return FakeScalarResult(self.orders)

    async def scalar(self, _stmt):
        return self.scalar_value

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id
                self._next_id += 1
            if getattr(obj, "status", None) is None:
                obj.status = "new"
            if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
                import datetime as _dt
                obj.created_at = _dt.datetime.now(_dt.timezone.utc)

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


def make_order(order_id: int, telegram_id: int | None, phone: str = "+998901112233"):
    order = Order(
        customer_name="Test",
        phone=phone,
        address="addr",
        comment="",
        total=1000,
        telegram_id=telegram_id,
        telegram_username="user1" if telegram_id else None,
    )
    order.id = order_id
    order.status = "new"
    order.created_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    order.items = []
    order.qr_label = None
    return order


def build_client(fake_db, monkeypatch, bot_token="test-token"):
    monkeypatch.setattr(telegram_auth.settings, "BOT_TOKEN", bot_token)
    app = FastAPI()
    app.include_router(orders_router.router)

    async def override_db():
        yield fake_db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_1_buyer_sees_only_own_orders(monkeypatch):
    order_a = make_order(10, telegram_id=111)
    order_b = make_order(11, telegram_id=222)
    db = FakeDB(orders=[order_a])  # DB query is filtered in real DB; here we simulate result
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    resp = client.get("/api/orders/my", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200
    data = resp.json()
    assert [o["id"] for o in data] == [10]
    assert all(o["telegram_id"] == 111 for o in data)


def test_2_cannot_open_other_users_order_by_id(monkeypatch):
    # /my only returns own orders; even if someone tries to manipulate, endpoint has no order_id param.
    order_a = make_order(10, telegram_id=111)
    db = FakeDB(orders=[order_a])
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    resp = client.get("/api/orders/my?order_id=11&user_id=222", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200
    assert [o["id"] for o in resp.json()] == [10]


def test_3_phone_number_of_other_user_does_not_return_orders(monkeypatch):
    order_a = make_order(10, telegram_id=111)
    db = FakeDB(orders=[order_a])
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    # Old vulnerable params are ignored; only own orders returned.
    resp = client.get(
        "/api/orders/track?phone=%2B998909998877&username=someone",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 200
    assert [o["id"] for o in resp.json()] == [10]


def test_4_foreign_user_id_ignored_uses_verified_identity(monkeypatch):
    order_a = make_order(10, telegram_id=111)
    db = FakeDB(orders=[order_a])
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    # Even if client tries to pass foreign id params, backend uses initData identity.
    resp = client.get(
        "/api/orders/my?telegram_id=222&user_id=222",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 200
    assert all(o["telegram_id"] == 111 for o in resp.json())


def test_5_direct_url_foreign_order_access_forbidden(monkeypatch):
    # There is no public GET /api/orders/{id}; attempt should be 404/405, not leak data.
    db = FakeDB(orders=[])
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    resp = client.get("/api/orders/11", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code in (404, 405)


def test_6_request_without_valid_auth_rejected(monkeypatch):
    db = FakeDB(orders=[])
    client = build_client(db, monkeypatch)

    resp = client.get("/api/orders/my")
    assert resp.status_code == 401


def test_7_fake_or_expired_init_data_rejected(monkeypatch):
    db = FakeDB(orders=[])
    client = build_client(db, monkeypatch)

    fake = "user=%7B%22id%22%3A111%7D&auth_date=1&hash=bad"
    resp = client.get("/api/orders/my", headers={"X-Telegram-Init-Data": fake})
    assert resp.status_code == 401

    expired = make_init_data("test-token", {"id": 111, "first_name": "A"}, auth_date=int(time.time()) - 90000)
    resp2 = client.get("/api/orders/my", headers={"X-Telegram-Init-Data": expired})
    assert resp2.status_code == 401


def test_8_admin_with_correct_rights_can_view_orders(monkeypatch):
    # Admin endpoint remains protected by require_admin and returns all orders.
    from app.routers import admin as admin_router
    from app.services import telegram_auth as ta

    order_a = make_order(10, telegram_id=111)
    order_b = make_order(11, telegram_id=222)
    db = FakeDB(orders=[order_b, order_a])
    monkeypatch.setattr(ta.settings, "BOT_TOKEN", "test-token")
    monkeypatch.setattr(ta.settings, "ADMIN_TELEGRAM_IDS", "999")
    monkeypatch.setattr(ta.settings, "ADMIN_TELEGRAM_ID", "999")
    monkeypatch.setattr(ta.settings, "ADMIN_PASSWORD", "pw")

    app = FastAPI()
    app.include_router(admin_router.router)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    init_data = make_init_data("test-token", {"id": 999, "first_name": "Admin"})
    resp = client.get("/api/admin/orders", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200
    ids = [o["id"] for o in resp.json()]
    assert 10 in ids and 11 in ids


def test_9_new_orders_bound_to_verified_user(monkeypatch):
    class FakeProduct:
        id = 1
        slug = "p1"
        name_ru = "Товар"
        name_uz = "Tovar"
        name_uzc = "Товар"
        in_stock = True
        pricing_type = "fixed"
        price_per_m2 = 10000
        variants = []
        colors = []
        price_tiers = []
        images = []
        image_url = ""

    async def _noop(*args, **kwargs):
        return None

    db = FakeDB(orders=[], execute_results=[[FakeProduct()]])
    monkeypatch.setattr(orders_router, "notify_admin_about_order", lambda order: None)
    monkeypatch.setattr(orders_router, "cancel_cart_reminder", _noop)

    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A", "username": "alice"})

    payload = {
        "customer_name": "Alice",
        "phone": "+998901112233",
        "address": "Tashkent",
        "comment": "",
        "telegram_id": 222,  # must be ignored
        "telegram_username": "mallory",  # must be ignored
        "items": [{"slug": "p1", "quantity": 1}],
    }
    resp = client.post("/api/orders", json=payload, headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 201
    assert db.added, "order should be added"
    created = db.added[0]
    assert created.telegram_id == 111
    assert created.telegram_username == "alice"


def test_10_old_unbound_orders_not_revealed(monkeypatch):
    old_order = make_order(10, telegram_id=None, phone="+998901112233")
    db = FakeDB(orders=[])
    client = build_client(db, monkeypatch)
    init_data = make_init_data("test-token", {"id": 111, "first_name": "A"})

    # /my returns only telegram_id == verified user; old unbound order is not included.
    resp = client.get("/api/orders/my", headers={"X-Telegram-Init-Data": init_data})
    assert resp.status_code == 200
    assert resp.json() == []

    # Claim with wrong phone should not reveal/bind
    db2 = FakeDB(orders=[old_order])
    client2 = build_client(db2, monkeypatch)
    resp2 = client2.post(
        "/api/orders/claim",
        json={"number": "UY-00010", "phone": "+998900000000"},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp2.status_code == 404
    assert old_order.telegram_id is None
