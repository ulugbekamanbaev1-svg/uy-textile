export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_URL_STORAGE_KEY = "admin_api_url";
const DEFAULT_LOCAL_API = "http://localhost:8000";

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function isLocalHost() {
  if (typeof window === "undefined") return true;

  const { hostname, protocol } = window.location;

  return (
    protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

export function resolveApiBase() {
  const fromEnv = normalizeUrl(import.meta.env.VITE_API_URL);
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    try {
      const saved = normalizeUrl(
        window.localStorage.getItem(API_URL_STORAGE_KEY)
      );
      if (saved) return saved;
    } catch {
      // localStorage может быть недоступен
    }
  }

  if (isLocalHost()) return DEFAULT_LOCAL_API;

  // На хостинге без VITE_API_URL пробуем тот же домен (если backend проксируется).
  return normalizeUrl(window.location.origin);
}

export let API_BASE = resolveApiBase();

export function setApiBase(url) {
  const normalized = normalizeUrl(url);

  if (typeof window !== "undefined") {
    if (normalized) {
      window.localStorage.setItem(API_URL_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(API_URL_STORAGE_KEY);
    }
  }

  API_BASE = resolveApiBase();

  return API_BASE;
}

function telegramInitData() {
  try {
    return window.Telegram?.WebApp?.initData || "";
  } catch {
    return "";
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function getStoredPassword() {
  try {
    return window.localStorage.getItem("admin_password") || "";
  } catch {
    return "";
  }
}

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const initData = telegramInitData();

  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  // Пароль, введённый на экране входа, либо VITE_ADMIN_PASSWORD (по умолчанию admin123).
  const password =
    getStoredPassword() ||
    import.meta.env.VITE_ADMIN_PASSWORD ||
    "admin123";
  const credentials = utf8ToBase64(`admin:${password}`);
  headers.set("Authorization", `Basic ${credentials}`);

  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "Сервер недоступен. Проверьте адрес API и CORS.",
      0
    );
  }

  if (!response.ok) {
    let message = "Не удалось выполнить запрос";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {}
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("json")) {
    throw new ApiError(
      "Сервер вернул не JSON. Похоже, в настройках указан неверный адрес API.",
      response.status
    );
  }

  return response.json();
}

export async function adminDownload(path, filename = "export.csv") {
  const headers = new Headers();
  const initData = telegramInitData();

  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  const password =
    getStoredPassword() ||
    import.meta.env.VITE_ADMIN_PASSWORD ||
    "admin123";
  headers.set("Authorization", `Basic ${utf8ToBase64(`admin:${password}`)}`);

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new ApiError("Сервер недоступен. Проверьте адрес API и CORS.", 0);
  }

  if (!response.ok) {
    throw new ApiError("Не удалось скачать файл", response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function assetUrl(path) {
  if (!path) return "";
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}
