import { useState } from "react";

import {
  API_BASE,
  adminFetch,
  setApiBase
} from "../services/adminApi";

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(API_BASE);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Сохраняем пароль, чтобы adminFetch мог использовать его для запросов
    localStorage.setItem("admin_password", password);

    try {
      // Тестовый запрос: если пароль верный — сервер ответит успехом
      await adminFetch("/api/admin/summary");
      onLogin();
    } catch (err) {
      localStorage.removeItem("admin_password");

      if (err?.status === 0) {
        setError(
          "Не удалось связаться с сервером. Проверьте адрес API ниже — он должен совпадать с адресом backend на Render."
        );
        setShowSettings(true);
      } else if (err?.message && err.message.includes("не JSON")) {
        setError(
          "Похоже, адрес API указан неверно. Введите адрес backend на Render в настройках подключения ниже."
        );
        setShowSettings(true);
      } else if (err?.status === 401) {
        setError(
          `Неверный пароль. Пароль по умолчанию — admin123 (если на сервере не задана переменная ADMIN_PASSWORD).`
        );
      } else if (err?.status === 403) {
        setError("Доступ запрещён. Проверьте настройки администратора на сервере.");
      } else if (err?.status === 503) {
        setError(
          "Сервер не настроен для входа. Проверьте переменные окружения backend (ADMIN_PASSWORD)."
        );
      } else {
        setError(err?.message || "Не удалось войти. Попробуйте ещё раз.");
      }
    } finally {
      setLoading(false);
    }
  };

  const saveApiUrl = () => {
    setApiBase(apiUrl);
    setShowSettings(false);
    setError("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        backgroundColor: "#2b3029"
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          padding: "32px",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "420px",
          textAlign: "center"
        }}
      >
        <h2 style={{ marginBottom: "8px", fontSize: "24px" }}>Вход в админку</h2>
        <p style={{ marginTop: 0, marginBottom: "20px", color: "#777", fontSize: "13px" }}>
          Farrux shop (Hozorosp)
        </p>

        {error && (
          <p
            style={{
              color: "#b42318",
              background: "#fef3f2",
              border: "1px solid #fecdca",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "15px",
              fontSize: "13px",
              textAlign: "left",
              lineHeight: 1.45
            }}
          >
            {error}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "15px" }}
        >
          <input
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              fontSize: "16px"
            }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#4a5240",
              color: "white",
              fontSize: "16px",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "Проверка..." : "Войти"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          style={{
            marginTop: "16px",
            background: "none",
            border: "none",
            color: "#66705f",
            fontSize: "13px",
            textDecoration: "underline",
            cursor: "pointer"
          }}
        >
          Настройки подключения (адрес сервера)
        </button>

        {showSettings && (
          <div
            style={{
              marginTop: "12px",
              padding: "14px",
              background: "#f6f5f0",
              borderRadius: "10px",
              textAlign: "left"
            }}
          >
            <label
              style={{ display: "block", fontSize: "12px", marginBottom: "6px", color: "#555" }}
            >
              Адрес API (backend на Render), например:
              <br />
              <code>https://farrux-api.onrender.com</code>
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://ваш-backend.onrender.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontSize: "14px"
              }}
            />
            <button
              type="button"
              onClick={saveApiUrl}
              style={{
                marginTop: "10px",
                padding: "9px 14px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#4a5240",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              Сохранить адрес
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
