import { useState } from "react";
import { adminFetch } from "../services/adminApi";

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Временно сохраняем пароль, чтобы adminFetch мог его использовать для проверки
    localStorage.setItem("admin_password", password);

    try {
      // Пробуем сделать тестовый запрос. Если пароль верный — сервер ответит успехом
      await adminFetch("/api/admin/summary"); 
      onLogin(); // Если всё ок, пускаем в админку
    } catch (err) {
      setError("Неверный пароль. Попробуйте снова.");
      localStorage.removeItem("admin_password"); // Удаляем неверный пароль
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", padding: "20px", backgroundColor: "#2b3029" }}>
      <div style={{ backgroundColor: "#fff", padding: "40px", borderRadius: "16px", width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px", fontSize: "24px" }}>Вход в админку</h2>
        
        {error && <p style={{ color: "red", marginBottom: "15px", fontSize: "14px" }}>{error}</p>}
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <input
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px" }}
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: "12px", borderRadius: "8px", border: "none", backgroundColor: "#4a5240", color: "white", fontSize: "16px", cursor: "pointer" }}
          >
            {loading ? "Проверка..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}