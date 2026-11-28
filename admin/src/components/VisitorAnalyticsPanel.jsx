import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Clock,
  Eye,
  Globe2,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  X
} from "lucide-react";

import { adminFetch } from "../services/adminApi";
import { localized } from "../utils/format";
import "./VisitorAnalyticsPanel.css";

const API = "/api/admin/analytics";

const LABELS = {
  ru: {
    tabLive: "Сейчас в магазине",
    tabVisitors: "Все посетители",
    tabHistory: "История посетителя",
    tabDashboard: "Дашборд",
    onlineNow: "Сейчас онлайн",
    anonymous: "Анонимные",
    registered: "Зарегистрированные",
    search: "Поиск по ID, имени, странице",
    all: "Все",
    anonymousOnly: "Анонимные",
    registeredOnly: "Зарегистрированные",
    visitor: "Посетитель",
    type: "Тип",
    firstSeen: "Первое посещение",
    lastSeen: "Последнее посещение",
    sessions: "Сессии",
    productViews: "Товары",
    device: "Устройство",
    currentPage: "Текущая страница",
    lastProduct: "Последний товар",
    enteredAt: "Вход",
    lastActivity: "Активность",
    duration: "Длительность",
    online: "Online",
    offline: "Offline",
    today: "Сегодня",
    yesterday: "Вчера",
    d7: "7 дней",
    d30: "30 дней",
    d90: "90 дней",
    custom: "Период",
    from: "С",
    to: "По",
    newVisitors: "Новые",
    returning: "Возвращающиеся",
    allVisitors: "Всего посетителей",
    uniqueVisitors: "Уникальные",
    pageViews: "Просмотры страниц",
    addToCart: "В корзину",
    checkoutStart: "Оформление",
    orders: "Заказы",
    conversion: "Конверсия",
    popularProducts: "Популярные товары",
    popularCategories: "Популярные категории",
    sources: "Источники переходов",
    devices: "Устройства",
    noData: "Пока нет данных за выбранный период",
    loading: "Загрузка…",
    error: "Не удалось загрузить данные",
    retry: "Повторить",
    prev: "Назад",
    next: "Вперёд",
    page: "Стр.",
    viewHistory: "История",
    deleteVisitor: "Удалить данные",
    deleteConfirm: "Удалить всю историю этого посетителя? Действие необратимо.",
    back: "Назад к списку",
    timeline: "Хронология действий",
    events: "событий",
    consentOn: "Аналитика разрешена",
    consentOff: "Аналитика отключена",
    lastActive: "Последняя активность",
    pickVisitor: "Выберите посетителя, чтобы открыть историю",
    pickHint: "Найдите посетителя по UUID или имени",
    liveHint: "Обновляется каждые 10 секунд",
    emptyLive: "Сейчас никого нет онлайн",
    views: "просмотров",
    chart: "Динамика за период",
    pageViewSeries: "Страницы",
    productViewSeries: "Товары",
    cartSeries: "Корзина",
    session: "Сессия",
    eventsShown: "Показаны последние события",
    activeTime: "Активное время",
    searchVisitor: "Поиск посетителя",
    results: "результатов",
    todayShort: "сегодня"
  },
  uz: {
    tabLive: "Hozir do'konda",
    tabVisitors: "Barcha tashrifchilar",
    tabHistory: "Tashrif tarixi",
    tabDashboard: "Dashboard",
    onlineNow: "Hozir online",
    anonymous: "Anonim",
    registered: "Ro'yxatdan o'tgan",
    search: "ID, ism yoki sahifa bo'yicha qidirish",
    all: "Barchasi",
    anonymousOnly: "Anonim",
    registeredOnly: "Ro'yxatdan o'tgan",
    visitor: "Tashrifchi",
    type: "Turi",
    firstSeen: "Birinchi tashrif",
    lastSeen: "Oxirgi tashrif",
    sessions: "Sessiyalar",
    productViews: "Mahsulotlar",
    device: "Qurilma",
    currentPage: "Joriy sahifa",
    lastProduct: "Oxirgi mahsulot",
    enteredAt: "Kirish",
    lastActivity: "Faollik",
    duration: "Davomiylik",
    online: "Online",
    offline: "Offline",
    today: "Bugun",
    yesterday: "Kecha",
    d7: "7 kun",
    d30: "30 kun",
    d90: "90 kun",
    custom: "Davr",
    from: "Dan",
    to: "Gacha",
    newVisitors: "Yangi",
    returning: "Qaytgan",
    allVisitors: "Jami tashrifchilar",
    uniqueVisitors: "Unikal",
    pageViews: "Sahifa ko'rishlari",
    addToCart: "Savatga",
    checkoutStart: "Rasmiylashtirish",
    orders: "Buyurtmalar",
    conversion: "Konversiya",
    popularProducts: "Mashhur mahsulotlar",
    popularCategories: "Mashhur kategoriyalar",
    sources: "O'tish manbalari",
    devices: "Qurilmalar",
    noData: "Tanlangan davr uchun ma'lumot yo'q",
    loading: "Yuklanmoqda…",
    error: "Ma'lumotni yuklab bo'lmadi",
    retry: "Qayta urinish",
    prev: "Orqaga",
    next: "Oldinga",
    page: "Sah.",
    viewHistory: "Tarix",
    deleteVisitor: "Ma'lumotlarni o'chirish",
    deleteConfirm: "Bu tashrifchining butun tarixi o'chirilsinmi? Amalni qaytarib bo'lmaydi.",
    back: "Ro'yxatga qaytish",
    timeline: "Harakatlar xronologiyasi",
    events: "hodisa",
    consentOn: "Tahlilga ruxsat berilgan",
    consentOff: "Tahlil o'chirilgan",
    lastActive: "Oxirgi faollik",
    pickVisitor: "Tarixni ko'rish uchun tashrifchini tanlang",
    pickHint: "UUID yoki ism bo'yicha toping",
    liveHint: "Har 10 soniyada yangilanadi",
    emptyLive: "Hozir online hech kim yo'q",
    views: "ko'rish",
    chart: "Davr dinamikasi",
    pageViewSeries: "Sahifalar",
    productViewSeries: "Mahsulotlar",
    cartSeries: "Savat",
    session: "Sessiya",
    eventsShown: "Oxirgi hodisalar ko'rsatilgan",
    activeTime: "Faol vaqt",
    searchVisitor: "Tashrifchini qidirish",
    results: "natija",
    todayShort: "bugun"
  },
  uzc: {
    tabLive: "Ҳозир дўконда",
    tabVisitors: "Барча ташрифчилар",
    tabHistory: "Ташриф тарихи",
    tabDashboard: "Дашборд",
    onlineNow: "Ҳозир онлайн",
    anonymous: "Аноним",
    registered: "Рўйхатдан ўтган",
    search: "ID, исм ёки саҳифа бўйича қидириш",
    all: "Барчаси",
    anonymousOnly: "Аноним",
    registeredOnly: "Рўйхатдан ўтган",
    visitor: "Ташрифчи",
    type: "Тури",
    firstSeen: "Биринчи ташриф",
    lastSeen: "Охирги ташриф",
    sessions: "Сессиялар",
    productViews: "Маҳсулотлар",
    device: "Қурилма",
    currentPage: "Жорий саҳифа",
    lastProduct: "Охирги маҳсулот",
    enteredAt: "Кириш",
    lastActivity: "Фаоллик",
    duration: "Давомийлик",
    online: "Online",
    offline: "Offline",
    today: "Бугун",
    yesterday: "Кеча",
    d7: "7 кун",
    d30: "30 кун",
    d90: "90 кун",
    custom: "Давр",
    from: "Дан",
    to: "Гача",
    newVisitors: "Янги",
    returning: "Қайтган",
    allVisitors: "Жами ташрифчилар",
    uniqueVisitors: "Уникал",
    pageViews: "Саҳифа кўришлари",
    addToCart: "Саватга",
    checkoutStart: "Расмийлаштириш",
    orders: "Буюртмалар",
    conversion: "Конверсия",
    popularProducts: "Машҳур маҳсулотлар",
    popularCategories: "Машҳур категориялар",
    sources: "Ўтиш манбалари",
    devices: "Қурилмалар",
    noData: "Танланган давр учун маълумот йўқ",
    loading: "Юкланмоқда…",
    error: "Маълумотни юклаб бўлмади",
    retry: "Қайта уриниш",
    prev: "Орқага",
    next: "Олдинга",
    page: "Саҳ.",
    viewHistory: "Тарих",
    deleteVisitor: "Маълумотларни ўчириш",
    deleteConfirm: "Бу ташрифчининг бутун тарихи ўчирилсинми? Амални қайтариб бўлмайди.",
    back: "Рўйхатга қайтиш",
    timeline: "Ҳаракатлар хронологияси",
    events: "ҳодиса",
    consentOn: "Таҳлилга рухсат берилган",
    consentOff: "Таҳлил ўчирилган",
    lastActive: "Охирги фаоллик",
    pickVisitor: "Тарихни кўриш учун ташрифчини танланг",
    pickHint: "UUID ёки исм бўйича топинг",
    liveHint: "Ҳар 10 сонияда янгиланади",
    emptyLive: "Ҳозир онлайн ҳеч ким йўқ",
    views: "кўриш",
    chart: "Давр динамикаси",
    pageViewSeries: "Саҳифалар",
    productViewSeries: "Маҳсулотлар",
    cartSeries: "Сават",
    session: "Сессия",
    eventsShown: "Охирги ҳодисалар кўрсатилган",
    activeTime: "Фаол вақт",
    searchVisitor: "Ташрифчини қидириш",
    results: "натижа",
    todayShort: "бугун"
  }
};

const EVENT_LABELS = {
  page_view: { ru: "Открыл страницу", uz: "Sahifani ochdi", uzc: "Саҳифани очди" },
  product_view: { ru: "Посмотрел товар", uz: "Mahsulotni ko'rdi", uzc: "Маҳсулотни кўрди" },
  category_view: { ru: "Открыл категорию", uz: "Kategoriyani ochdi", uzc: "Категорияни очди" },
  search: { ru: "Поиск", uz: "Qidiruv", uzc: "Қидирув" },
  add_to_cart: { ru: "Добавил в корзину", uz: "Savatga qo'shdi", uzc: "Саватга қўшди" },
  remove_from_cart: { ru: "Убрал из корзины", uz: "Savatdan olib tashladi", uzc: "Саватдан олиб ташлади" },
  checkout_start: { ru: "Начал оформление", uz: "Rasmiylashtirishni boshladi", uzc: "Расмийлаштиришни бошлади" },
  order_created: { ru: "Создал заказ", uz: "Buyurtma yaratdi", uzc: "Буюртма яратди" },
  login: { ru: "Авторизовался", uz: "Avtorizatsiyadan o'tdi", uzc: "Авторизациядан ўтди" },
  logout: { ru: "Вышел", uz: "Chiqdi", uzc: "Чиқди" },
  session_start: { ru: "Начал сессию", uz: "Sessiyani boshladi", uzc: "Сессияни бошлади" },
  session_end: { ru: "Завершил сессию", uz: "Sessiyani tugatdi", uzc: "Сессияни тугатди" }
};

const PERIODS = [
  ["today", "today"],
  ["yesterday", "yesterday"],
  ["7d", "d7"],
  ["30d", "d30"],
  ["90d", "d90"]
];

function locale(lang) {
  if (lang === "uzc") return "uz-Cyrl";
  return lang === "uz" ? "uz" : "ru";
}

function formatDateTime(value, lang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale(lang), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTime(value, lang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(locale(lang), {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function periodQuery(period, dateFrom, dateTo) {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
  }
  return params.toString();
}

function shortUuid(value) {
  return String(value || "").slice(0, 8);
}

function visitorTitle(item, lang) {
  if (item.user?.name) return item.user.name;
  return String(item.visitor_uuid || item.visitor?.visitor_uuid || "");
}

function productName(product, lang) {
  if (!product) return "—";
  return localized(product, "name", lang) || product.slug || `#${product.id}`;
}

function categoryName(category, lang) {
  if (!category) return "—";
  return localized(category, "name", lang) || category.slug || `#${category.id}`;
}

function StatCard({ label, value, hint, icon: Icon, tone = "" }) {
  return (
    <div className={`va-stat ${tone}`}>
      <span className="va-stat-icon">{Icon ? <Icon size={17} /> : null}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {hint ? <em>{hint}</em> : null}
      </div>
    </div>
  );
}

function TrendChart({ data, L }) {
  if (!data.length) {
    return <p className="va-empty">{L.noData}</p>;
  }

  const width = 720;
  const height = 230;
  const padX = 34;
  const padY = 24;
  const max = Math.max(
    1,
    ...data.map((item) =>
      Math.max(item.page_view || 0, item.product_view || 0, item.add_to_cart || 0)
    )
  );
  const step = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const x = (index) => padX + index * step;
  const y = (value) => height - padY - (Number(value) || 0) / max * (height - padY * 2);

  const line = (key) =>
    data
      .map((item, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(item[key])}`)
      .join(" ");

  const area = `${line("page_view")} L${x(data.length - 1)},${height - padY} L${x(0)},${height - padY} Z`;
  const ticks = [0, Math.round(max / 2), max];
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div className="va-chart">
      <div className="va-legend">
        <span><i className="dot pages" />{L.pageViewSeries}</span>
        <span><i className="dot products" />{L.productViewSeries}</span>
        <span><i className="dot cart" />{L.cartSeries}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={L.chart}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y(tick)}
              y2={y(tick)}
              className="va-grid"
            />
            <text x={4} y={y(tick) + 4} className="va-axis">{tick}</text>
          </g>
        ))}
        <path d={area} className="va-area" />
        <path d={line("page_view")} className="va-line pages" />
        <path d={line("product_view")} className="va-line products" />
        <path d={line("add_to_cart")} className="va-line cart" />
        {data.map((item, index) =>
          labelIndexes.has(index) ? (
            <text
              key={item.date}
              x={x(index)}
              y={height - 4}
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              className="va-axis"
            >
              {String(item.date).slice(5)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

function Bars({ items, labelKey, L }) {
  if (!items.length) return <p className="va-empty">{L.noData}</p>;
  const max = Math.max(1, ...items.map((item) => item.count || item.views || 0));

  return (
    <div className="va-bars">
      {items.map((item) => {
        const value = item.count ?? item.views ?? 0;
        return (
          <div className="va-bar-row" key={item.device_type || item.source || item.id || item.slug}>
            <span>{item[labelKey] || item.device_type || item.source}</span>
            <div className="va-bar-track">
              <div className="va-bar-fill" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
            <strong>{value}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ detail, L, lang }) {
  const events = detail.events.items;

  const groups = useMemo(() => {
    const map = new Map();
    [...events].reverse().forEach((event) => {
      const key = event.session_id || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    });
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="va-timeline">
      {groups.map(([sessionId, list]) => {
        const activeSeconds = list.reduce((sum, event, index) => {
          const next = list[index + 1];
          if (!next) return sum;
          const gap = (new Date(next.created_at) - new Date(event.created_at)) / 1000;
          return sum + Math.min(120, Math.max(0, gap));
        }, 0);

        return (
          <div className="va-session" key={sessionId}>
            <div className="va-session-head">
              <span><Clock size={14} />{L.session} #{sessionId}</span>
              <small>{L.activeTime}: {formatDuration(activeSeconds)}</small>
            </div>
            <ol>
              {list.map((event, index) => {
                const next = list[index + 1];
                const gap = next
                  ? Math.min(
                      120,
                      Math.max(
                        0,
                        (new Date(next.created_at) - new Date(event.created_at)) / 1000
                      )
                    )
                  : 0;
                const label = EVENT_LABELS[event.event_type]?.[lang] || event.event_type;

                return (
                  <li key={event.id} className={`va-event ${event.event_type}`}>
                    <span className="va-event-time">{formatTime(event.created_at, lang)}</span>
                    <span className="va-event-dot" />
                    <div className="va-event-body">
                      <strong>{label}</strong>
                      <small>
                        {event.product
                          ? productName(event.product, lang)
                          : event.category
                            ? categoryName(event.category, lang)
                            : event.page_url || "—"}
                        {event.event_type === "search" && event.event_data?.query
                          ? ` — «${event.event_data.query}»`
                          : ""}
                      </small>
                    </div>
                    {gap > 0 ? (
                      <span className="va-event-gap">{formatDuration(gap)}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <p className="va-note">{L.eventsShown}</p>
    </div>
  );
}

export default function VisitorAnalyticsPanel({ t, lang }) {
  const L = LABELS[lang] || LABELS.ru;

  const [tab, setTab] = useState("live");
  const [live, setLive] = useState(null);
  const [liveState, setLiveState] = useState("loading");
  const [liveQuery, setLiveQuery] = useState("");
  const [liveType, setLiveType] = useState("all");

  const [visitors, setVisitors] = useState(null);
  const [visitorsState, setVisitorsState] = useState("loading");
  const [period, setPeriod] = useState("7d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [visitorQuery, setVisitorQuery] = useState("");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyList, setHistoryList] = useState(null);

  const [stats, setStats] = useState(null);
  const [statsState, setStatsState] = useState("loading");
  const [statsReload, setStatsReload] = useState(0);

  const loadLive = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type: liveType, limit: "200" });
      if (liveQuery.trim()) params.set("q", liveQuery.trim());
      const data = await adminFetch(`${API}/live?${params.toString()}`);
      setLive(data);
      setLiveState("ready");
    } catch {
      setLiveState("error");
    }
  }, [liveQuery, liveType]);

  useEffect(() => {
    if (tab !== "live") return undefined;
    setLiveState("loading");
    loadLive();
    const timer = setInterval(loadLive, 10_000);
    return () => clearInterval(timer);
  }, [tab, loadLive]);

  const loadVisitors = useCallback(async () => {
    setVisitorsState("loading");
    try {
      const params = new URLSearchParams({
        period,
        type: typeFilter,
        kind: kindFilter,
        page: String(page),
        page_size: "25"
      });
      if (period === "custom") {
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
      }
      if (visitorQuery.trim()) params.set("q", visitorQuery.trim());
      const data = await adminFetch(`${API}/visitors?${params.toString()}`);
      setVisitors(data);
      setVisitorsState("ready");
    } catch {
      setVisitorsState("error");
    }
  }, [period, dateFrom, dateTo, typeFilter, kindFilter, visitorQuery, page]);

  useEffect(() => {
    if (tab !== "visitors") return;
    loadVisitors();
  }, [tab, loadVisitors]);

  useEffect(() => {
    if (tab !== "history" || selectedId) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          period: "30d",
          page: "1",
          page_size: "50"
        });
        if (historyQuery.trim()) params.set("q", historyQuery.trim());
        const data = await adminFetch(`${API}/visitors?${params.toString()}`);
        if (!cancelled) setHistoryList(data);
      } catch {
        if (!cancelled) setHistoryList(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, selectedId, historyQuery]);

  const loadDetail = useCallback(async (visitorId) => {
    setDetailState("loading");
    try {
      const data = await adminFetch(`${API}/visitors/${visitorId}?event_page=1&event_page_size=100`);
      setDetail(data);
      setDetailState("ready");
    } catch {
      setDetailState("error");
    }
  }, []);

  useEffect(() => {
    if (tab !== "history" || !selectedId) return;
    loadDetail(selectedId);
  }, [tab, selectedId, loadDetail]);

  useEffect(() => {
    if (tab !== "dashboard") return;
    let cancelled = false;
    setStatsState("loading");
    adminFetch(`${API}/stats?${periodQuery(period, dateFrom, dateTo)}`)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setStatsState("ready");
      })
      .catch(() => {
        if (!cancelled) setStatsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tab, period, dateFrom, dateTo, statsReload]);

  const openHistory = (visitorId) => {
    setSelectedId(visitorId);
    setTab("history");
  };

  const deleteVisitor = async () => {
    if (!selectedId) return;
    if (!window.confirm(L.deleteConfirm)) return;
    try {
      await adminFetch(`${API}/visitors/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      setDetailState("idle");
      setHistoryList(null);
      setVisitors(null);
    } catch {
      // ошибка удаления остаётся видимой в консоли; данные не меняем
    }
  };

  const tabs = [
    ["live", L.tabLive, Activity],
    ["visitors", L.tabVisitors, Users],
    ["history", L.tabHistory, Clock],
    ["dashboard", L.tabDashboard, TrendingUp]
  ];

  return (
    <div className="va-panel">
      <div className="va-tabs">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ---------- LIVE ---------- */}
      {tab === "live" && (
        <div className="va-section">
          <div className="va-toolbar">
            <div className="va-search">
              <Search size={16} />
              <input
                value={liveQuery}
                onChange={(event) => setLiveQuery(event.target.value)}
                placeholder={L.search}
              />
              {liveQuery ? (
                <button type="button" onClick={() => setLiveQuery("")} aria-label="clear">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <select value={liveType} onChange={(event) => setLiveType(event.target.value)}>
              <option value="all">{L.all}</option>
              <option value="anonymous">{L.anonymousOnly}</option>
              <option value="registered">{L.registeredOnly}</option>
            </select>
            <button type="button" className="va-icon-button" onClick={loadLive} title={L.retry}>
              <RefreshCw size={16} />
            </button>
            <span className="va-live-hint"><i className="va-pulse" />{L.liveHint}</span>
          </div>

          <div className="va-stats">
            <StatCard label={L.onlineNow} value={live?.online ?? "—"} icon={Activity} tone="live" />
            <StatCard label={L.anonymous} value={live?.anonymous ?? "—"} icon={UserRound} />
            <StatCard label={L.registered} value={live?.registered ?? "—"} icon={Users} />
          </div>

          {liveState === "error" && (
            <div className="va-error">
              <p>{L.error}</p>
              <button type="button" onClick={loadLive}>{L.retry}</button>
            </div>
          )}

          {liveState === "loading" && !live && <p className="va-empty">{L.loading}</p>}
          {liveState === "ready" && live?.visitors.length === 0 && (
            <p className="va-empty">{L.emptyLive}</p>
          )}

          {live?.visitors.length > 0 && (
            <div className="va-table-wrap">
              <table className="va-table">
                <thead>
                  <tr>
                    <th>{L.visitor}</th>
                    <th>{L.type}</th>
                    <th>{L.enteredAt}</th>
                    <th>{L.lastActivity}</th>
                    <th>{L.duration}</th>
                    <th>{L.currentPage}</th>
                    <th>{L.lastProduct}</th>
                    <th>{L.device}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {live.visitors.map((item) => (
                    <tr key={item.session_id} onClick={() => openHistory(item.visitor_id)}>
                      <td>
                        <strong className="va-uuid" title={item.visitor_uuid}>
                          {item.user?.name || item.visitor_uuid}
                        </strong>
                        {item.user?.username ? (
                          <small>@{item.user.username}</small>
                        ) : (
                          <small className="va-muted">{L.anonymous}</small>
                        )}
                      </td>
                      <td>
                        <span className={`va-badge ${item.visitor_type}`}>
                          {item.visitor_type === "registered" ? L.registered : L.anonymous}
                        </span>
                      </td>
                      <td>{formatTime(item.started_at, lang)}</td>
                      <td>{formatTime(item.last_seen_at, lang)}</td>
                      <td>{formatDuration(item.duration_seconds)}</td>
                      <td className="va-page" title={item.current_page}>{item.current_page || "—"}</td>
                      <td>{item.last_product?.product ? productName(item.last_product.product, lang) : "—"}</td>
                      <td>{item.device_type || "—"}</td>
                      <td>
                        <button type="button" className="va-link" onClick={(event) => { event.stopPropagation(); openHistory(item.visitor_id); }}>
                          <Eye size={14} />{L.viewHistory}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------- ALL VISITORS ---------- */}
      {tab === "visitors" && (
        <div className="va-section">
          <div className="va-toolbar wrap">
            <div className="va-search">
              <Search size={16} />
              <input
                value={visitorQuery}
                onChange={(event) => { setVisitorQuery(event.target.value); setPage(1); }}
                placeholder={L.search}
              />
            </div>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
              <option value="all">{L.all}</option>
              <option value="anonymous">{L.anonymousOnly}</option>
              <option value="registered">{L.registeredOnly}</option>
            </select>
            <select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value); setPage(1); }}>
              <option value="all">{L.all}</option>
              <option value="new">{L.newVisitors}</option>
              <option value="returning">{L.returning}</option>
            </select>
            <div className="va-periods">
              {PERIODS.map(([value, key]) => (
                <button
                  key={value}
                  type="button"
                  className={period === value ? "active" : ""}
                  onClick={() => { setPeriod(value); setPage(1); }}
                >
                  {L[key]}
                </button>
              ))}
              <button
                type="button"
                className={period === "custom" ? "active" : ""}
                onClick={() => setPeriod("custom")}
              >
                {L.custom}
              </button>
            </div>
            {period === "custom" && (
              <div className="va-dates">
                <label>{L.from}<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
                <label>{L.to}<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
              </div>
            )}
          </div>

          {visitorsState === "error" && (
            <div className="va-error">
              <p>{L.error}</p>
              <button type="button" onClick={loadVisitors}>{L.retry}</button>
            </div>
          )}
          {visitorsState === "loading" && !visitors && <p className="va-empty">{L.loading}</p>}
          {visitorsState === "ready" && visitors?.items.length === 0 && (
            <p className="va-empty">{L.noData}</p>
          )}

          {visitors?.items.length > 0 && (
            <div className="va-table-wrap">
              <table className="va-table">
                <thead>
                  <tr>
                    <th>{L.visitor}</th>
                    <th>{L.type}</th>
                    <th>{L.firstSeen}</th>
                    <th>{L.lastSeen}</th>
                    <th>{L.sessions}</th>
                    <th>{L.productViews}</th>
                    <th>{L.device}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visitors.items.map((item) => (
                    <tr key={item.id} onClick={() => openHistory(item.id)}>
                      <td>
                        <strong className="va-uuid" title={item.visitor_uuid}>
                          {item.user?.name || item.visitor_uuid}
                        </strong>
                        <small>
                          {item.user?.username ? `@${item.user.username}` : shortUuid(item.visitor_uuid)}
                          {item.online ? <span className="va-online"> ●</span> : null}
                        </small>
                      </td>
                      <td>
                        <span className={`va-badge ${item.visitor_type}`}>
                          {item.visitor_type === "registered" ? L.registered : L.anonymous}
                        </span>
                      </td>
                      <td>{formatDateTime(item.first_seen_at, lang)}</td>
                      <td>{formatDateTime(item.last_seen_at, lang)}</td>
                      <td>{item.sessions}</td>
                      <td>{item.product_views}</td>
                      <td>{item.device_type || "—"}</td>
                      <td>
                        <button type="button" className="va-link" onClick={(event) => { event.stopPropagation(); openHistory(item.id); }}>
                          <Eye size={14} />{L.viewHistory}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visitors && visitors.total > 0 && (
            <div className="va-pager">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {L.prev}
              </button>
              <span>{L.page} {page} / {Math.max(1, Math.ceil(visitors.total / visitors.page_size))} · {visitors.total} {L.results}</span>
              <button
                type="button"
                disabled={page >= Math.ceil(visitors.total / visitors.page_size)}
                onClick={() => setPage((value) => value + 1)}
              >
                {L.next}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- HISTORY ---------- */}
      {tab === "history" && (
        <div className="va-section">
          {!selectedId && (
            <>
              <div className="va-toolbar">
                <div className="va-search">
                  <Search size={16} />
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder={L.pickHint}
                  />
                </div>
              </div>
              <p className="va-note">{L.pickVisitor}</p>
              {historyList?.items?.length ? (
                <div className="va-pick-list">
                  {historyList.items.map((item) => (
                    <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
                      <span className={`va-avatar ${item.visitor_type}`}>
                        {item.user?.name?.[0] || "?"}
                      </span>
                      <span className="va-pick-body">
                        <strong title={item.visitor_uuid}>{item.user?.name || item.visitor_uuid}</strong>
                        <small>
                          {item.user?.username ? `@${item.user.username} · ` : ""}
                          {L.lastActive}: {formatDateTime(item.last_seen_at, lang)}
                        </small>
                      </span>
                      <span className={`va-badge ${item.visitor_type}`}>
                        {item.visitor_type === "registered" ? L.registered : L.anonymous}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="va-empty">{historyList ? L.noData : L.loading}</p>
              )}
            </>
          )}

          {selectedId && (
            <>
              <div className="va-toolbar">
                <button
                  type="button"
                  className="va-back"
                  onClick={() => { setSelectedId(null); setDetail(null); setDetailState("idle"); }}
                >
                  <ArrowLeft size={15} />{L.back}
                </button>
                <button type="button" className="va-danger" onClick={deleteVisitor}>
                  <Trash2 size={15} />{L.deleteVisitor}
                </button>
              </div>

              {detailState === "loading" && <p className="va-empty">{L.loading}</p>}
              {detailState === "error" && (
                <div className="va-error">
                  <p>{L.error}</p>
                  <button type="button" onClick={() => loadDetail(selectedId)}>{L.retry}</button>
                </div>
              )}

              {detail && (
                <>
                  <div className="va-profile">
                    <span className={`va-avatar ${detail.visitor.visitor_type}`}>
                      {detail.visitor.user?.name?.[0] || "?"}
                    </span>
                    <div>
                      <strong title={detail.visitor.visitor_uuid}>
                        {detail.visitor.user?.name || detail.visitor.visitor_uuid}
                      </strong>
                      <small>
                        {detail.visitor.user?.username ? `@${detail.visitor.user.username} · ` : ""}
                        {detail.visitor.visitor_type === "registered" ? L.registered : L.anonymous}
                        {" · "}
                        {detail.visitor.analytics_consent === false ? L.consentOff : L.consentOn}
                      </small>
                    </div>
                    <div className="va-profile-meta">
                      <span>{L.firstSeen}: {formatDateTime(detail.visitor.first_seen_at, lang)}</span>
                      <span>{L.lastSeen}: {formatDateTime(detail.visitor.last_seen_at, lang)}</span>
                      <span>{L.sessions}: {detail.sessions.length}</span>
                    </div>
                  </div>

                  <h3 className="va-subtitle"><Clock size={16} />{L.timeline}</h3>
                  {detail.events.items.length ? (
                    <Timeline detail={detail} L={L} lang={lang} />
                  ) : (
                    <p className="va-empty">{L.noData}</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- DASHBOARD ---------- */}
      {tab === "dashboard" && (
        <div className="va-section">
          <div className="va-toolbar wrap">
            <div className="va-periods">
              {PERIODS.map(([value, key]) => (
                <button
                  key={value}
                  type="button"
                  className={period === value ? "active" : ""}
                  onClick={() => setPeriod(value)}
                >
                  {L[key]}
                </button>
              ))}
              <button
                type="button"
                className={period === "custom" ? "active" : ""}
                onClick={() => setPeriod("custom")}
              >
                {L.custom}
              </button>
            </div>
            {period === "custom" && (
              <div className="va-dates">
                <label>{L.from}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
                <label>{L.to}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
              </div>
            )}
          </div>

          {statsState === "error" && (
            <div className="va-error">
              <p>{L.error}</p>
              <button type="button" onClick={() => setStatsReload((value) => value + 1)}>{L.retry}</button>
            </div>
          )}
          {statsState === "loading" && !stats && <p className="va-empty">{L.loading}</p>}

          {stats && (
            <>
              <div className="va-stats grid">
                <StatCard label={L.allVisitors} value={stats.totals.all_visitors} icon={Users} />
                <StatCard label={L.uniqueVisitors} value={stats.totals.visitors} icon={UserRound} />
                <StatCard label={L.newVisitors} value={stats.totals.new_visitors} icon={TrendingUp} tone="good" />
                <StatCard label={L.returning} value={stats.totals.returning_visitors} icon={RefreshCw} />
                <StatCard label={L.pageViews} value={stats.totals.page_views} icon={Eye} />
                <StatCard label={L.productViews} value={stats.totals.product_views} icon={ShoppingBag} />
                <StatCard label={L.addToCart} value={stats.totals.add_to_cart} icon={ShoppingBag} />
                <StatCard label={L.checkoutStart} value={stats.totals.checkout_start} icon={Activity} />
                <StatCard label={L.orders} value={stats.totals.orders} icon={ShoppingBag} />
                <StatCard label={L.conversion} value={`${stats.totals.conversion}%`} icon={TrendingUp} tone="good" />
              </div>

              <h3 className="va-subtitle"><TrendingUp size={16} />{L.chart}</h3>
              <TrendChart data={stats.daily} L={L} />

              <div className="va-grid-2">
                <div className="va-card">
                  <h4>{L.popularProducts}</h4>
                  {stats.popular_products.length ? (
                    <table className="va-table compact">
                      <tbody>
                        {stats.popular_products.map((product) => (
                          <tr key={product.id}>
                            <td>{productName(product, lang)}</td>
                            <td className="va-right">{product.views} {L.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="va-empty">{L.noData}</p>}
                </div>

                <div className="va-card">
                  <h4>{L.popularCategories}</h4>
                  {stats.popular_categories.length ? (
                    <table className="va-table compact">
                      <tbody>
                        {stats.popular_categories.map((category) => (
                          <tr key={category.id}>
                            <td>{categoryName(category, lang)}</td>
                            <td className="va-right">{category.views} {L.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="va-empty">{L.noData}</p>}
                </div>

                <div className="va-card">
                  <h4><MonitorSmartphone size={15} />{L.devices}</h4>
                  <Bars items={stats.devices} labelKey="device_type" L={L} />
                </div>

                <div className="va-card">
                  <h4><Globe2 size={15} />{L.sources}</h4>
                  <Bars items={stats.sources} labelKey="source" L={L} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
