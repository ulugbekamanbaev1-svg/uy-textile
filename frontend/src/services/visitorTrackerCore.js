/**
 * Чистые функции трекера посетителей.
 *
 * Здесь нет доступа к DOM, localStorage или fetch — только вычисления,
 * поэтому файл можно тестировать в Node без браузера.
 */

export const VISITOR_KEY = "uy_visitor_uuid";
export const SESSION_KEY = "uy_visitor_session";
export const CONSENT_KEY = "uy_analytics_consent";
export const QUEUE_KEY = "uy_analytics_queue";
export const MAX_QUEUE = 50;
export const DEDUP_TTL_MS = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Генерирует UUID v4. crypto.randomUUID есть не во всех WebView. */
export function createUuid() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Согласие по умолчанию включено; отключается только явным "0". */
export function isConsentAllowed(storedValue) {
  return storedValue !== "0" && storedValue !== 0 && storedValue !== false;
}

export function normalizeConsent(value) {
  return value === false || value === "0" || value === 0 ? "0" : "1";
}

/** Путь без origin: приватность и единый вид в админке. */
export function normalizePage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/";

  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      path = `${url.pathname}${url.search}`;
    }
  } catch {
    path = raw;
  }

  if (!path.startsWith("/")) path = `/${path}`;
  return path.slice(0, 500);
}

/** Превращает состояние роутера приложения в путь для аналитики. */
export function routeToPath(route) {
  const page = route?.page || "home";

  if (page === "product") {
    return `/product/${encodeURIComponent(route?.slug || "")}`;
  }

  if (page === "catalog") {
    return route?.category
      ? `/catalog?category=${encodeURIComponent(route.category)}`
      : "/catalog";
  }

  return `/${page}`;
}

export function dedupeKey(eventType, value) {
  return `${eventType}:${String(value ?? "")}`;
}

/**
 * Простой TTL-дедупликатор. Возвращает true, если событие нужно пропустить.
 * map мутируется намеренно: это локальная карта трекера.
 */
export function isDuplicate(map, key, now = Date.now(), ttl = DEDUP_TTL_MS) {
  const last = map.get(key);
  if (last !== undefined && now - last < ttl) {
    return true;
  }
  map.set(key, now);

  if (map.size > 200) {
    for (const [oldKey, stamp] of map) {
      if (now - stamp >= ttl) map.delete(oldKey);
    }
  }

  return false;
}

/** Ограничивает очередь, оставляя самые свежие события. */
export function trimQueue(queue, max = MAX_QUEUE) {
  if (!Array.isArray(queue)) return [];
  return queue.slice(-Math.max(1, max));
}

export function parseQueue(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? trimQueue(parsed) : [];
  } catch {
    return [];
  }
}

/** Безопасно читает числовой id из ответа API. */
export function toId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

/** Короткая длительность для интерфейса: 45с, 3м 20с, 1ч 05м. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}с`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    return rest ? `${minutes}м ${rest}с` : `${minutes}м`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes
    ? `${hours}ч ${String(restMinutes).padStart(2, "0")}м`
    : `${hours}ч`;
}

/** Собирает payload события, обрезая строки и убирая пустые поля. */
export function buildEventPayload({
  visitorUuid,
  sessionUuid,
  eventType,
  eventUuid,
  pageUrl,
  productId,
  categoryId,
  eventData
}) {
  const payload = {
    visitor_uuid: visitorUuid,
    session_uuid: sessionUuid,
    event_uuid: eventUuid,
    event_type: eventType,
    page_url: normalizePage(pageUrl)
  };

  const product = toId(productId);
  const category = toId(categoryId);
  if (product) payload.product_id = product;
  if (category) payload.category_id = category;

  if (eventData && typeof eventData === "object") {
    payload.event_data = eventData;
  }

  return payload;
}
