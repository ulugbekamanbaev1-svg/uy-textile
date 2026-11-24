import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";

import { adminFetch } from "../services/adminApi";

export default function CurrencyPanel({ t }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [refreshMinutes, setRefreshMinutes] = useState(15);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/currency/status");
      setStatus(data);
      setEnabled(Boolean(data.enabled));
      setRefreshMinutes(Number(data.refresh_minutes || 15));
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/currency/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled, refresh_minutes: Number(refreshMinutes) }),
      });
      setStatus(data);
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const refreshNow = async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/currency/refresh", { method: "POST" });
      setStatus(data);
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <p className="admin-note">{t("loading")}</p>;

  const bankCounts = status?.bank_counts || {};

  return (
    <div className="admin-panel">
      {error && <div className="admin-error"><p>{error}</p></div>}

      <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-label">{t("currencyStatus")}</div>
          <div className="admin-stat-value" style={{ fontSize: 18 }}>
            {status?.enabled ? t("currencyEnabled") : t("currencyDisabled")}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">{t("currencyProvider")}</div>
          <div className="admin-stat-value" style={{ fontSize: 18 }}>{status?.provider_name || status?.provider || "—"}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">{t("currencyCacheEntries")}</div>
          <div className="admin-stat-value">{status?.cache_entries ?? 0}</div>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head">
          <h3>{t("currencyAdminTitle")}</h3>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
          <label className="admin-field">
            <span>{t("currencyStatus")}</span>
            <select value={enabled ? "1" : "0"} onChange={(e) => setEnabled(e.target.value === "1")}>
              <option value="1">{t("currencyEnabled")}</option>
              <option value="0">{t("currencyDisabled")}</option>
            </select>
          </label>
          <label className="admin-field">
            <span>{t("currencyRefreshMinutes")}</span>
            <input type="number" min="5" max="1440" value={refreshMinutes} onChange={(e) => setRefreshMinutes(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="admin-save-btn" style={{display:"inline-flex",alignItems:"center",gap:6}} onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? t("saving") : t("currencySave")}
          </button>
          <button type="button" className="admin-filter-btn" style={{display:"inline-flex",alignItems:"center",gap:6}} onClick={refreshNow} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "spin" : ""} /> {refreshing ? t("currencyRefreshing") : t("currencyRefreshNow")}
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-head"><h3>{t("currencyStatus")}</h3></div>
        <div style={{display:"grid",gap:0}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>{t("currencyProvider")}</span><b>{status?.provider_name || "—"}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>URL</span><b style={{ wordBreak: "break-all" }}>{status?.source_url || "—"}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>{t("currencySupported")}</span><b>{(status?.supported_currencies || []).join(", ")}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>{t("currencyLastSuccess")}</span><b>{status?.last_success_at || "—"}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>{t("currencyLastError")}</span><b style={{ color: status?.last_error ? "#ef4444" : undefined }}>{status?.last_error || t("currencyNoError")}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span>{t("currencyStale")}</span><b>{(status?.stale_currencies || []).length ? status.stale_currencies.join(", ") : "—"}</b></div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-head"><h3>{t("currencyBanksCount")}</h3></div>
        <div className="admin-stats-grid">
          {Object.keys(bankCounts).map((cur) => (
            <div key={cur} className="admin-stat-card">
              <div className="admin-stat-label">{cur}</div>
              <div className="admin-stat-value">{bankCounts[cur]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}