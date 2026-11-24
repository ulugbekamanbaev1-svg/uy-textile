function resolveApiUrl() {
  const fromEnv = String(import.meta.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    try {
      const saved = String(window.localStorage.getItem("uy_api_url") || "")
        .trim()
        .replace(/\/+$/, "");
      if (saved) return saved;
    } catch {
      // localStorage может быть недоступен
    }

    const { hostname, protocol, origin } = window.location;
    const isLocal =
      protocol === "file:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";

    if (!isLocal) {
      // На хостинге без VITE_API_URL используем тот же домен.
      return origin.replace(/\/+$/, "");
    }
  }

  return "http://localhost:8000";
}

export const API_BASE = resolveApiUrl();

const API_URL = API_BASE;

async function request(path) {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function assetUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_URL}${path}`;
}

export async function checkServer() {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error("Server error");
  }

  return response.json();
}

export async function telegramLogin(initData) {
  const response = await fetch(`${API_URL}/api/auth/telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ initData })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Telegram login failed");
  }

  return data;
}

export function fetchCategories() {
  return request("/api/catalog/categories");
}

export function fetchProducts({ category, search, featured, sort } = {}) {
  const params = new URLSearchParams();

  if (category) params.set("category", category);
  if (search) params.set("search", search);
  if (featured) params.set("featured", "true");
  if (sort) params.set("sort", sort);

  const query = params.toString();

  return request(`/api/catalog/products${query ? `?${query}` : ""}`);
}

export function fetchProduct(slug) {
  return request(`/api/catalog/products/${slug}`);
}

export function fetchStoreSettings() {
  return request("/api/settings");
}

export function fetchAdminSummary() {
  return request("/api/admin/summary");
}

export function fetchAdminProducts() {
  return request("/api/admin/products");
}

export async function createOrder(payload) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const headers = {
    "Content-Type": "application/json"
  };
  if (initData) {
    headers["X-Telegram-Init-Data"] = initData;
  }

  const response = await fetch(`${API_URL}/api/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Не удалось отправить заказ";

    throw new Error(detail);
  }

  return data;
}

export async function fetchMyOrders() {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) {
    throw new Error("Требуется авторизация Telegram");
  }

  const response = await fetch(`${API_URL}/api/orders/my`, {
    headers: {
      "X-Telegram-Init-Data": initData
    }
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Не удалось загрузить заказы";
    throw new Error(detail);
  }

  return data;
}

// Совместимость со старым именем: теперь возвращает только свои заказы.
export async function trackOrders() {
  return fetchMyOrders();
}

export function fetchAdminOrders() {
  return request("/api/admin/orders");
}

export async function updateOrderStatus(orderId, status) {
  const response = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Не удалось обновить статус");
  }

  return data;
}

export async function syncCart(items, total) {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) return null;

  const payload = {
    initData,
    total: Math.round(Number(total) || 0),
    items: (items || []).map((item) => {
      const qtyLabel =
        item.pricingType === "meter"
          ? `${item.meters || 0} m`
          : item.widthCm && item.heightCm
            ? `${item.qty || 1} x (${item.widthCm}x${item.heightCm})`
            : String(item.qty || 1);
      return {
        name: item.name_ru || item.name_uz || item.name_uzc || item.slug || "Товар",
        qty_label: qtyLabel,
        line_total: Math.round(Number(item.lineTotal ?? item.total ?? 0) || 0),
        image_url: item.image_url || ""
      };
    })
  };

  try {
    const response = await fetch(`${API_URL}/api/cart/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ---------------- Farrux Shop QR attribution ----------------

const QR_ATTR_KEY = "farrux_qr_attribution";
const QR_VISITOR_KEY = "farrux_qr_visitor_id";
const QR_OPEN_SENT_KEY = "farrux_qr_open_sent";

function randomId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
  } catch {
    // ignore
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export function getQrVisitorId() {
  try {
    let id = window.localStorage.getItem(QR_VISITOR_KEY);
    if (id && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
    id = randomId();
    window.localStorage.setItem(QR_VISITOR_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function getQrAttribution() {
  try {
    const raw = window.localStorage.getItem(QR_ATTR_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || !data?.visitor_id) return null;
    const ageDays = (Date.now() - Number(data.captured_at || 0)) / 86400000;
    if (ageDays > 30) return null;
    return data;
  } catch {
    return null;
  }
}

export function captureQrAttribution(startParam) {
  const raw = String(startParam || "").trim();
  const match = raw.match(/^qr_([A-Za-z0-9_-]{1,48})$/i);
  if (!match) return null;

  const token = match[1];
  const visitor_id = getQrVisitorId();
  const data = { token, visitor_id, captured_at: Date.now() };

  try {
    window.localStorage.setItem(QR_ATTR_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }

  return data;
}

export async function sendQrMiniAppOpen(startParam) {
  const attr = captureQrAttribution(startParam) || getQrAttribution();
  if (!attr) return false;

  const sessionKey = `${attr.token}:${attr.visitor_id}`;
  try {
    if (window.sessionStorage.getItem(QR_OPEN_SENT_KEY) === sessionKey) {
      return false;
    }
  } catch {
    // ignore
  }

  try {
    const response = await fetch(`${API_URL}/api/qr/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "miniapp_open",
        token: attr.token,
        visitor_id: attr.visitor_id
      })
    });

    if (response.ok) {
      try {
        window.sessionStorage.setItem(QR_OPEN_SENT_KEY, sessionKey);
      } catch {
        // ignore
      }
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

// ---------------- Farrux QR Referral ----------------

async function tgGet(path) {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) throw new Error("Требуется авторизация Telegram");
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "X-Telegram-Init-Data": initData }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

async function tgPost(path, payload) {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) throw new Error("Требуется авторизация Telegram");
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData
    },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export function fetchReferralMe() {
  return tgGet("/api/referral/me");
}

export function attachReferral(code) {
  return tgPost("/api/referral/attach", { code });
}

export function getReferralQrPngUrl() {
  return `${API_URL}/api/referral/qr/png`;
}

export function getReferralQrPdfUrl() {
  return `${API_URL}/api/referral/qr/pdf`;
}

export async function downloadReferralFile(kind = "png") {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) throw new Error("Требуется авторизация Telegram");
  const path = kind === "pdf" ? "/api/referral/qr/pdf" : "/api/referral/qr/png";
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "X-Telegram-Init-Data": initData }
  });
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = kind === "pdf" ? "farrux-referral.pdf" : "farrux-referral.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fetchMyVip() {
  return tgGet("/api/vip/me");
}


export function fetchCurrencyRates(currency = "USD", sourceType = "bank", sort = "name") {
  const params = new URLSearchParams({ currency, source_type: sourceType, sort });
  return request(`/api/currency/rates?${params.toString()}`);
}

export function fetchCurrencyBest(currency = "USD", sourceType = "bank") {
  const params = new URLSearchParams({ currency, source_type: sourceType });
  return request(`/api/currency/best?${params.toString()}`);
}

export function fetchCurrencySources() {
  return request("/api/currency/sources");
}

export function convertCurrency({ amount, from, to, operation = "buy", bank = "best", sourceType = "bank" }) {
  const params = new URLSearchParams({
    amount: String(amount),
    from,
    to,
    operation,
    bank: bank || "best",
    source_type: sourceType,
  });
  return request(`/api/currency/convert?${params.toString()}`);
}


// Group purchases (Birgalikda)
export function fetchMyGroupPurchases() { return tgGet('/api/group-purchases/my'); }
export function fetchGroupByInvite(token) { return tgGet(`/api/group-purchases/invite/${encodeURIComponent(token)}`); }
export function fetchGroupDetail(id) { return tgGet(`/api/group-purchases/${id}`); }
export function createGroupPurchase(payload) { return tgPost('/api/group-purchases', payload); }
export function joinGroupPurchase(payload) { return tgPost('/api/group-purchases/join', payload); }
export function leaveGroupPurchase(id) { return tgPost(`/api/group-purchases/${id}/leave`, {}); }
export function requestGroupPayment(id, payload) { return tgPost(`/api/group-purchases/${id}/payment-request`, payload || {}); }
