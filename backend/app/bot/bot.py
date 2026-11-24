
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

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.referral import attach_referral, ensure_user_referral_code, normalize_referral_code


# ==========================================
# TRANSLATIONS
# ==========================================

MESSAGES = {
    "ru": {
        "start_admin": (
            "Здравствуйте! Вы вошли как администратор Farrux shop (Hozorosp).\n\n"
            "Здесь будут уведомления о заказах, клиентах и доставке."
        ),
        "start_user": (
            "Добро пожаловать в Farrux shop (Hozorosp)!\n\n"
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
        "open_app": "Откройте магазин Farrux shop (Hozorosp):",
        "app_button": "Открыть магазин",
        "app_unavailable": (
            "Магазин пока недоступен как Mini App: нужен публичный "
            "HTTPS-адрес витрины (WEBAPP_URL в backend/.env)."
        ),
    },

    "uz": {
        "start_admin": (
            "Assalomu alaykum! Siz Farrux shop (Hozorosp) administratori sifatida kirdingiz.\n\n"
            "Bu yerda buyurtmalar, mijozlar va yetkazib berish bo'yicha "
            "bildirishnomalar bo'ladi."
        ),
        "start_user": (
            "Farrux shop (Hozorosp)'ga xush kelibsiz!\n\n"
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
        "open_app": "Farrux shop (Hozorosp) do'konini oching:",
        "app_button": "Do'konni ochish",
        "app_unavailable": (
            "Do'kon hozircha Mini App sifatida mavjud emas: vitrina uchun "
            "ochiq HTTPS manzil kerak (backend/.env da WEBAPP_URL)."
        ),
    },

    "uzc": {
        "start_admin": (
            "Ассалому алайкум! Сиз Farrux shop (Hozorosp) администратори сифатида кирдингиз.\n\n"
            "Бу ерда буюртмалар, мижозлар ва етказиб бериш бўйича "
            "билдиришномалар бўлади."
        ),
        "start_user": (
            "Farrux shop (Hozorosp)'га хуш келибсиз!\n\n"
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
        "open_app": "Farrux shop (Hozorosp) дўконини очинг:",
        "app_button": "Дўконни очиш",
        "app_unavailable": (
            "Дўкон ҳозирча Mini App сифатида мавжуд эмас: витрина учун "
            "очиқ HTTPS манзил керак (backend/.env да WEBAPP_URL)."
        ),
    },
}


# ==========================================
# USER LANGUAGES
# ==========================================

user_languages: dict[int, str] = {}


def resolve_language(update: Update) -> str:
    chat = update.effective_chat
    telegram_user = update.effective_user

    if chat and chat.id in user_languages:
        return user_languages[chat.id]

    code = (telegram_user.language_code or "").lower()

    if code.startswith("uz"):
        return "uz"

    return "ru"


# ==========================================
# ADMIN CHECK
# ==========================================

def is_admin(update: Update) -> bool:
    telegram_user = update.effective_user

    return bool(
        telegram_user
        and settings.ADMIN_TELEGRAM_ID
        and str(telegram_user.id) == str(settings.ADMIN_TELEGRAM_ID)
    )


# ==========================================
# MINI APP URL
# ==========================================

def webapp_url() -> str:
    return (
        settings.WEBAPP_URL or settings.FRONTEND_URL
    ).rstrip("/")


def webapp_ready() -> bool:
    return webapp_url().startswith("https://")


# ==========================================
# REGISTER TELEGRAM USER
# ==========================================

async def register_user(telegram_user):
    async for db in get_db():

        try:
            result = await db.execute(
                select(User).where(
                    User.telegram_id == telegram_user.id
                )
            )

            user = result.scalar_one_or_none()

            if user is None:

                user = User(
                    telegram_id=telegram_user.id,
                    first_name=telegram_user.first_name or "",
                    last_name=telegram_user.last_name or "",
                    username=telegram_user.username,
                    language_code=telegram_user.language_code,
                )

                db.add(user)

                await db.commit()

                print(
                    f"NEW USER REGISTERED: {telegram_user.id}",
                    flush=True,
                )

            else:

                user.first_name = telegram_user.first_name or ""
                user.last_name = telegram_user.last_name or ""
                user.username = telegram_user.username
                user.language_code = telegram_user.language_code

                await db.commit()

                print(
                    f"EXISTING USER UPDATED: {telegram_user.id}",
                    flush=True,
                )

        except IntegrityError:

            await db.rollback()

            print(
                f"USER ALREADY REGISTERED: {telegram_user.id}",
                flush=True,
            )


# ==========================================
# MINI APP MENU BUTTON
# ==========================================

async def post_init(application):

    if not webapp_ready():

        print(
            "Mini App menu button skipped: HTTPS URL required.",
            flush=True,
        )

        return

    await application.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Farrux shop (Hozorosp)",
            web_app=WebAppInfo(url=webapp_url()),
        )
    )

    print(
        f"Mini App menu button set: {webapp_url()}",
        flush=True,
    )


# ==========================================
# START COMMAND
# ==========================================

async def _attach_referral_from_start(telegram_user, arg: str) -> None:
    code = (arg or "").strip()
    if code.lower().startswith("ref_"):
        code = code[4:]
    code = normalize_referral_code(code)
    if not code:
        return

    async for db in get_db():
        try:
            result = await db.execute(select(User).where(User.telegram_id == telegram_user.id))
            user = result.scalar_one_or_none()
            if user is None:
                return
            await ensure_user_referral_code(db, user)
            await attach_referral(db, referred_user=user, referral_code=code)
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"REFERRAL ATTACH ERROR: {e}", flush=True)
        finally:
            break


async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    if update.message is None or update.effective_user is None:
        return

    try:

        await register_user(update.effective_user)

    except Exception as error:

        print(
            f"USER REGISTRATION ERROR: {error}",
            flush=True,
        )

        await update.message.reply_text(
            "Произошла ошибка регистрации. Попробуйте позже."
        )

        return

    # Deep link: /start ref_CODE
    if context.args:
        try:
            await _attach_referral_from_start(update.effective_user, context.args[0])
        except Exception as e:
            print(f"REFERRAL START ERROR: {e}", flush=True)

    lang = resolve_language(update)

    key = (
        "start_admin"
        if is_admin(update)
        else "start_user"
    )

    await update.message.reply_text(
        MESSAGES[lang][key]
    )


# ==========================================
# SHOW TELEGRAM ID
# ==========================================

async def show_id(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    if update.message is None:
        return

    lang = resolve_language(update)

    await update.message.reply_text(
        MESSAGES[lang]["your_id"].format(
            user_id=update.effective_user.id
        )
    )


# ==========================================
# LANGUAGE HELP
# ==========================================

async def language_help(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    if update.message is None:
        return

    lang = resolve_language(update)

    await update.message.reply_text(
        MESSAGES[lang]["language_help"]
    )


# ==========================================
# CHANGE LANGUAGE
# ==========================================

async def set_language(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    lang: str,
):

    if update.message is None:
        return

    user_languages[update.effective_chat.id] = lang

    await update.message.reply_text(
        MESSAGES[lang]["language_set"]
    )


async def set_ru(update, context):
    await set_language(update, context, "ru")


async def set_uz(update, context):
    await set_language(update, context, "uz")


async def set_uzc(update, context):
    await set_language(update, context, "uzc")


# ==========================================
# OPEN STORE
# ==========================================

async def open_store(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    if update.message is None:
        return

    lang = resolve_language(update)

    if not webapp_ready():

        await update.message.reply_text(
            MESSAGES[lang]["app_unavailable"]
        )

        return

    await update.message.reply_text(
        MESSAGES[lang]["open_app"],

        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        MESSAGES[lang]["app_button"],
                        web_app=WebAppInfo(
                            url=webapp_url()
                        ),
                    )
                ]
            ]
        ),
    )


# ==========================================
# MAIN APPLICATION
# ==========================================

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

    # Commands

    application.add_handler(
        CommandHandler("start", start)
    )

    application.add_handler(
        CommandHandler("app", open_store)
    )

    application.add_handler(
        CommandHandler("id", show_id)
    )

    application.add_handler(
        CommandHandler("lang", language_help)
    )

    application.add_handler(
        CommandHandler("ru", set_ru)
    )

    application.add_handler(
        CommandHandler("uz", set_uz)
    )

    application.add_handler(
        CommandHandler("uzc", set_uzc)
    )

    await application.initialize()

    await post_init(application)

    await application.start()

    await application.updater.start_polling()

    print(
        "Farrux shop (Hozorosp) Telegram Bot is running...",
        flush=True,
    )

    try:

        await asyncio.Event().wait()

    finally:

        await application.updater.stop()

        await application.stop()

        await application.shutdown()


# ==========================================
# RUN BOT
# ==========================================

if __name__ == "__main__":
    asyncio.run(main())
