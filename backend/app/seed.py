from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models import Category, Product, ProductColor, ProductVariant

CATEGORIES = [
    ("pillows", "Наволочки", "Yostiq jildlari", "Ёстиқ жилдлари", 1),
    ("sheets", "Простыни", "Choyshablar", "Чойшаблар", 2),
    ("sets", "Комплекты", "To'plamlar", "Тўпламлар", 3),
    ("fabrics", "Ткани", "Matolar", "Матолар", 4),
    ("duvets", "Пододеяльники", "Ko'rpa jildlari", "Кўрпа жилдлари", 5),
    ("custom", "Индивидуальный заказ", "Individual buyurtma", "Индивидуал буюртма", 6),
]

COTTON = ("100% хлопок", "100% paxta", "100% пахта")
SATIN = ("Сатин", "Satin", "Сатин")
LINEN = ("Лён 55% / хлопок 45%", "Zig'ir 55% / paxta 45%", "Зиғир 55% / пахта 45%")
CUSTOM_MATERIAL = ("На выбор", "Tanlov bo'yicha", "Танлов бўйича")

PRODUCTS = [
    {
        "slug": "pillow-classic",
        "category": "pillows",
        "names": ("Наволочка «Классик»", "«Klassik» yostiq jildi", "«Классик» ёстиқ жилди"),
        "descriptions": (
            "Мягкая наволочка из плотного хлопка с аккуратными швами и скрытой застёжкой.",
            "Zich paxtadan tayyorlangan yumshoq yostiq jildi, toza tikuv va yashirin yopilish bilan.",
            "Зич пахтадан тайёрланган юмшоқ ёстиқ жилди, тоза тикув ва яширин ёпилиш билан.",
        ),
        "materials": COTTON,
        "image": "/static/products/pillow-classic.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": True,
        "variants": [("50×70 см", 50, 70, 89000), ("70×70 см", 70, 70, 109000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Серый", "Kulrang", "Кулранг", "#a8a69f"),
        ],
    },
    {
        "slug": "pillow-satin",
        "category": "pillows",
        "names": ("Наволочка «Сатин»", "«Satin» yostiq jildi", "«Сатин» ёстиқ жилди"),
        "descriptions": (
            "Гладкая сатиновая наволочка с лёгким блеском. Приятная прохлада и уход как за шёлком.",
            "Yengil yaltiroq silliq satin yostiq jildi. Yoqimli salqinlik va ipakdek parvarish.",
            "Енгил ялтироқ силлиқ сатин ёстиқ жилди. Ёқимли салқинлик ва ипакдек парвариш.",
        ),
        "materials": SATIN,
        "image": "/static/products/pillow-classic.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("50×70 см", 50, 70, 129000), ("70×70 см", 70, 70, 149000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Пудровый", "Pudra", "Пудра", "#e5c9c2"),
            ("Изумрудный", "Zumrad", "Зумрад", "#5f7d6d"),
        ],
    },
    {
        "slug": "sheet-comfort",
        "category": "sheets",
        "names": ("Простыня «Комфорт»", "«Komfort» choyshab", "«Комфорт» чойшаб"),
        "descriptions": (
            "Гладкая простыня из 100% хлопка. Легко стирается, не теряет форму и приятна к телу.",
            "100% paxtadan silliq choyshab. Oson yuviladi, shaklini yo'qotmaydi va tanaga yoqimli.",
            "100% пахтадан силлиқ чойшаб. Осон ювилади, шаклини йўқотмайди ва танга ёқимли.",
        ),
        "materials": COTTON,
        "image": "/static/products/sheet-comfort.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": True,
        "variants": [("160×200 см", 160, 200, 189000), ("180×220 см", 180, 220, 219000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Салатовый", "Och yashil", "Оч яшил", "#a9b79a"),
        ],
    },
    {
        "slug": "sheet-satin",
        "category": "sheets",
        "names": ("Простыня «Сатин»", "«Satin» choyshab", "«Сатин» чойшаб"),
        "descriptions": (
            "Сатиновая простыня с шелковистой поверхностью. Выглядит нарядно и служит долго.",
            "Ipakdek sirtli satin choyshab. Chiroyli ko'rinadi va uzoq xizmat qiladi.",
            "Ипакдек сиртли сатин чойшаб. Чиройли кўринади ва узоқ хизмат қилади.",
        ),
        "materials": SATIN,
        "image": "/static/products/sheet-comfort.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("160×200 см", 160, 200, 249000), ("200×220 см", 200, 220, 299000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Серый", "Kulrang", "Кулранг", "#a8a69f"),
            ("Синий", "Ko'k", "Кўк", "#7d93a8"),
        ],
    },
    {
        "slug": "set-family",
        "category": "sets",
        "names": ("Комплект «Семейный»", "«Oilaviy» to'plam", "«Оилавий» тўплам"),
        "descriptions": (
            "Комплект из 4 предметов: пододеяльник, простыня и две наволочки в одной расцветке.",
            "4 qismli to'plam: ko'rpa jildi, choyshab va bir xil rangdagi ikkita yostiq jildi.",
            "4 қисмли тўплам: кўрпа жилди, чойшаб ва бир хил рангдаги иккита ёстиқ жилди.",
        ),
        "materials": COTTON,
        "image": "/static/products/set-family.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": True,
        "variants": [("160×200 см", 160, 200, 690000), ("180×220 см", 180, 220, 790000)],
        "colors": [
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Зелёный", "Yashil", "Яшил", "#8a9a86"),
            ("Терракотовый", "Terrakota", "Терракота", "#b97862"),
        ],
    },
    {
        "slug": "set-premium",
        "category": "sets",
        "names": ("Комплект «Премиум»", "«Premium» to'plam", "«Премиум» тўплам"),
        "descriptions": (
            "Премиальный сатиновый комплект с плотной тканой структурой и красивой упаковкой.",
            "Zich to'qima tuzilishli va chiroyli qadoqli premium satin to'plam.",
            "Зич тўқима тузилишли ва чиройли қадоқли премиум сатин тўплам.",
        ),
        "materials": SATIN,
        "image": "/static/products/set-family.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("180×220 см", 180, 220, 990000), ("200×220 см", 200, 220, 1090000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Графитовый", "Grafit", "Графит", "#4a4a45"),
            ("Пудровый", "Pudra", "Пудра", "#e5c9c2"),
        ],
    },
    {
        "slug": "fabric-poplin",
        "category": "fabrics",
        "names": ("Ткань «Поплин»", "«Poplin» mato", "«Поплин» мато"),
        "descriptions": (
            "Плотный поплин шириной 220 см. Продаётся на метраж, отрежем нужную длину.",
            "Kengligi 220 sm bo'lgan zich poplin. Metrlab sotiladi, kerakli uzunlikni kesamiz.",
            "Кенглиги 220 см бўлган зич поплин. Метрлаб сотилади, керакли узунликни кесамиз.",
        ),
        "materials": COTTON,
        "image": "/static/products/fabric-poplin.svg",
        "pricing": "meter",
        "price_per_m2": None,
        "custom": False,
        "featured": True,
        "variants": [("Ширина 220 см", 220, None, 45000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Голубой", "Moviy", "Мовий", "#a9c0cf"),
        ],
    },
    {
        "slug": "fabric-satin",
        "category": "fabrics",
        "names": ("Ткань «Сатин»", "«Satin» mato", "«Сатин» мато"),
        "descriptions": (
            "Сатиновая ткань шириной 240 см с мягким блеском. Для постельного белья и наволочек.",
            "Yumshoq yaltiroq, kengligi 240 sm bo'lgan satin mato. Choyshab va yostiq jildlari uchun.",
            "Юмшоқ ялтироқ, кенглиги 240 см бўлган сатин мато. Чойшаб ва ёстиқ жилдлари учун.",
        ),
        "materials": SATIN,
        "image": "/static/products/fabric-poplin.svg",
        "pricing": "meter",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("Ширина 240 см", 240, None, 65000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Пудровый", "Pudra", "Пудра", "#e5c9c2"),
            ("Изумрудный", "Zumrad", "Зумрад", "#5f7d6d"),
        ],
    },
    {
        "slug": "duvet-premium",
        "category": "duvets",
        "names": ("Пододеяльник «Премиум»", "«Premium» ko'rpa jildi", "«Премиум» кўрпа жилди"),
        "descriptions": (
            "Пододеяльник из сатина с потайной молнией. Мягкий, прочный и не скользит.",
            "Yashirin zamokli satin ko'rpa jildi. Yumshoq, mustahkam va sirg'anmaydi.",
            "Яширин замокли сатин кўрпа жилди. Юмшоқ, мустаҳкам ва сирғанмайди.",
        ),
        "materials": SATIN,
        "image": "/static/products/duvet-premium.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("180×215 см", 180, 215, 349000), ("200×220 см", 200, 220, 389000)],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Серый", "Kulrang", "Кулранг", "#a8a69f"),
        ],
    },
    {
        "slug": "duvet-linen",
        "category": "duvets",
        "names": ("Пододеяльник «Лён»", "«Zig'ir» ko'rpa jildi", "«Зиғир» кўрпа жилди"),
        "descriptions": (
            "Пододеяльник из смеси льна и хлопка. Дышит, регулирует температуру и красиво драпируется.",
            "Zig'ir va paxta aralashmasidan ko'rpa jildi. Havo o'tkazadi, haroratni boshqaradi va chiroyli tushadi.",
            "Зиғир ва пахта аралашмасидан кўрпа жилди. Ҳаво ўтказади, ҳароратни бошқаради ва чиройли тушади.",
        ),
        "materials": LINEN,
        "image": "/static/products/duvet-premium.svg",
        "pricing": "piece",
        "price_per_m2": None,
        "custom": False,
        "featured": False,
        "variants": [("180×215 см", 180, 215, 429000), ("200×220 см", 200, 220, 479000)],
        "colors": [
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Оливковый", "Zaytun", "Зайтун", "#8d9277"),
        ],
    },
    {
        "slug": "custom-sewing",
        "category": "custom",
        "names": (
            "Пошив по вашим размерам",
            "O'lchamingiz bo'yicha tikuv",
            "Ўлчамингиз бўйича тикув",
        ),
        "descriptions": (
            "Сошьём наволочки, простыни или комплект по вашим размерам. Укажите ширину и высоту в сантиметрах — цена рассчитается автоматически.",
            "Yostiq jildlari, choyshab yoki to'plamni o'lchamingiz bo'yicha tikamiz. Kenglik va balandlikni santimetrda kiriting — narx avtomatik hisoblanadi.",
            "Ёстиқ жилдлари, чойшаб ёки тўпламни ўлчамингиз бўйича тикамиз. Кенглик ва баландликни сантиметрда киритинг — нарх автоматик ҳисобланади.",
        ),
        "materials": CUSTOM_MATERIAL,
        "image": "/static/products/custom-tailoring.svg",
        "pricing": "area",
        "price_per_m2": 120000,
        "custom": True,
        "featured": False,
        "variants": [],
        "colors": [
            ("Белый", "Oq", "Оқ", "#f6f2e9"),
            ("Бежевый", "Bej", "Беж", "#d9c7ad"),
            ("Зелёный", "Yashil", "Яшил", "#8a9a86"),
            ("Терракотовый", "Terrakota", "Терракота", "#b97862"),
        ],
    },
]


async def seed_data():
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(
            select(func.count()).select_from(Category)
        )

        if existing:
            return

        categories = {}

        for slug, name_ru, name_uz, name_uzc, sort_order in CATEGORIES:
            category = Category(
                slug=slug,
                name_ru=name_ru,
                name_uz=name_uz,
                name_uzc=name_uzc,
                sort_order=sort_order,
            )
            session.add(category)
            categories[slug] = category

        await session.flush()

        for item in PRODUCTS:
            product = Product(
                category_id=categories[item["category"]].id,
                slug=item["slug"],
                name_ru=item["names"][0],
                name_uz=item["names"][1],
                name_uzc=item["names"][2],
                description_ru=item["descriptions"][0],
                description_uz=item["descriptions"][1],
                description_uzc=item["descriptions"][2],
                material_ru=item["materials"][0],
                material_uz=item["materials"][1],
                material_uzc=item["materials"][2],
                image_url=item["image"],
                pricing_type=item["pricing"],
                price_per_m2=item["price_per_m2"],
                custom_size_allowed=item["custom"],
                is_featured=item["featured"],
            )

            for index, (label, width, height, price) in enumerate(item["variants"]):
                product.variants.append(
                    ProductVariant(
                        label=label,
                        width_cm=width,
                        height_cm=height,
                        price=price,
                        sort_order=index,
                    )
                )

            for index, (name_ru, name_uz, name_uzc, hex_value) in enumerate(
                item["colors"]
            ):
                product.colors.append(
                    ProductColor(
                        name_ru=name_ru,
                        name_uz=name_uz,
                        name_uzc=name_uzc,
                        hex=hex_value,
                        sort_order=index,
                    )
                )

            session.add(product)

        await session.commit()
        print(f"Seeded {len(PRODUCTS)} products", flush=True)
