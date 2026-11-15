# Uy Textile

Магазин домашнего текстиля: Telegram Mini App для покупателей, отдельная
админ-панель и API на FastAPI. Этапы 1–5: основа проекта, каталог с корзиной,
оформление заказа с уведомлением в Telegram, управление товарами, карта
доставки, защита админки, клиенты, аналитика и настройки магазина.

## Что уже есть

- `frontend/` — React-приложение покупателя (порт 5173)
- `admin/` — React-панель владельца (порт 5174)
- `backend/` — FastAPI + SQLAlchemy + PostgreSQL (порт 8000)
- `backend/app/bot/` — Telegram-бот для уведомлений
- `docker-compose.yml` — PostgreSQL в Docker (для сервера)

Проверено на этом компьютере:

- Python 3.12.10, Node.js 26, Git
- PostgreSQL 17.12 развёрнут локально в `.postgres/` (Docker на компьютере
  не установлен, поэтому используется переносимый вариант)
- база `uytextile`, пользователь `uytextile_user`
- таблицы `users`, `categories`, `products`, `product_variants`,
  `product_colors`, `orders`, `order_items`, `store_settings` создаются
  автоматически при старте backend

## Каталог (этап 2)

- 6 категорий и 11 демо-товаров с названиями и описаниями на трёх языках
- карточки товаров с фото, ценой и категорией
- страница товара: описание, материал, размеры, цвета, количество
- калькулятор индивидуального пошива: ширина и высота в см,
  цена считается по площади (м²)
- корзина с количеством и суммой, хранится в браузере (localStorage)
- избранное
- оформление заказа: имя, телефон, адрес, комментарий, геолокация
- уведомление о новом заказе приходит в Telegram владельцу
- админка: реальная статистика, таблица товаров с поиском, заказы
  с составом, телефоном, адресом, картой и сменой статуса
- управление товарами: добавление, редактирование, удаление, загрузка фото
- карта доставки со всеми заказами и геометками
- клиенты: количество заказов, сумма покупок и последний заказ
- аналитика: выручка, средний чек, продажи по дням и топ товаров
- настройки магазина: контакты и условия, видны покупателям в профиле
- админские эндпоинты закрыты проверкой Telegram ID владельца
- бот открывает магазин как Mini App (кнопка меню и команда `/app`)

Демо-данные создаются один раз при первом запуске backend (`seed.py`).
Чтобы загрузить их заново, удалите таблицы `categories` и `products`
(связанные `product_variants` и `product_colors` удалятся каскадно)
и перезапустите backend — сиды добавятся снова.

Фото товаров лежат в `backend/app/static/products/` и отдаются по адресу
`/static/products/<имя>.svg`. Новые фотографии загружаются из админки
и сохраняются в `backend/app/static/uploads/`.

### API каталога

- `GET /api/catalog/categories` — категории с количеством товаров
- `GET /api/catalog/products` — список товаров
  (`?category=slug`, `?search=текст`, `?featured=true`)
- `GET /api/catalog/products/{slug}` — товар с размерами и цветами
- `GET /api/admin/summary` — статистика для админки
- `GET /api/admin/products` — все товары для админки
- `GET /static/products/...` — изображения

Админские эндпоинты требуют Telegram-авторизацию владельца; подробности
в разделе «Защита админки».

## Заказы (этап 3)

Покупатель заполняет имя, телефон, адрес и комментарий, при желании
прикрепляет геопозицию. Цены пересчитываются на сервере заново, поэтому
изменить сумму в браузере нельзя.

После оформления:

- заказ сохраняется в таблицах `orders` и `order_items`;
- покупатель видит номер заказа (например, `UY-00001`);
- владельцу приходит сообщение в Telegram с составом, телефоном,
  адресом и ссылкой на карту;
- заказ появляется в админке в разделе «Заказы».

Статусы заказа: `new` → `confirmed` → `delivering` → `done`,
а также `cancelled`. Статус меняется прямо в карточке заказа.

Оплата — при получении (наличными курьеру).

### API заказов

- `POST /api/orders` — создать заказ
- `GET /api/admin/orders` — список заказов
  (`?status=new` для фильтра)
- `PATCH /api/admin/orders/{id}/status` — сменить статус

Уведомления отправляются, если в `backend/.env` заполнены `BOT_TOKEN`
и `ADMIN_TELEGRAM_ID`. Если их нет, заказ всё равно сохраняется.

## Управление товарами (этап 4)

В админке раздел «Товары» → кнопка «Добавить товар». В форме можно:

- загрузить фото (JPG, PNG, WEBP, GIF, до 5 МБ) или указать ссылку;
- заполнить название, описание и материал на RU / UZ / ЎЗ;
- выбрать категорию и тип цены: за штуку, за метр или за м²;
- добавить размеры (название, ширина, высота, цена);
- добавить цвета с названиями на трёх языках и HEX-кодом;
- отметить товар как популярный, скрытый или с индивидуальным размером.

Фото сохраняются в `backend/app/static/uploads/` и отдаются по адресу
`/static/uploads/<файл>`. При удалении товара или замене фото файл
удаляется автоматически.

Кнопки в строке товара: «Изменить» (карандаш) и «Удалить» (корзина).
Удаление спрашивает подтверждение.

### API управления товарами

- `GET /api/admin/categories` — категории для формы
- `GET /api/admin/products/{id}` — товар со всеми размерами и цветами
- `POST /api/admin/products` — создать товар
- `PATCH /api/admin/products/{id}` — обновить товар
- `DELETE /api/admin/products/{id}` — удалить товар
- `POST /api/admin/uploads` — загрузить фото (multipart, поле `file`)

Если поле `slug` оставить пустым, сервер создаст ссылку вида
`product-1a2b3c4d`. Существующий slug изменить можно, но он должен быть
уникальным.

## Карта доставки (этап 4)

Раздел «Карта доставки» показывает заказы с геолокацией на карте
OpenStreetMap: маркеры с номером заказа, составом, телефоном, адресом
и суммой. Заказы без координат собраны отдельным списком «Без геолокации».
Нажатие на заказ в списке приближает карту к его точке.

## Защита админки (этап 4)

Все `/api/admin/*` требуют заголовок `X-Telegram-Init-Data` с подписанными
данными Telegram. Сервер проверяет подпись и сверяет Telegram ID со
списком `ADMIN_TELEGRAM_ID` (несколько ID можно указать через запятую).

В разработке админка открывается в обычном браузере без Telegram:

```dotenv
APP_ENV=development
ADMIN_DEV_BYPASS=true
```

В production (`APP_ENV=production`) обход всегда выключен, даже если
`ADMIN_DEV_BYPASS=true`. Админку нужно открывать внутри Telegram от
аккаунта владельца.

## Клиенты (этап 5)

Раздел «Клиенты» собирается из заказов: телефон — основной ключ. Для
каждого покупателя видно имя, Telegram-username, адрес, количество
заказов, сумму покупок (без отменённых) и дату последнего заказа.
Есть поиск по имени и телефону.

## Аналитика (этап 5)

Раздел «Аналитика» показывает за выбранный период (7, 30 или 90 дней):

- выручку, количество заказов, средний чек и число клиентов;
- график продаж по дням;
- топ-5 товаров по выручке;
- распределение заказов по статусам.

Выручка и количество заказов считаются без отменённых заказов.
«Сегодня» и дни графика считаются по местному времени.

## Настройки магазина (этап 5)

Раздел «Настройки» хранит название магазина, телефон, адрес, часы работы,
условия доставки и оплаты, Instagram и Telegram. Эти данные показываются
покупателям в профиле витрины (раздел «Контакты магазина»), поэтому
телефон и адрес лучше заполнить перед запуском.

Настройки хранятся в таблице `store_settings` одной строкой и создаются
автоматически при первом обращении.

### API этапа 5

- `GET /api/admin/clients` — клиенты, собранные из заказов
- `GET /api/admin/analytics?days=30` — аналитика за 7/30/90 дней
- `GET /api/admin/settings` — настройки магазина
- `PUT /api/admin/settings` — сохранить настройки
- `GET /api/settings` — публичные контакты магазина для витрины

## Языки

Интерфейс магазина и админки переключается кнопками **RU / UZ / ЎЗ**:

- **RU** — русский;
- **UZ** — узбекский латиницей (O'zbekcha);
- **ЎЗ** — узбекский кириллицей (Ўзбекча).

Выбор запоминается в браузере. В Telegram при первом открытии язык
подставляется по языку профиля пользователя (русский или узбекский
латиницей), кириллицу можно включить вручную.

Бот тоже понимает три языка. Команды: `/ru`, `/uz`, `/uzc`, справка `/lang`.

## Пароль базы данных

Для локальной разработки используется пароль `uytextile_dev_password`.
Он записан в двух местах:

- `backend/.env` → `DATABASE_URL`
- `docker-compose.yml` → `POSTGRES_PASSWORD`

Файл `backend/.env` в Git не попадает. Для сервера обязательно задайте
новый пароль.

## Ежедневный запуск

Откройте терминал в корне проекта `uy-textile`.

> Сейчас backend, магазин, админка и бот уже запущены в фоне для проверки.
> Если будете запускать их сами и увидите ошибку «порт занят», сначала выполните
> `.\scripts\stop-dev.ps1` (PowerShell) или `scripts\stop-dev.bat` (cmd),
> затем запускайте по инструкции ниже.

### Если у вас cmd (Command Prompt)

В cmd команды `$HOME`, `.\venv\Scripts\Activate.ps1` и `.ps1` не работают.
Используйте эти команды:

```bat
cd /d "%USERPROFILE%\Desktop\uy-textile"
scripts\start-db.bat

cd /d "%USERPROFILE%\Desktop\uy-textile\backend"
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

cd /d "%USERPROFILE%\Desktop\uy-textile\frontend"
npm run dev

cd /d "%USERPROFILE%\Desktop\uy-textile\admin"
npm run dev
```

Бот в cmd:

```bat
cd /d "%USERPROFILE%\Desktop\uy-textile"
scripts\start-bot.bat
```

Остановить бота: `scripts\stop-bot.bat`, остановить всё: `scripts\stop-dev.bat`.

### PowerShell

### 1. База данных

```powershell
.\scripts\start-db.ps1
```

Остановить базу:

```powershell
.\scripts\stop-db.ps1
```

### 2. Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Если PowerShell блокирует активацию окружения:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

### 3. Магазин покупателя

```powershell
cd frontend
npm run dev
```

### 4. Админ-панель

```powershell
cd admin
npm run dev
```

## Проверка

| Что | Адрес |
| --- | --- |
| Магазин | http://localhost:5173 |
| Админка | http://localhost:5174 |
| API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| Здоровье | http://localhost:8000/api/health |

Ожидаемый ответ `/api/health`:

```json
{
  "status": "healthy",
  "database": "connected",
  "application": "Uy Textile"
}
```

Проверить таблицы в базе:

```powershell
$env:PGPASSWORD = "uytextile_dev_password"
& "$HOME\Desktop\uy-textile\.postgres\pgsql\bin\psql.exe" `
  -h localhost -p 5432 -U uytextile_user -d uytextile -c "\dt"
```

## Telegram-бот

1. Откройте `@BotFather` → `/newbot`.
2. Придумайте имя и username, например `UyTextileShopBot`.
3. Скопируйте токен в `backend/.env`:

```dotenv
BOT_TOKEN=123456789:ваш_токен
```

4. Узнайте свой Telegram ID: отправьте боту `@userinfobot` команду `/start`
   или запустите нашего бота и отправьте ему `/id`.
5. Впишите ID в `backend/.env`:

```dotenv
ADMIN_TELEGRAM_ID=ваш_id
```

6. Запустите бота.

**cmd (проще всего):**

```bat
cd /d "%USERPROFILE%\Desktop\uy-textile"
scripts\start-bot.bat
```

**PowerShell:**

```powershell
cd "$HOME\Desktop\uy-textile\backend"
.\venv\Scripts\Activate.ps1
python -m app.bot.bot
```

Команды бота: `/start`, `/app`, `/id`, `/lang`, `/ru`, `/uz`, `/uzc`.

Не запускайте две копии бота с одним токеном одновременно: Telegram
покажет ошибку `Conflict: terminated by other getUpdates request`.
Остановить лишнюю копию: `scripts\stop-bot.bat`.

## Подключение Mini App

Telegram открывает Mini App только по HTTPS. Для локальной проверки подойдёт
временный туннель, для постоянной работы — VPS с доменом.

### 1. Временный HTTPS-туннель

Установите Cloudflare Tunnel (или ngrok) и направьте его на витрину:

```bat
cloudflared tunnel --url http://localhost:5173
```

В ответе будет адрес вида `https://random-name.trycloudflare.com`.

### 2. Адрес витрины в backend/.env

```dotenv
WEBAPP_URL=https://random-name.trycloudflare.com
```

Перезапустите бота: при старте он поставит кнопку меню «Uy Textile»
со ссылкой на магазин. Если адрес не HTTPS, бот пропустит этот шаг
и напишет об этом в лог.

### 3. Проверка

Откройте бота и отправьте `/app` — придёт кнопка «Открыть магазин».
Или нажмите кнопку меню слева от поля ввода.

Админку открывайте по её HTTPS-адресу (`ADMIN_URL` на сервере) внутри
Telegram от аккаунта из `ADMIN_TELEGRAM_ID`. Для постоянной работы
разверните frontend, admin и backend на сервере с доменом и HTTPS.

## Структура

```text
uy-textile/
├── admin/                 # React-админка
│   └── src/
│       ├── components/    # форма товара, карта доставки,
│       │                  # клиенты, аналитика, настройки
│       ├── services/      # adminApi с Telegram-заголовком
├── backend/
│   ├── app/
│   │   ├── bot/           # Telegram-бот
│   │   ├── models/        # SQLAlchemy-модели (users, каталог,
│   │   │                  # заказы, store_settings)
│   │   ├── routers/       # API-роутеры (auth, catalog, orders, admin,
│   │   │                  # публичные настройки магазина)
│   │   ├── schemas/       # Pydantic-схемы
│   │   ├── services/      # уведомления, проверка Telegram initData,
│   │   │                  # чтение настроек магазина
│   │   ├── static/products/  # изображения товаров
│   │   ├── static/uploads/   # фото, загруженные из админки
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── seed.py        # демо-категории и товары
│   │   └── main.py
│   ├── .env               # секреты (не в Git)
│   └── requirements.txt
├── frontend/              # React-магазин
│   └── src/
│       ├── components/    # TopBar, ProductCard, QuantityStepper
│       ├── hooks/         # корзина и избранное (localStorage)
│       ├── pages/         # Home, Catalog, Product, Cart, ...
│       └── services/api.js
├── scripts/               # запуск/остановка базы, бота и серверов
├── .postgres/             # локальная база (не в Git)
├── docker-compose.yml     # PostgreSQL через Docker (для сервера)
└── .gitignore
```

## Docker и сервер

`docker-compose.yml` подготовлен для будущего сервера. На этом компьютере
Docker Desktop не установлен: он требует WSL2 и перезагрузку. Локально
используется переносимый PostgreSQL, поэтому все команды выше работают
без Docker.

Для Telegram Mini App нужен публичный HTTPS-адрес. На этапе подключения
к Telegram поднимем временный туннель (например, Cloudflare Tunnel), а для
постоянной работы — VPS с доменом.

## Следующий этап

Постоянный сервер с доменом и HTTPS, резервное копирование базы,
экспорт заказов и клиентов, а также управление категориями из админки.
