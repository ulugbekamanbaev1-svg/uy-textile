# Развёртывание на Render: backend + frontend + admin + PostgreSQL

Инструкция для случая, когда сайт уже создан на Render, но админка не входит
или данные не загружаются.

## 1. Backend (Web Service)

Настройки сервиса:

- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Переменные окружения (Environment):

| Переменная | Значение |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL из Render PostgreSQL, но схема должна быть `postgresql+asyncpg://` (замените `postgresql://` или `postgres://`) |
| `ADMIN_PASSWORD` | ваш пароль для админки (если не задан — `admin123`) |
| `ADMIN_TELEGRAM_ID` | ваш числовой Telegram ID (необязательно) |
| `BOT_TOKEN` | токен Telegram-бота (необязательно) |
| `FRONTEND_URL` | `https://ваш-frontend.onrender.com` |
| `ADMIN_URL` | `https://ваш-admin.onrender.com` |
| `WEBAPP_URL` | `https://ваш-frontend.onrender.com` (HTTPS, для кнопки Mini App) |
| `PUBLIC_API_URL` | `https://ваш-backend.onrender.com` (публичный адрес backend, нужен для фото в Telegram и для QR) |
| `CORS_ORIGINS` | `https://ваш-frontend.onrender.com,https://ваш-admin.onrender.com` |
| `QR_PUBLIC_BASE_URL` | `https://ваш-backend.onrender.com` (публичный HTTPS backend, где живёт `/qr`; обычно совпадает с `PUBLIC_API_URL`) |
| `TELEGRAM_BOT_USERNAME` | username бота без `@` (если пусто — backend попробует получить его через `BOT_TOKEN`) |
| `QR_TOKEN` | `farrux` (НЕ менять после печати этикеток) |
| `QR_TELEGRAM_URL` | необязательно: полный URL, куда ведёт QR (можно сменить без перепечатывания) |

Важно: `CORS_ORIGINS` — это точные адреса сайтов, через запятую, без пробелов
и без `/` в конце. Если адрес не совпадает, браузер заблокирует запросы
(«Failed to fetch», «CORS error»).

## 2. Frontend — витрина (Static Site)

- **Root Directory:** `frontend`
- **Build Command:** `npm ci && npm run build`
- **Publish Directory:** `dist`
- **Environment:** `VITE_API_URL=https://ваш-backend.onrender.com`

`VITE_API_URL` вшивается в файлы при сборке. После изменения переменной нужно
нажать **Manual Deploy → Clear build cache & deploy**.

## 3. Admin — админка (Static Site)

- **Root Directory:** `admin`
- **Build Command:** `npm ci && npm run build`
- **Publish Directory:** `dist`
- **Environment:** `VITE_API_URL=https://ваш-backend.onrender.com`

В папке `admin/public` уже лежит файл `_redirects` для SPA, чтобы админка
открывалась по любому адресу и не давала 404 после обновления страницы.

## 4. Вход в админку

Админка принимает пароль (`ADMIN_PASSWORD`, по умолчанию `admin123`).
Вход через Telegram по `ADMIN_TELEGRAM_ID` тоже работает.

Если при сборке админки не был задан `VITE_API_URL`, на экране входа нажмите
**«Настройки подключения (адрес сервера)»** и введите адрес backend, например
`https://farrux-api.onrender.com`. Адрес сохранится в браузере.

## 5. Farrux Shop QR Premium

После деплоя backend:

1. Убедитесь, что заданы `PUBLIC_API_URL`/`QR_PUBLIC_BASE_URL` (публичный HTTPS backend) и `BOT_TOKEN` или `TELEGRAM_BOT_USERNAME`.
2. Проверьте `https://ваш-backend.onrender.com/qr?t=farrux` — должен быть redirect в Telegram Mini App.
3. Откройте админку → раздел **QR-аналитика**: скачайте PNG/SVG/PDF.
4. Перед печатью тиража проверьте один тестовый QR камерой iPhone и Android.

QR постоянный: каталог/цены можно менять, QR не меняется. Если нужно сменить конечный Telegram URL без перепечатывания, задайте `QR_TELEGRAM_URL`.

## Visitor Analytics

Раздел не требует отдельных сервисов и платных зависимостей.

1. Задеплойте обновлённый backend. При старте он сам создаст таблицы
   `visitors`, `visitor_sessions`, `visitor_events`, `visitor_consents`
   и добавит колонки `analytics_enabled`, `analytics_retention_days`
   в `store_settings`. Alembic не используется.
2. Задеплойте обновлённые frontend и admin.
3. Откройте админку → раздел **Посетители / Visitor Analytics**.
4. Проверьте LIVE: откройте витрину в другом браузере или окне — посетитель
   должен появиться в течение 10 секунд.

Переменные окружения (все необязательные):

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `ANALYTICS_ENABLED` | `true` | Глобальный выключатель сбора |
| `ANALYTICS_RETENTION_DAYS` | `30` | Срок хранения данных, дни |
| `ANALYTICS_ONLINE_SECONDS` | `120` | Окно статуса Online |
| `ANALYTICS_HEARTBEAT_SECONDS` | `30` | Период heartbeat |
| `ANALYTICS_SESSION_IDLE_MINUTES` | `30` | Закрытие зависших сессий |
| `ANALYTICS_CONSENT_VERSION` | `1` | Версия согласия |

Настройки `analytics_enabled` и `analytics_retention_days` также меняются
в админке: Настройки → блок аналитики.

Отказ посетителя: Профиль → «Приватность» → выключить «Аналитика посещений».
После отказа новые события не отправляются, активная сессия закрывается,
локальная очередь очищается. Согласие можно включить обратно.

## Частые проблемы

- **«Неверный пароль» при верном пароле** — на сервере был старый код, где
  для `/api/admin/*` требовался только Telegram. Обновите backend (redeploy).
- **«Не удалось связаться с сервером»** — неверный `VITE_API_URL` в админке
  или backend не запущен. Проверьте `https://ваш-backend.onrender.com/api/health`
  в браузере — должен вернуться `healthy`.
- **CORS error** — добавьте точный адрес сайта в `CORS_ORIGINS` backend и
  перезапустите сервис.
- **Долгий первый запрос** — бесплатный тариф Render «засыпает»; первый запрос
  может занять 30–60 секунд.
- **Фото не открываются** — загруженные фото хранятся в файловой системе
  backend (`backend/app/static/uploads`). На бесплатном Render файлы могут
  пропадать после перезапуска. Для постоянного хранения нужно подключить
  внешнее хранилище (S3 / Cloudinary) — это отдельная доработка.
- **В Telegram нет фото в заказе** — задайте `PUBLIC_API_URL` (публичный
  HTTPS-адрес backend). Относительные фото (`/static/...`) Telegram сможет
  загрузить только по публичному URL. Убедитесь, что backend задеплоен с
  актуальным кодом и картинка доступна по
  `https://ваш-backend.onrender.com/static/...`.
