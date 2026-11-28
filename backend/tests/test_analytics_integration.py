"""Интеграционные тесты Visitor Analytics на реальном PostgreSQL.

Запускаются только когда задан TEST_DATABASE_URL, например:
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/uytextile_test
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.analytics import Visitor, VisitorConsent, VisitorEvent, VisitorSession
from app.services import analytics as service

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; real PostgreSQL integration test skipped",
)


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        # Чистим только аналитические таблицы, не трогая рабочие данные.
        await conn.execute(text("DELETE FROM visitor_events"))
        await conn.execute(text("DELETE FROM visitor_sessions"))
        await conn.execute(text("DELETE FROM visitor_consents"))
        await conn.execute(text("DELETE FROM visitors"))
    await engine.dispose()


@pytest.mark.asyncio
async def test_session_event_and_dedup(db_session: AsyncSession):
    visitor_uuid = uuid.uuid4()
    session_uuid = uuid.uuid4()
    event_uuid = uuid.uuid4()

    started = await service.start_session(
        db_session,
        visitor_uuid=visitor_uuid,
        session_uuid=session_uuid,
        page="/catalog",
        referrer="",
        user_agent="Mozilla/5.0 Chrome/120",
    )
    assert started["active"] is True
    assert started["consent"] is True

    first = await service.log_event(
        db_session,
        visitor_uuid=visitor_uuid,
        session_uuid=session_uuid,
        event_uuid=event_uuid,
        event_type="page_view",
        page_url="/catalog",
        product_id=None,
        category_id=None,
        event_data={"source": "test"},
    )
    second = await service.log_event(
        db_session,
        visitor_uuid=visitor_uuid,
        session_uuid=session_uuid,
        event_uuid=event_uuid,
        event_type="page_view",
        page_url="/catalog",
        product_id=None,
        category_id=None,
        event_data={"source": "test"},
    )

    assert first["accepted"] is True
    assert second["duplicate"] is True

    count = await db_session.scalar(
        text("SELECT COUNT(*) FROM visitor_events WHERE event_type = 'page_view'")
    )
    assert int(count or 0) == 1


@pytest.mark.asyncio
async def test_consent_blocks_events(db_session: AsyncSession):
    visitor_uuid = uuid.uuid4()
    session_uuid = uuid.uuid4()

    await service.start_session(
        db_session,
        visitor_uuid=visitor_uuid,
        session_uuid=session_uuid,
        page="/",
        referrer="",
        user_agent=None,
    )
    await service.set_consent(db_session, visitor_uuid, False, "1")

    with pytest.raises(service.ConsentRequiredError):
        await service.log_event(
            db_session,
            visitor_uuid=visitor_uuid,
            session_uuid=session_uuid,
            event_uuid=uuid.uuid4(),
            event_type="page_view",
            page_url="/",
            product_id=None,
            category_id=None,
            event_data=None,
        )
