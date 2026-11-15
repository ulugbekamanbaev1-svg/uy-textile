const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Пароль берется из настроек Render (VITE_ADMIN_PASSWORD)
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";

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

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const initData = telegramInitData();

  // Если открыто в Telegram, передаем данные пользователя
  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  }

  // --- ДОБАВЛЕНО: Basic Auth (Логин и Пароль) ---
  const username = "admin";
  // Используем unescape(encodeURIComponent()) для безопасного кодирования, если в пароле есть спецсимволы
  const credentials = btoa(unescape(encodeURIComponent(`${username}:${ADMIN_PASSWORD}`)));
  headers.set("Authorization", `Basic ${credentials}`);
  // ----------------------------------------------

  const isFormData = options.body instanceof FormData;

  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "Не удалось выполнить запрос";

    try {
      const data = await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
        message = data.detail[0].msg;
      }
    } catch {
      // ответ без JSON
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function assetUrl(path) {
  if (!path) {
    return "";
  }

  return /^https?:\/\//i.test(path) ? path : `${API}${path}`;
}