"""Farrux Shop QR Premium: постоянная ссылка, Telegram deep link и печать.

Ключевой принцип: QR-код всегда содержит один и тот же адрес
``<PUBLIC_API_URL>/qr?t=<QR_TOKEN>``. Меняются только настройки на сервере,
поэтому уже напечатанные этикетки продолжают работать.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import httpx
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.svg import SvgPathImage

from app.config import settings

# ---------------------------------------------------------------------------
# Ссылки
# ---------------------------------------------------------------------------

_visitor_re = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_bot_username_cache: tuple[str, datetime] | None = None


def qr_public_base_url() -> str:
    base = (settings.QR_PUBLIC_BASE_URL or settings.PUBLIC_API_URL or "").strip()

    if not base:
        for origin in settings.cors_origins_list:
            if origin.startswith("https://"):
                base = origin
                break

    if not base:
        # Локальный режим. В production обязательно задайте QR_PUBLIC_BASE_URL
        # или PUBLIC_API_URL, иначе напечатанный QR будет вести на localhost.
        base = "http://localhost:8000"

    return base.rstrip("/")


def qr_token() -> str:
    return (settings.QR_TOKEN or "farrux").strip()


def is_valid_token(value: str | None) -> bool:
    return bool(value) and value.strip() == qr_token()


def is_valid_visitor_id(value: str | None) -> bool:
    return bool(value) and bool(_visitor_re.match(value.strip()))


def qr_url() -> str:
    return f"{qr_public_base_url()}/qr?t={quote(qr_token())}"


def _normalize_bot_username(value: str | None) -> str:
    username = (value or "").strip().lstrip("@")
    return username if re.match(r"^[A-Za-z0-9_]{4,64}$", username) else ""


def telegram_start_param() -> str:
    return f"qr_{qr_token()}"


def telegram_url_for_username(bot_username: str | None) -> str:
    """Собирает deep link, который сразу открывает Mini App в Telegram."""
    if settings.QR_TELEGRAM_URL:
        return settings.QR_TELEGRAM_URL.strip()

    username = _normalize_bot_username(bot_username)
    if not username:
        return ""

    return f"https://t.me/{username}?startapp={quote(telegram_start_param())}"


async def resolve_bot_username(force: bool = False) -> str:
    """Возвращает username бота: из env или через getMe (с кэшем)."""
    global _bot_username_cache

    configured = _normalize_bot_username(settings.TELEGRAM_BOT_USERNAME)
    if configured:
        return configured

    now = datetime.now(timezone.utc)

    if not force and _bot_username_cache is not None:
        username, expires_at = _bot_username_cache
        if expires_at > now:
            return username

    if not settings.BOT_TOKEN:
        _bot_username_cache = ("", now + timedelta(seconds=60))
        return ""

    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.get(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/getMe"
            )
            payload = response.json()

        username = ""
        if response.status_code == 200 and payload.get("ok"):
            username = _normalize_bot_username(
                (payload.get("result") or {}).get("username")
            )

        _bot_username_cache = (
            username,
            now + timedelta(hours=1 if username else 1 / 60),
        )
        return username
    except Exception:
        _bot_username_cache = ("", now + timedelta(seconds=60))
        return ""


async def resolve_telegram_url() -> str:
    if settings.QR_TELEGRAM_URL:
        return settings.QR_TELEGRAM_URL.strip()
    return telegram_url_for_username(await resolve_bot_username())


def attribution_cutoff() -> datetime:
    days = max(1, min(int(settings.QR_ATTRIBUTION_DAYS or 30), 365))
    return datetime.now(timezone.utc) - timedelta(days=days)


# ---------------------------------------------------------------------------
# Генерация QR
# ---------------------------------------------------------------------------


def generate_qr_png(data: str | None = None, box_size: int = 18) -> bytes:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,  # до 30% повреждений — важно для этикеток
        box_size=max(4, min(int(box_size), 64)),
        border=4,  # белая зона вокруг QR
    )
    qr.add_data(data or qr_url())
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def generate_qr_svg(data: str | None = None) -> bytes:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=10,
        border=4,
        image_factory=SvgPathImage,
    )
    qr.add_data(data or qr_url())
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    return image.to_string()


# ---------------------------------------------------------------------------
# Премиальные этикетки (PDF, вектор + QR высокого разрешения)
# ---------------------------------------------------------------------------

BLACK = "#0B0B0C"
MATTE = "#121214"
GOLD = "#C8A45C"
GOLD_SOFT = "#E3C98E"
WHITE = "#FFFFFF"
PAPER = "#F7F3EA"


def _label_font_paths() -> tuple[str | None, str | None]:
    bundled = Path(__file__).resolve().parent.parent / "static" / "fonts"
    candidates = [
        (bundled / "DejaVuSans.ttf", bundled / "DejaVuSans-Bold.ttf"),
        (
            Path(r"C:\Windows\Fonts\arial.ttf"),
            Path(r"C:\Windows\Fonts\arialbd.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ),
        (
            Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
            Path("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
        ),
    ]

    for regular, bold in candidates:
        if regular.exists():
            return str(regular), str(bold) if bold.exists() else None

    return None, None


def label_font_available() -> bool:
    """Есть ли TTF-шрифт с кириллицей для PDF-этикеток."""
    regular_path, _ = _label_font_paths()
    return bool(regular_path)


def _register_label_fonts() -> tuple[str, str]:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular_path, bold_path = _label_font_paths()
    regular, bold = "Helvetica", "Helvetica-Bold"

    if regular_path:
        try:
            pdfmetrics.registerFont(TTFont("FarruxQr", regular_path))
            regular = "FarruxQr"

            if bold_path:
                pdfmetrics.registerFont(TTFont("FarruxQrBold", bold_path))
                bold = "FarruxQrBold"
            else:
                bold = regular
        except Exception:
            regular, bold = "Helvetica", "Helvetica-Bold"

    return regular, bold


def _hex(value: str):
    from reportlab.lib.colors import HexColor

    return HexColor(value)


def _set_char_space(c, value):
    # reportlab API differs across versions; support both.
    setter = getattr(c, "setCharSpace", None)
    if callable(setter):
        setter(value)
    else:
        c._charSpace = value


def _text_center(c, text, cx, y, font, size, color, char_space=0):
    c.setFont(font, size)
    c.setFillColor(_hex(color))
    _set_char_space(c, char_space)
    c.drawCentredString(cx, y, text)
    _set_char_space(c, 0)


LABEL_TEXTS = {
    "ru": {
        "home_textile": "HOME TEXTILE",
        "slogan": "YOUR HOME — YOUR COMFORT",
        "scan": "SCAN TO VISIT OUR SHOP",
        "thanks": "Спасибо, что выбираете Farrux Shop!",
    },
    "uz": {
        "home_textile": "UY TEKSTILI",
        "slogan": "UYINGIZ — QULAYLIGINGIZ",
        "scan": "DO'KONIMIZGA O'TISH UCHUN SKANERLANG",
        "thanks": "Farrux Shopni tanlaganingiz uchun rahmat!",
    },
    "uzc": {
        "home_textile": "УЙ ТЕКСТИЛИ",
        "slogan": "УЙИНГИЗ — ҚУЛАЙЛИГИНГИЗ",
        "scan": "ДЎКОНИМИЗГА ЎТИШ УЧУН СКАНЕРЛАНГ",
        "thanks": "Farrux Shopни танлаганингиз учун раҳмат!",
    },
}


def label_texts(lang: str | None) -> dict:
    return LABEL_TEXTS.get((lang or "ru").lower(), LABEL_TEXTS["ru"])


def _draw_qr_panel(c, x, y, size, qr_reader):
    from reportlab.lib.units import mm

    c.setFillColor(_hex(WHITE))
    c.setStrokeColor(_hex(GOLD_SOFT))
    c.setLineWidth(0.35)
    c.roundRect(x, y, size, size, 2.2 * mm, stroke=1, fill=1)

    pad = 2.4 * mm
    c.drawImage(
        qr_reader,
        x + pad,
        y + pad,
        width=size - 2 * pad,
        height=size - 2 * pad,
        preserveAspectRatio=True,
        anchor="c",
        mask="auto",
    )


def _draw_frame(c, x, y, w, h, margin_mm):
    from reportlab.lib.units import mm

    m = max(1.5, float(margin_mm)) * mm
    c.setStrokeColor(_hex(GOLD))
    c.setLineWidth(0.55)
    c.roundRect(x + m, y + m, w - 2 * m, h - 2 * m, 2 * mm, stroke=1, fill=0)


def _draw_hangtag(c, x, y, w, h, qr_reader, fonts, margin_mm, texts=None):
    from reportlab.lib.units import mm

    texts = texts or label_texts("ru")
    regular, bold = fonts

    c.setFillColor(_hex(BLACK))
    c.rect(x, y, w, h, stroke=0, fill=1)
    _draw_frame(c, x, y, w, h, margin_mm)

    cx = x + w / 2

    # Отверстие под шнурок.
    hole_y = y + h - 7.0 * mm
    c.setFillColor(_hex(WHITE))
    c.setStrokeColor(_hex(GOLD_SOFT))
    c.setLineWidth(0.5)
    c.circle(cx, hole_y, 2.0 * mm, stroke=1, fill=1)

    _text_center(c, "FARRUX SHOP", cx, y + h - 14.0 * mm, bold, 9.6, GOLD, 0.7)
    _text_center(
        c, texts["home_textile"], cx, y + h - 18.0 * mm, regular, 5.0, WHITE, 1.3
    )

    c.setStrokeColor(_hex(GOLD))
    c.setLineWidth(0.5)
    c.line(x + 15 * mm, y + h - 21.0 * mm, x + w - 15 * mm, y + h - 21.0 * mm)

    _text_center(
        c,
        texts["slogan"],
        cx,
        y + h - 24.4 * mm,
        regular,
        4.1,
        GOLD_SOFT,
        0.35,
    )

    qr_size = min(w - 12 * mm, h - 44 * mm)
    qr_size = max(18 * mm, qr_size)
    qr_y = y + 16.5 * mm
    _draw_qr_panel(c, cx - qr_size / 2, qr_y, qr_size, qr_reader)

    _text_center(
        c, texts["scan"], cx, y + 11.2 * mm, bold, 4.9, WHITE, 0.45
    )
    _text_center(
        c,
        texts["thanks"],
        cx,
        y + 6.6 * mm,
        regular,
        4.0,
        GOLD_SOFT,
        0.1,
    )


def _draw_sticker(c, x, y, w, h, qr_reader, fonts, margin_mm, texts=None):
    from reportlab.lib.units import mm

    texts = texts or label_texts("ru")
    regular, bold = fonts

    c.setFillColor(_hex(MATTE))
    c.rect(x, y, w, h, stroke=0, fill=1)
    _draw_frame(c, x, y, w, h, margin_mm)

    cx = x + w / 2

    _text_center(c, "FARRUX SHOP", cx, y + h - 5.6 * mm, bold, 8.0, GOLD, 0.55)
    _text_center(
        c, texts["home_textile"], cx, y + h - 9.0 * mm, regular, 4.3, WHITE, 1.1
    )
    _text_center(
        c,
        texts["slogan"],
        cx,
        y + h - 12.0 * mm,
        regular,
        3.6,
        GOLD_SOFT,
        0.25,
    )

    qr_size = min(w - 14 * mm, h - 24 * mm)
    qr_size = max(16 * mm, qr_size)
    qr_y = y + 8.4 * mm
    _draw_qr_panel(c, cx - qr_size / 2, qr_y, qr_size, qr_reader)

    _text_center(
        c, texts["scan"], cx, y + 5.0 * mm, bold, 4.2, WHITE, 0.35
    )
    _text_center(
        c,
        texts["thanks"],
        cx,
        y + 2.6 * mm,
        regular,
        3.2,
        GOLD_SOFT,
        0,
    )


def _normalize_size(value, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(default)
    return max(20.0, min(number, 200.0))


def label_size(layout: str, width_mm=None, height_mm=None) -> tuple[float, float]:
    if layout == "sticker":
        width = _normalize_size(width_mm, settings.QR_STICKER_WIDTH_MM)
        height = _normalize_size(height_mm, settings.QR_STICKER_HEIGHT_MM)
    else:
        width = _normalize_size(width_mm, settings.QR_HANGTAG_WIDTH_MM)
        height = _normalize_size(height_mm, settings.QR_HANGTAG_HEIGHT_MM)
    return width, height


def build_label_pdf(
    layout: str = "hangtag",
    data: str | None = None,
    width_mm=None,
    height_mm=None,
    margin_mm=None,
    sheet: bool = False,
    lang: str = "ru",
) -> bytes:
    """PDF одной этикетки или листа A4 с сеткой этикеток."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    layout = "sticker" if layout == "sticker" else "hangtag"
    width, height = label_size(layout, width_mm, height_mm)
    margin = _normalize_size(margin_mm, settings.QR_LABEL_MARGIN_MM)
    margin = min(margin, min(width, height) / 4)

    qr_reader = ImageReader(BytesIO(generate_qr_png(data, box_size=18)))
    fonts = _register_label_fonts()
    texts = label_texts(lang)

    def draw_label(c, x, y, w, h):
        if layout == "sticker":
            _draw_sticker(c, x, y, w, h, qr_reader, fonts, margin, texts)
        else:
            _draw_hangtag(c, x, y, w, h, qr_reader, fonts, margin, texts)

    buffer = BytesIO()

    if not sheet:
        page_size = (width * mm, height * mm)
        c = canvas.Canvas(buffer, pagesize=page_size)
        c.setTitle("Farrux Shop QR label")
        c.setAuthor("Farrux Shop")
        draw_label(c, 0, 0, page_size[0], page_size[1])
        c.showPage()
        c.save()
        return buffer.getvalue()

    page_w, page_h = A4
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle("Farrux Shop QR labels sheet")
    c.setAuthor("Farrux Shop")

    outer = 8 * mm
    gap = 4 * mm
    label_w = width * mm
    label_h = height * mm

    cols = max(1, int((page_w - 2 * outer + gap) // (label_w + gap)))
    rows = max(1, int((page_h - 2 * outer + gap) // (label_h + gap)))
    total = cols * rows

    grid_w = cols * label_w + (cols - 1) * gap
    grid_h = rows * label_h + (rows - 1) * gap
    start_x = (page_w - grid_w) / 2
    start_y = (page_h + grid_h) / 2 - label_h

    for row in range(rows):
        for col in range(cols):
            x = start_x + col * (label_w + gap)
            y = start_y - row * (label_h + gap)
            draw_label(c, x, y, label_w, label_h)

    c.setFillColor(_hex("#777777"))
    c.setFont(fonts[0], 6)
    c.drawString(
        outer,
        4 * mm,
        (
            f"Farrux Shop QR • {width:g}×{height:g} мм • "
            f"{total} шт. на листе • печать 100% (без масштабирования)"
        ),
    )

    c.showPage()
    c.save()
    return buffer.getvalue()


def label_print_tip(layout: str, width_mm=None, height_mm=None) -> str:
    width, height = label_size(layout, width_mm, height_mm)
    return (
        f"Печать {width:g}×{height:g} мм, масштаб 100% (Actual size). "
        "Бумага: матовая самоклеящаяся или плотный картон 250–300 г/м²."
    )
