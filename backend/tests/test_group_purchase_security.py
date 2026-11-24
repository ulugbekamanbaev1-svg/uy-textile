from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.routers import group_purchase as gp_router
from app.services import telegram_auth


class FakeDB:
    async def execute(self, _stmt):
        class R:
            def scalars(self):
                class S:
                    def all(self):
                        return []
                    def unique(self):
                        return self
                return S()
            def scalar_one_or_none(self):
                return None
        return R()

    async def get(self, *args, **kwargs):
        return None

    def add(self, obj):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj, *args, **kwargs):
        pass

    async def flush(self):
        pass


def build_client(monkeypatch, bot_token="test-token"):
    monkeypatch.setattr(telegram_auth.settings, "BOT_TOKEN", bot_token)
    app = FastAPI()
    app.include_router(gp_router.router)

    async def override_db():
        yield FakeDB()

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_group_purchase_my_requires_auth(monkeypatch):
    client = build_client(monkeypatch)
    resp = client.get("/api/group-purchases/my")
    assert resp.status_code == 401


def test_group_purchase_invite_requires_auth(monkeypatch):
    client = build_client(monkeypatch)
    resp = client.get("/api/group-purchases/invite/sometoken")
    assert resp.status_code == 401


def test_group_purchase_create_requires_auth(monkeypatch):
    client = build_client(monkeypatch)
    resp = client.post("/api/group-purchases", json={"product_slug": "p1", "meters": 10})
    assert resp.status_code == 401


def test_group_purchase_join_requires_auth(monkeypatch):
    client = build_client(monkeypatch)
    resp = client.post("/api/group-purchases/join", json={"token": "abc12345", "meters": 1})
    assert resp.status_code == 401