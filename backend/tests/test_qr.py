import asyncio
from datetime import datetime, timedelta, timezone

from app.services import qr
from app.services.qr_events import log_qr_event
from app.services.rate_limit import SlidingWindowLimiter


def test_qr_url_and_token():
    assert qr.qr_token() == "farrux"
    assert qr.qr_url() == "https://api.example.com/qr?t=farrux"
    assert qr.is_valid_token("farrux")
    assert not qr.is_valid_token("wrong")
    assert qr.telegram_start_param() == "qr_farrux"


def test_telegram_url_for_username():
    url = qr.telegram_url_for_username("farrux_test_bot")
    assert url == "https://t.me/farrux_test_bot?startapp=qr_farrux"
    assert qr.telegram_url_for_username("") == ""


def test_visitor_id_validation():
    assert qr.is_valid_visitor_id("a1b2c3d4e5f6g7h8")
    assert not qr.is_valid_visitor_id("short")
    assert not qr.is_valid_visitor_id("bad space")
    assert not qr.is_valid_visitor_id("x" * 65)


def test_generate_qr_png_signature():
    data = qr.generate_qr_png("https://api.example.com/qr?t=farrux")
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(data) > 1000


def test_generate_qr_svg():
    data = qr.generate_qr_svg("https://api.example.com/qr?t=farrux")
    text = data.decode("utf-8", errors="ignore").lower()
    assert "<svg" in text
    assert "</svg>" in text


def test_build_label_pdfs():
    hangtag = qr.build_label_pdf(
        "hangtag", "https://api.example.com/qr?t=farrux", 50, 80, 3, False
    )
    sticker = qr.build_label_pdf(
        "sticker", "https://api.example.com/qr?t=farrux", 50, 50, 3, False
    )
    sheet = qr.build_label_pdf(
        "hangtag", "https://api.example.com/qr?t=farrux", 50, 80, 3, True
    )

    for pdf in (hangtag, sticker, sheet):
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 2000


def test_rate_limiter_blocks_after_limit():
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60)
    assert limiter.allow("k") is True
    assert limiter.allow("k") is True
    assert limiter.allow("k") is False
    assert limiter.allow("other") is True


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class FakeDB:
    def __init__(self, existing_ids=None):
        self.existing_ids = list(existing_ids or [])
        self.added = []
        self.commits = 0

    async def scalar(self, _query):
        if self.existing_ids:
            return self.existing_ids.pop(0)
        return None

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1


def test_log_qr_event_dedupes_order_created():
    db = FakeDB(existing_ids=[123])

    recorded = asyncio.run(
        log_qr_event(
            db,
            "order_created",
            "farrux",
            visitor_id="visitor12345678",
            order_id=99,
        )
    )

    assert recorded is False
    assert db.added == []
    assert db.commits == 0


def test_log_qr_event_records_miniapp_open():
    db = FakeDB(existing_ids=[None])

    recorded = asyncio.run(
        log_qr_event(
            db,
            "miniapp_open",
            "farrux",
            visitor_id="visitor12345678",
            dedupe_minutes=30,
            meta="telegram_startapp",
        )
    )

    assert recorded is True
    assert len(db.added) == 1
    assert db.added[0].event_type == "miniapp_open"
    assert db.commits == 1


def test_attribution_cutoff_is_recent():
    cutoff = qr.attribution_cutoff()
    assert cutoff.tzinfo is not None
    assert cutoff < datetime.now(timezone.utc)
    assert cutoff > datetime.now(timezone.utc) - timedelta(days=366)
