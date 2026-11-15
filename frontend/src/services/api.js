const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  const response = await fetch(`${API_URL}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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

export async function trackOrders({ phone, number } = {}) {
  const params = new URLSearchParams();
  if (phone) params.set("phone", phone);
  if (number) params.set("number", number);
  const query = params.toString();

  const response = await fetch(
    `${API_URL}/api/orders/track${query ? `?${query}` : ""}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Не удалось найти заказы");
  }

  return data;
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
