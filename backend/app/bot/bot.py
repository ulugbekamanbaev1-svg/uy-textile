import asyncio

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)

from app.config import settings

MESSAGES = {
    "ru": {
        "start_admin": (
            "Здравствуйте! Вы вошли как администратор Farrux shop (Hozoosp).\n\n"
            "Здесь будут уведомления о заказах, клиентах и доставке."
        ),
        "start_user": (
            "Добро пожаловать в Farrux shop (Hozoosp)!\n\n"
            "Наш магазин домашнего текстиля скоро откроется."
        ),
        "your_id": "Ваш Telegram ID: {user_id}",
        "language_set": "Язык переключён на русский.",
        "language_help": (
            "Выберите язык бота:\n"
            "/ru — русский\n"
            "/uz — o'zbekcha (lotin)\n"
            "/uzc — ўзбекча (кирилл)"
        ),
        "open_app": "Откройте магазин Farrux shop (Hozoosp):",
        "app_button": "Открыть магазин",
        "app_unavailable": (
            "Магазин пока недоступен как Mini App: нужен публичный "
            "HTTPS-адрес витрины (WEBAPP_URL в backend/.env)."
        ),
    },
    "uz": {
        "start_admin": (
            "Assalomu alaykum! Siz Farrux shop (Hozoosp) administratori sifatida kirdingiz.\n\n"
            "Bu yerda buyurtmalar, mijozlar va yetkazib berish bo'yicha "
            "bildirishnomalar bo'ladi."
        ),
        "start_user": (
            "Farrux shop (Hozoosp)'ga xush kelibsiz!\n\n"
            "Uy tekstili do'konimiz tez orada ochiladi."
        ),
        "your_id": "Sizning Telegram ID: {user_id}",
        "language_set": "Til o'zbek tiliga (lotin) o'zgartirildi.",
        "language_help": (
            "Bot tilini tanlang:\n"
            "/ru — ruscha\n"
            "/uz — o'zbekcha (lotin)\n"
            "/uzc — o'zbekcha (kirill)"
        ),
        "open_app": "Farrux shop (Hozoosp) do'konini oching:",
        "app_button": "Do'konni ochish",
        "app_unavailable": (
            "Do'kon hozircha Mini App sifatida mavjud emas: vitrina uchun "
            "ochiq HTTPS manzil kerak (backend/.env da WEBAPP_URL)."
        ),
    },
    "uzc": {
        "start_admin": (
            "Ассалому алайкум! Сиз Farrux shop (Hozoosp) администратори сифатида кирдингиз.\n\n"
            "Бу ерда буюртмалар, мижозлар ва етказиб бериш бўйича "
            "билдиришномалар бўлади."
        ),
        "start_user": (
            "Farrux shop (Hozoosp)'га хуш келибсиз!\n\n"
            "Уй текстили дўконимиз тез орада очилади."
        ),
        "your_id": "Сизнинг Telegram ID: {user_id}",
        "language_set": "Тил ўзбек тилига (кирилл) ўзгартирилди.",
        "language_help": (
            "Бот тилини танланг:\n"
            "/ru — русча\n"
            "/uz — ўзбекча (лотин)\n"
            "/uzc — ўзбекча (кирилл)"
        ),
        "open_app": "Farrux shop (Hozoosp) дўконини очинг:",
        "app_button": "Дўконни очиш",
        "app_unavailable": (
            "Дўкон ҳозирча Mini App сифатида мавжуд эмас: витрина учун "
            "очиқ HTTPS манзил керак (backend/.env да WEBAPP_URL)."
        ),
    },
}

user_languages: dict[int, str] = {}


def resolve_language(update: Update) -> str:
    chat_id = update.effective_chat.id

    if chat_id in user_languages:
        return user_languages[chat_id]

    code = (update.effective_user.language_code or "").lower()

    if code.startswith("uz"):
        return "uz"

    return "ru"


def is_admin(update: Update) -> bool:
    return bool(
        settings.ADMIN_TELEGRAM_ID
        and str(update.effective_user.id) == settings.ADMIN_TELEGRAM_ID
    )


def webapp_url() -> str:
    return (settings.WEBAPP_URL or settings.FRONTEND_URL).rstrip("/")


def webapp_ready() -> bool:
    """Telegram открывает Mini App только по HTTPS."""
    return webapp_url().startswith("https://")


async def post_init(application) -> None:
    if not webapp_ready():
        print(
            "Mini App menu button skipped: WEBAPP_URL/FRONTEND_URL "
            "must use HTTPS.",
            flush=True,
        )
        return

    await application.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Farrux shop (Hozoosp)",
            web_app=WebAppInfo(url=webapp_url()),
        )
    )
    print(f"Mini App menu button set to {webapp_url()}", flush=True)


async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    if update.message is None:
        return

    lang = resolve_language(update)
    key = "start_admin" if is_admin(update) else "start_user"

    await update.message.reply_text(MESSAGES[lang][key])


async def show_id(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    if update.message is None:
        return

    lang = resolve_language(update)

    await update.message.reply_text(
        MESSAGES[lang]["your_id"].format(user_id=update.effective_user.id)
    )


async def language_help(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    if update.message is None:
        return

    lang = resolve_language(update)

    await update.message.reply_text(MESSAGES[lang]["language_help"])


async def set_language(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    lang: str,
):
    if update.message is None:
        return

    user_languages[update.effective_chat.id] = lang

    await update.message.reply_text(MESSAGES[lang]["language_set"])


async def set_ru(update, context):
    await set_language(update, context, "ru")


async def set_uz(update, context):
    await set_language(update, context, "uz")


async def set_uzc(update, context):
    await set_language(update, context, "uzc")


async def open_store(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    if update.message is None:
        return

    lang = resolve_language(update)

    if not webapp_ready():
        await update.message.reply_text(MESSAGES[lang]["app_unavailable"])
        return

    await update.message.reply_text(
        MESSAGES[lang]["open_app"],
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        MESSAGES[lang]["app_button"],
                        web_app=WebAppInfo(url=webapp_url()),
                    )
                ]
            ]
        ),
    )


async def main():
    if not settings.BOT_TOKEN:
        raise RuntimeError(
            "BOT_TOKEN is missing in backend/.env"
        )

    application = (
        ApplicationBuilder()
        .token(settings.BOT_TOKEN)
        .build()
    )

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("app", open_store))
    application.add_handler(CommandHandler("id", show_id))
    application.add_handler(CommandHandler("lang", language_help))
    application.add_handler(CommandHandler("ru", set_ru))
    application.add_handler(CommandHandler("uz", set_uz))
    application.add_handler(CommandHandler("uzc", set_uzc))

    await application.initialize()
    # Application.initialize() не вызывает post_init при ручном запуске —
    # вызываем сами, иначе кнопка Mini App не установится.
    await post_init(application)
    await application.start()
    await application.updater.start_polling()

    print("Farrux shop (Hozoosp) Telegram Bot is running...", flush=True)

    try:
        await asyncio.Event().wait()
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
