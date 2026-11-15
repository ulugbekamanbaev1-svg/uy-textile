const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const initData = telegramInitData();

  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  // Берем пароль из localStorage (который мы сохранили на экране входа)
  const password = localStorage.getItem("admin_password") || import.meta.env.VITE_ADMIN_PASSWORD || "admin123";
  const credentials = utf8ToBase64(`admin:${password}`);
  headers.set("Authorization", `Basic ${credentials}`);

  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = "Не удалось выполнить запрос";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {}
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function assetUrl(path) {
  if (!path) return "";
  return /^https?:\/\//i.test(path) ? path : `${API}${path}`;
}