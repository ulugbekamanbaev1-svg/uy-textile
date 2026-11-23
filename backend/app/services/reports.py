from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from io import BytesIO, StringIO
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PERIOD_DAYS = {"day": 1, "week": 7, "month": 30}

PERIOD_LABELS = {
    "ru": {"day": "За день", "week": "За неделю", "month": "За месяц"},
    "uz": {"day": "Kunlik", "week": "Haftalik", "month": "Oylik"},
    "uzc": {"day": "Кунлик", "week": "Ҳафталик", "month": "Ойлик"},
}


def period_days(period: str) -> int:
    return PERIOD_DAYS.get(period, 30)


def period_label(period: str, lang: str = "ru") -> str:
    labels = PERIOD_LABELS.get(lang, PERIOD_LABELS["ru"])
    return labels.get(period, labels["month"])


def _money(value: int | float) -> str:
    return f"{int(round(value)):,}".replace(",", " ") + " so'm"


def _find_font() -> str | None:
    candidates = [
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return str(path)
    return None


def build_report_data(analytics: dict, period: str, lang: str = "ru") -> dict:
    today = date.today()
    days = period_days(period)
    start = today - timedelta(days=days - 1)
    return {
        "title": {
            "ru": "Отчёт магазина Farrux shop (Hozoosp)",
            "uz": "Farrux shop (Hozoosp) do'kon hisoboti",
            "uzc": "Farrux shop (Hozoosp) дўкон ҳисоби",
        }.get(lang, "Отчёт магазина Farrux shop (Hozoosp)"),
        "period": period_label(period, lang),
        "range": f"{start.isoformat()} — {today.isoformat()}",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "metrics": [
            ("Выручка" if lang == "ru" else "Tushum" if lang == "uz" else "Тушум", _money(analytics.get("revenue", 0))),
            ("Заказы" if lang == "ru" else "Buyurtmalar" if lang == "uz" else "Буюртмалар", str(analytics.get("orders", 0))),
            ("Средний чек" if lang == "ru" else "O'rtacha chek" if lang == "uz" else "Ўртача чек", _money(analytics.get("average_order", 0))),
            ("Себестоимость" if lang == "ru" else "Tannarx" if lang == "uz" else "Таннарх", _money(analytics.get("cost", 0))),
            ("Валовая прибыль" if lang == "ru" else "Yalpi foyda" if lang == "uz" else "Ялпи фойда", _money(analytics.get("gross_profit", 0))),
            ("Расходы" if lang == "ru" else "Xarajatlar" if lang == "uz" else "Харажатлар", _money(analytics.get("expenses", 0))),
            ("Чистая прибыль" if lang == "ru" else "Sof foyda" if lang == "uz" else "Соф фойда", _money(analytics.get("net_profit", 0))),
        ],
        "top_products": analytics.get("top_products", []),
        "product_profits": analytics.get("product_profits", []),
    }


def export_xlsx(analytics: dict, period: str, lang: str = "ru") -> bytes:
    data = build_report_data(analytics, period, lang)
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    title_font = Font(size=16, bold=True, color="FFFFFF")
    head_font = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="2E3A2F")
    light = PatternFill("solid", fgColor="F3F5EF")

    ws.merge_cells("A1:F1")
    cell = ws["A1"]
    cell.value = data["title"]
    cell.font = title_font
    cell.fill = fill
    cell.alignment = Alignment(horizontal="center")

    ws["A2"] = "Период" if lang == "ru" else "Davr" if lang == "uz" else "Давр"
    ws["B2"] = data["period"]
    ws["A3"] = "Диапазон" if lang == "ru" else "Oraliq" if lang == "uz" else "Оралиқ"
    ws["B3"] = data["range"]
    ws["A4"] = "Сформирован" if lang == "ru" else "Yaratilgan" if lang == "uz" else "Яратилган"
    ws["B4"] = data["generated_at"]

    ws.append([])
    ws.append(["Показатель" if lang == "ru" else "Ko'rsatkich" if lang == "uz" else "Кўрсаткич", "Значение" if lang == "ru" else "Qiymat" if lang == "uz" else "Қиймат"])
    for col, c in enumerate(ws[6], start=1):
        c.font = head_font
        c.fill = fill
    for name, value in data["metrics"]:
        ws.append([name, value])

    ws.append([])
    start_row = ws.max_row + 1
    headers = [
        "Товар" if lang == "ru" else "Mahsulot" if lang == "uz" else "Маҳсулот",
        "Продано" if lang == "ru" else "Sotilgan" if lang == "uz" else "Сотилган",
        "Выручка" if lang == "ru" else "Tushum" if lang == "uz" else "Тушум",
        "Себестоимость" if lang == "ru" else "Tannarx" if lang == "uz" else "Таннарх",
        "Валовая прибыль" if lang == "ru" else "Yalpi foyda" if lang == "uz" else "Ялпи фойда",
    ]
    ws.append(headers)
    for c in ws[start_row]:
        c.font = head_font
        c.fill = fill

    for i, p in enumerate(data["product_profits"]):
        row = [
            p.get(f"name_{lang}", p.get("name_ru", "")),
            p.get("quantity", 0),
            p.get("revenue", 0),
            p.get("cost", 0),
            p.get("profit", 0),
        ]
        ws.append(row)
        if i % 2 == 0:
            for cell in ws[ws.max_row]:
                cell.fill = light

    widths = [36, 14, 18, 18, 18, 18]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_pdf(analytics: dict, period: str, lang: str = "ru") -> bytes:
    data = build_report_data(analytics, period, lang)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    styles = getSampleStyleSheet()
    font_path = _find_font()

    font_name = "Helvetica"
    font_name_bold = "Helvetica-Bold"
    if font_path:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        try:
            pdfmetrics.registerFont(TTFont("AppSans", font_path))
            # try bold next to regular
            bold_path = font_path.replace("arial.ttf", "arialbd.ttf").replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
            if Path(bold_path).exists():
                pdfmetrics.registerFont(TTFont("AppSansBold", bold_path))
                font_name_bold = "AppSansBold"
            else:
                font_name_bold = "AppSans"
            font_name = "AppSans"
        except Exception:
            pass

    title_style = ParagraphStyle("T", parent=styles["Title"], fontName=font_name_bold, fontSize=18, leading=22, textColor=colors.HexColor("#2E3A2F"))
    normal = ParagraphStyle("N", parent=styles["Normal"], fontName=font_name, fontSize=10, leading=13)
    small = ParagraphStyle("S", parent=styles["Normal"], fontName=font_name, fontSize=9, leading=12, textColor=colors.HexColor("#555555"))

    story = [Paragraph(data["title"], title_style), Spacer(1, 4 * mm)]
    story.append(Paragraph(f"{data['period']} | {data['range']}", normal))
    story.append(Paragraph(data["generated_at"], small))
    story.append(Spacer(1, 5 * mm))

    metric_rows = [["Показатель" if lang == "ru" else "Ko'rsatkich" if lang == "uz" else "Кўрсаткич", "Значение" if lang == "ru" else "Qiymat" if lang == "uz" else "Қиймат"]]
    metric_rows += data["metrics"]
    mt = Table(metric_rows, colWidths=[90 * mm, 80 * mm])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E3A2F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTNAME", (0, 0), (-1, 0), font_name_bold),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F5EF")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D7DDD0")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(mt)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Популярные товары / Прибыль по товарам" if lang == "ru" else "Mahsulotlar bo'yicha foyda" if lang == "uz" else "Маҳсулотлар бўйича фойда", ParagraphStyle("H2", parent=styles["Heading3"], fontName=font_name_bold, fontSize=12, textColor=colors.HexColor("#2E3A2F"))))
    story.append(Spacer(1, 2 * mm))

    headers = [
        "Товар" if lang == "ru" else "Mahsulot" if lang == "uz" else "Маҳсулот",
        "Кол-во" if lang == "ru" else "Soni" if lang == "uz" else "Сони",
        "Выручка" if lang == "ru" else "Tushum" if lang == "uz" else "Тушум",
        "Прибыль" if lang == "ru" else "Foyda" if lang == "uz" else "Фойда",
    ]
    rows = [headers]
    for p in data["product_profits"][:20]:
        rows.append([
            Paragraph(str(p.get(f"name_{lang}", p.get("name_ru", "")))[:60], normal),
            str(round(float(p.get("quantity", 0)), 2)),
            _money(p.get("revenue", 0)),
            _money(p.get("profit", 0)),
        ])
    if len(rows) == 1:
        rows.append(["-", "0", _money(0), _money(0)])

    pt = Table(rows, colWidths=[78 * mm, 20 * mm, 36 * mm, 36 * mm])
    pt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E3A2F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTNAME", (0, 0), (-1, 0), font_name_bold),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F5EF")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D7DDD0")),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(pt)

    doc.build(story)
    return buf.getvalue()


def export_analytics_csv(analytics: dict, period: str, lang: str = "ru") -> bytes:
    """Экспорт аналитики в CSV: метрики + топ товаров."""
    data = build_report_data(analytics, period, lang)

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow([data["title"], ""])
    writer.writerow(["Период", data["period"]])
    writer.writerow(["Диапазон", data["range"]])
    writer.writerow(["Сформирован", data["generated_at"]])
    writer.writerow([])
    writer.writerow(["Показатель", "Значение"])
    for name, value in data["metrics"]:
        writer.writerow([name, value])
    writer.writerow([])
    writer.writerow(
        ["Товар", "Количество", "Выручка", "Прибыль"]
    )
    for p in data.get("product_profits", [])[:50]:
        writer.writerow(
            [
                p.get(f"name_{lang}", p.get("name_ru", "")),
                p.get("quantity", 0),
                p.get("revenue", 0),
                p.get("profit", 0),
            ]
        )

    return buffer.getvalue().encode("utf-8")


ORDER_HEADERS = {
    "ru": ["Номер", "Статус", "Клиент", "Телефон", "Сумма", "Дата"],
    "uz": ["Raqam", "Holat", "Mijoz", "Telefon", "Sum", "Sana"],
    "uzc": ["Рақам", "Ҳолат", "Мижоз", "Телефон", "Ҷум", "Сана"],
}


def orders_to_rows(orders: list, lang: str = "ru") -> list[list]:
    rows: list[list] = [ORDER_HEADERS.get(lang, ORDER_HEADERS["ru"])]

    for order in orders:
        rows.append(
            [
                order.number,
                order.status,
                order.customer_name or "",
                order.phone or "",
                int(order.total or 0),
                order.created_at.isoformat() if order.created_at else "",
            ]
        )

    return rows


def export_orders_xlsx(orders: list, lang: str = "ru") -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"

    head_font = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="2E3A2F")
    light = PatternFill("solid", fgColor="F3F5EF")

    ws.merge_cells("A1:F1")
    cell = ws["A1"]
    cell.value = "Заказы Farrux shop (Hozoosp)"
    cell.font = Font(size=16, bold=True, color="FFFFFF")
    cell.fill = fill
    cell.alignment = Alignment(horizontal="center")

    headers = ORDER_HEADERS.get(lang, ORDER_HEADERS["ru"])
    ws.append(headers)
    for c in ws[1]:
        c.font = head_font
        c.fill = fill

    for row in orders_to_rows(orders, lang)[1:]:
        ws.append(row)
        if ws.max_row % 2 == 0:
            for c in ws[ws.max_row]:
                c.fill = light

    for column, column_cells in enumerate(ws.columns, start=1):
        width = max(len(str(c.value or "")) for c in column_cells) + 2 if next(column_cells, None) is not None else 10
        ws.column_dimensions[get_column_letter(column)].width = min(width, 40)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_orders_pdf(orders: list, lang: str = "ru") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    styles = getSampleStyleSheet()
    font_path = _find_font()
    font_name = "Helvetica"
    font_name_bold = "Helvetica-Bold"
    if font_path:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        try:
            pdfmetrics.registerFont(TTFont("AppSans", font_path))
            bold_path = font_path.replace("arial.ttf", "arialbd.ttf").replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
            if Path(bold_path).exists():
                pdfmetrics.registerFont(TTFont("AppSansBold", bold_path))
                font_name_bold = "AppSansBold"
            font_name = "AppSans"
        except Exception:
            pass

    title_style = ParagraphStyle("T", parent=styles["Title"], fontName=font_name_bold, fontSize=16, leading=20, textColor=colors.HexColor("#2E3A2F"))
    normal = ParagraphStyle("N", parent=styles["Normal"], fontName=font_name, fontSize=9, leading=12)

    story = [Paragraph("Заказы Farrux shop (Hozoosp)", title_style), Spacer(1, 4 * mm)]
    headers = ORDER_HEADERS.get(lang, ORDER_HEADERS["ru"])
    rows = [headers]
    for row in orders_to_rows(orders, lang)[1:]:
        rows.append([str(v) for v in row])

    table = Table(rows, colWidths=[50 * mm, 30 * mm, 70 * mm, 40 * mm, 30 * mm, 40 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E3A2F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTNAME", (0, 0), (-1, -1), font_name_bold),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F5EF")]),
                ("GRID", (0, 0), (-1, 0), 0.25, colors.HexColor("#D7DDD0")),
                ("GRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#D7DDD0")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buf.getvalue()
