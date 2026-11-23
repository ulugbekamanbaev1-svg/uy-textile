import { useEffect, useState } from "react";
import { adminFetch } from "../services/adminApi";
import { formatPrice } from "../utils/format";

const LEVELS = ["silver", "gold", "platinum", "diamond"];

export default function VipPanel({ t, lang }) {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [o, u, h, st] = await Promise.all([
        adminFetch("/api/admin/vip/overview"),
        adminFetch("/api/admin/vip/users"),
        adminFetch("/api/admin/vip/history"),
        adminFetch("/api/admin/settings"),
      ]);
      setOverview(o); setUsers(u); setHistory(h); setSettings(st);
    } catch (e) {
      setError(e.message || "Xatolik");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
      await adminFetch("/api/admin/vip/recalc", { method: "POST" });
      await load();
    } catch (e) { setError(e.message || "Xatolik"); }
    finally { setSaving(false); }
  };

  const recalc = async () => {
    try {
      await adminFetch("/api/admin/vip/recalc", { method: "POST" });
      await load();
    } catch (e) { setError(e.message || "Xatolik"); }
  };

  const levelLabel = (l) => ({
    silver: t("vipSilver"), gold: t("vipGold"), platinum: t("vipPlatinum"), diamond: t("vipDiamond")
  }[l] || l);

  return (
    <div>
      {error && <div className="admin-error"><p>{error}</p></div>}

      <section className="stats" style={{ marginBottom: 16 }}>
        {LEVELS.map((lvl) => (
          <div className="stat-card" key={lvl}>
            <p>{levelLabel(lvl)}</p>
            <h2>{overview?.counts?.[lvl] ?? "—"}</h2>
          </div>
        ))}
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("vipTitle")}</h3></div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <label className="admin-field">
            <span>{t("vipCriterion")}</span>
            <select
              value={settings?.vip_criterion || "amount"}
              onChange={(e) => setSettings({ ...settings, vip_criterion: e.target.value })}
            >
              <option value="amount">{t("vipCriterionAmount")}</option>
              <option value="count">{t("vipCriterionCount")}</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            {LEVELS.map((lvl) => (
              <label className="admin-field" key={lvl}>
                <span>{levelLabel(lvl)} — {t("vipThreshold")}</span>
                <input
                  type="number"
                  value={settings?.[`vip_${lvl}_threshold`] ?? 0}
                  onChange={(e) => setSettings({ ...settings, [`vip_${lvl}_threshold`]: Number(e.target.value || 0) })}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary-admin-button" onClick={save} disabled={saving}>
              {saving ? t("settingsSaving") : t("refSave")}
            </button>
            <button type="button" className="small-button" onClick={recalc}>{t("vipRecalc")}</button>
          </div>
        </div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("vipUsers")}</h3></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Mijoz</th><th>{t("vipLevel")}</th><th>{t("statusDone")}</th><th>Summa</th><th>{t("vipMetric")}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td><strong>{u.name}</strong><div style={{opacity:.7}}>{u.username ? `@${u.username}` : ""}</div></td>
                <td>{levelLabel(u.vip_level)}</td>
                <td>{u.completed_orders}</td>
                <td>{formatPrice(u.completed_amount, lang)}</td>
                <td>{u.metric}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="5" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="products-card">
        <div className="products-card-head"><h3>{t("vipHistory")}</h3></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Mijoz</th><th>Oldin</th><th>Keyin</th><th>{t("vipMetric")}</th><th>Sana</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.user_name}</td>
                <td>{levelLabel(h.old_level)}</td>
                <td>{levelLabel(h.new_level)}</td>
                <td>{h.metric_value}</td>
                <td>{h.created_at ? new Date(h.created_at).toLocaleString() : ""}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan="5" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}