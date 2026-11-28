/**
 * Visitor Tracker — first-party аналитика магазина.
 *
 * Что делает:
 *  - создаёт анонимный UUID посетителя и UUID сессии;
 *  - отправляет session/start, heartbeat каждые 30 секунд и события;
 *  - переживает перезагрузку (sessionStorage), офлайн-очередь в localStorage;
 *  - уважает отказ от аналитики (согласие хранится локально и на сервере);
 *  - не собирает IP, User-Agent, пароли, телефоны и платёжные данные.
 */

import {
  analyticsConsent,
  analyticsEvent,
  analyticsHeartbeat,
  analyticsIdentify,
  analyticsSessionEnd,
  analyticsSessionStart
} from "./api";
import {
  CONSENT_KEY,
  MAX_QUEUE,
  QUEUE_KEY,
  SESSION_KEY,
  VISITOR_KEY,
  buildEventPayload,
  createUuid,
  dedupeKey,
  isConsentAllowed,
  isDuplicate,
  isUuid,
  normalizeConsent,
  normalizePage,
  parseQueue,
  routeToPath,
  trimQueue
} from "./visitorTrackerCore";

const HEARTBEAT_MS = 30_000;
const SESSION_RETRY_MS = 5_000;

function readStorage(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(store, key, value) {
  try {
    if (value === null || value === undefined) {
      store.removeItem(key);
    } else {
      store.setItem(key, value);
    }
  } catch {
    // приватный режим / отключённое хранилище
  }
}

function browserStorage(kind) {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

class VisitorTracker {
  constructor() {
    this.initialized = false;
    this.enabled = true;
    this.visitorUuid = "";
    this.sessionUuid = "";
    this.sessionActive = false;
    this.sessionStarting = false;
    this.currentPage = "/";
    this.initData = "";
    this.userKey = "";
    this.heartbeatTimer = null;
    this.retryTimer = null;
    this.dedupe = new Map();
    this.queue = [];
    this.pending = [];
    this.flushing = false;
    this.listenersBound = false;
  }

  // ---------- lifecycle ----------

  init({ page, language = "ru" } = {}) {
    if (this.initialized) {
      if (page) this.currentPage = normalizePage(page);
      return;
    }

    this.initialized = true;
    this.language = language;

    const local = browserStorage("local");
    const session = browserStorage("session");

    this.enabled = isConsentAllowed(readStorage(local, CONSENT_KEY));
    this.visitorUuid = this._ensureVisitorUuid();
    this.sessionUuid = this._ensureSessionUuid();
    this.currentPage = normalizePage(page || this._documentPath());
    this.queue = parseQueue(readStorage(local, QUEUE_KEY));

    this._bindListeners();

    if (this.enabled) {
      this._startSession();
      this.flushQueue();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getVisitorUuid() {
    return this.visitorUuid;
  }

  // ---------- consent ----------

  async setConsent(allowed) {
    const next = Boolean(allowed);
    this.enabled = next;

    const local = browserStorage("local");
    writeStorage(local, CONSENT_KEY, normalizeConsent(next));
    this.visitorUuid = this._ensureVisitorUuid();

    try {
      await analyticsConsent({
        visitor_uuid: this.visitorUuid,
        analytics_consent: next,
        consent_version: "1"
      });
    } catch {
      // офлайн: локальный выбор всё равно сохранён и применится при старте
    }

    if (!next) {
      await this.endSession();
      this.queue = [];
      this.pending = [];
      writeStorage(local, QUEUE_KEY, null);
      this._stopHeartbeat();
      return;
    }

    this._startSession();
    this.flushQueue();
  }

  // ---------- auth ----------

  setAuth({ initData, user } = {}) {
    this.initData = initData || "";
    const key = user?.id ? String(user.id) : "";
    const isNewUser = Boolean(key) && key !== this.userKey;
    this.userKey = key;

    if (!this.enabled || !key) return;

    if (this.initData) {
      analyticsIdentify(this.visitorUuid, this.initData).catch(() => {});
    }

    if (isNewUser) {
      this._track("login", { data: { user_id: key } });
    }
  }

  trackLogout() {
    if (this.enabled) {
      this._track("logout", { data: {} });
    }
    this.userKey = "";
    this.initData = "";
  }

  // ---------- page & events ----------

  trackPage(routeOrPath) {
    const path =
      typeof routeOrPath === "string" ? normalizePage(routeOrPath) : routeToPath(routeOrPath);

    if (isDuplicate(this.dedupe, dedupeKey("page_view", path), Date.now(), 1200)) {
      return;
    }

    this.currentPage = path;
    this._track("page_view", { pageUrl: path });
  }

  trackProductView(product) {
    if (!product?.id) return;
    const key = dedupeKey("product_view", product.id);
    if (isDuplicate(this.dedupe, key, Date.now(), 1500)) return;

    this._track("product_view", {
      productId: product.id,
      categoryId: product.category_id ?? null,
      data: {
        slug: product.slug || "",
        category_slug: product.category_slug || ""
      }
    });
  }

  trackCategoryView(category) {
    if (!category?.id) return;
    const key = dedupeKey("category_view", category.id);
    if (isDuplicate(this.dedupe, key, Date.now(), 1500)) return;

    this._track("category_view", {
      categoryId: category.id,
      data: { slug: category.slug || "" }
    });
  }

  trackSearch(query, results = null) {
    const text = String(query || "").trim();
    if (text.length < 2) return;

    const key = dedupeKey("search", text.toLowerCase());
    if (isDuplicate(this.dedupe, key, Date.now(), 2000)) return;

    this._track("search", {
      data: {
        query: text.slice(0, 120),
        results: Number.isFinite(Number(results)) ? Number(results) : null
      }
    });
  }

  trackAddToCart(item, qty = 1) {
    const productId = item?.id ?? item?.productId;
    if (!productId) return;
    this._track("add_to_cart", {
      productId,
      data: {
        slug: item.slug || "",
        qty: Number(qty) || 1,
        price: Math.round(Number(item.unitPrice ?? item.price) || 0),
        pricing_type: item.pricingType || item.pricing_type || "piece"
      }
    });
  }

  trackRemoveFromCart(item) {
    const productId = item?.id ?? item?.productId;
    if (!productId) return;
    this._track("remove_from_cart", {
      productId,
      data: {
        slug: item.slug || "",
        qty: Number(item.qty) || 1
      }
    });
  }

  trackCheckoutStart(items = [], total = 0) {
    const key = dedupeKey("checkout_start", this.sessionUuid);
    if (isDuplicate(this.dedupe, key, Date.now(), 60_000)) return;

    this._track("checkout_start", {
      data: {
        items: items.length,
        total: Math.round(Number(total) || 0)
      }
    });
  }

  trackOrderCreated(order, { total = 0, items = 0 } = {}) {
    this._track("order_created", {
      data: {
        number: String(order?.number || "").slice(0, 40),
        total: Math.round(Number(total) || 0),
        items: Number(items) || 0
      }
    });
  }

  async endSession() {
    this.sessionActive = false;
    this._stopHeartbeat();

    if (!this.visitorUuid || !this.sessionUuid) return;

    try {
      await analyticsSessionEnd({
        visitor_uuid: this.visitorUuid,
        session_uuid: this.sessionUuid
      });
    } catch {
      // закрытие сессии не критично: сервер пометит её expired
    } finally {
      this.sessionUuid = createUuid();
      writeStorage(browserStorage("session"), SESSION_KEY, this.sessionUuid);
    }
  }

  // ---------- queue ----------

  async flushQueue() {
    if (this.flushing || !this.enabled || !this.sessionActive) return;
    if (!this.queue.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    this.flushing = true;
    const remaining = [];

    for (const payload of this.queue) {
      try {
        await analyticsEvent(payload);
      } catch (error) {
        // 400/403 — событие невалидно или согласие отозвано: выбрасываем.
        if (error?.status === 400 || error?.status === 403) continue;
        remaining.push(payload);
      }
    }

    this.queue = remaining;
    writeStorage(browserStorage("local"), QUEUE_KEY, JSON.stringify(trimQueue(this.queue)));
    this.flushing = false;
  }

  // ---------- internals ----------

  _ensureVisitorUuid() {
    const store = browserStorage("local");
    const saved = readStorage(store, VISITOR_KEY);
    if (isUuid(saved)) return saved;

    const value = createUuid();
    writeStorage(store, VISITOR_KEY, value);
    return value;
  }

  _ensureSessionUuid() {
    const store = browserStorage("session");
    const saved = readStorage(store, SESSION_KEY);
    if (isUuid(saved)) return saved;

    const value = createUuid();
    writeStorage(store, SESSION_KEY, value);
    return value;
  }

  _documentPath() {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}`;
  }

  _startSession() {
    if (!this.enabled || this.sessionStarting) return;

    this.sessionStarting = true;
    const payload = {
      visitor_uuid: this.visitorUuid,
      session_uuid: this.sessionUuid,
      page: this.currentPage,
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      language: this.language || "ru"
    };

    analyticsSessionStart(payload)
      .then((result) => {
        this.sessionStarting = false;

        if (result?.enabled === false || result?.consent === false) {
          this.enabled = false;
          writeStorage(browserStorage("local"), CONSENT_KEY, "0");
          this._stopHeartbeat();
          return;
        }

        this.sessionActive = Boolean(result?.active);
        if (!this.sessionActive) return;

        this._startHeartbeat();
        this._flushPending();
        this.flushQueue();
      })
      .catch(() => {
        this.sessionStarting = false;
        if (!this.enabled) return;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this._startSession();
        }, SESSION_RETRY_MS);
      });
  }

  _flushPending() {
    if (!this.pending.length) return;
    const events = this.pending;
    this.pending = [];
    events.forEach((event) => this._send(event));
  }

  _track(eventType, { pageUrl, productId, categoryId, data } = {}) {
    if (!this.enabled) return;

    const payload = buildEventPayload({
      visitorUuid: this.visitorUuid,
      sessionUuid: this.sessionUuid,
      eventType,
      eventUuid: createUuid(),
      pageUrl: pageUrl || this.currentPage,
      productId,
      categoryId,
      eventData: data
    });

    if (!this.sessionActive) {
      this.pending.push(payload);
      this.pending = trimQueue(this.pending, MAX_QUEUE);
      return;
    }

    this._send(payload);
  }

  _send(payload) {
    if (!this.enabled) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this._enqueue(payload);
      return;
    }

    analyticsEvent(payload).catch((error) => {
      if (error?.status === 403) {
        this.enabled = false;
        writeStorage(browserStorage("local"), CONSENT_KEY, "0");
        this._stopHeartbeat();
        return;
      }
      if (error?.status === 400) return;
      this._enqueue(payload);
    });
  }

  _enqueue(payload) {
    this.queue.push(payload);
    this.queue = trimQueue(this.queue, MAX_QUEUE);
    writeStorage(
      browserStorage("local"),
      QUEUE_KEY,
      JSON.stringify(this.queue)
    );
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  _heartbeat() {
    if (!this.enabled || !this.sessionActive) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    analyticsHeartbeat({
      visitor_uuid: this.visitorUuid,
      session_uuid: this.sessionUuid,
      page: this.currentPage
    })
      .then((result) => {
        if (result?.consent === false) {
          this.enabled = false;
          writeStorage(browserStorage("local"), CONSENT_KEY, "0");
          this._stopHeartbeat();
          return;
        }
        if (result?.active === false) {
          this.sessionActive = false;
          this._stopHeartbeat();
          this._startSession();
        }
      })
      .catch(() => {
        // сеть пропала — догоним при следующем тике / online
      });
  }

  _bindListeners() {
    if (this.listenersBound || typeof window === "undefined") return;
    this.listenersBound = true;

    window.addEventListener("online", () => {
      if (!this.enabled) return;
      if (!this.sessionActive) {
        this._startSession();
      } else {
        this.flushQueue();
      }
    });

    window.addEventListener("offline", () => {
      // Ничего не делаем: события копятся в очереди.
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this._heartbeat();
        this.flushQueue();
      } else if (this.enabled && this.sessionActive) {
        // keepalive-запрос продлевает last_seen_at при сворачивании вкладки.
        analyticsHeartbeat({
          visitor_uuid: this.visitorUuid,
          session_uuid: this.sessionUuid,
          page: this.currentPage
        }).catch(() => {});
      }
    });

    window.addEventListener("pagehide", () => {
      if (!this.enabled || !this.sessionActive) return;
      analyticsHeartbeat({
        visitor_uuid: this.visitorUuid,
        session_uuid: this.sessionUuid,
        page: this.currentPage
      }).catch(() => {});
    });
  }
}

export const visitorTracker = new VisitorTracker();
export default visitorTracker;
