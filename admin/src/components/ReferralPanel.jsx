import { useEffect, useState } from "react";
import { adminFetch } from "../services/adminApi";
import { formatPrice } from "../utils/format";

export default function ReferralPanel({ t, lang }) {
  const [stats, setStats] = useState(null);
  const [referrers, setReferrers] = useState([]);
  const [invited, setInvited] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [suspicious, setSuspicious] = useState([]);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [s, r, i, rw, su, st] = await Promise.all([
        adminFetch("/api/admin/referral/stats"),
        adminFetch("/api/admin/referral/referrers"),
        adminFetch("/api/admin/referral/invited"),
        adminFetch("/api/admin/referral/rewards"),
        adminFetch("/api/admin/referral/suspicious"),
        adminFetch("/api/admin/settings"),
      ]);
      setStats(s); setReferrers(r); setInvited(i); setRewards(rw); setSuspicious(su); setSettings(st);
    } catch (e) {
      setError(e.message || "Xatolik");
    }
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
    } catch (e) {
      setError(e.message || "Xatolik");
    } finally {
      setSaving(false);
    }
  };

  const cancelReward = async (id) => {
    if (!cancelReason.trim()) return;
    try {
      await adminFetch(`/api/admin/referral/rewards/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setCancelId(null);
      setCancelReason("");
      load();
    } catch (e) {
      setError(e.message || "Xatolik");
    }
  };

  return (
    <div>
      {error && <div className="admin-error"><p>{error}</p></div>}

      <section className="stats" style={{ marginBottom: 16 }}>
        <div className="stat-card"><p>{t("refInvites")}</p><h2>{stats?.invited_total ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("refSuccessful")}</p><h2>{stats?.successful_total ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("refRewards")}</p><h2>{stats ? formatPrice(stats.reward_amount_total, lang) : "—"}</h2></div>
        <div className="stat-card"><p>{t("refCancelled")}</p><h2>{stats?.cancelled_total ?? "—"}</h2></div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("menuReferral")}</h3></div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <label className="flag">
            <input
              type="checkbox"
              checked={Boolean(settings?.referral_enabled)}
              onChange={(e) => setSettings({ ...settings, referral_enabled: e.target.checked })}
            />
            {t("refEnabled")}
          </label>
          <label className="admin-field">
            <span>{t("refRewardAmount")}</span>
            <input
              type="number"
              value={settings?.referral_reward_amount ?? 0}
              onChange={(e) => setSettings({ ...settings, referral_reward_amount: Number(e.target.value || 0) })}
            />
          </label>
          <div>
            <button type="button" className="primary-admin-button" onClick={saveSettings} disabled={saving}>
              {saving ? t("settingsSaving") : t("refSave")}
            </button>
          </div>
        </div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("refInviters")}</h3></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Mijoz</th><th>{t("refInvites")}</th><th>{t("refSuccessful")}</th><th>{t("refRewards")}</th></tr></thead>
          <tbody>
            {referrers.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.name}</strong><div style={{opacity:.7}}>{r.username ? `@${r.username}` : ""} {r.referral_code ? `· ${r.referral_code}` : ""}</div></td>
                <td>{r.invited}</td><td>{r.successful}</td><td>{formatPrice(r.earned, lang)}</td>
              </tr>
            ))}
            {referrers.length === 0 && <tr><td colSpan="4" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("refInvitees")}</h3></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Taklif qilingan</th><th>Taklif qilgan</th><th>{t("statusDone")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {invited.map((r) => (
              <tr key={r.user_id}>
                <td><strong>{r.name}</strong><div style={{opacity:.7}}>{r.username ? `@${r.username}` : ""}</div></td>
                <td>{r.referrer_name || "—"}</td>
                <td>{r.completed_orders}</td>
                <td>{r.reward_status || "—"}</td>
              </tr>
            ))}
            {invited.length === 0 && <tr><td colSpan="4" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("refHistory")}</h3></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Taklif qilgan</th><th>Taklif qilingan</th><th>Buyurtma</th><th>Summa</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id}>
                <td>{r.referrer_name}</td>
                <td>{r.referred_name}</td>
                <td>#{r.order_id}</td>
                <td>{formatPrice(r.amount, lang)}</td>
                <td>{r.status}{r.cancelled_reason ? <div style={{opacity:.7}}>{r.cancelled_reason}</div> : null}</td>
                <td>
                  {r.status === "earned" && (
                    cancelId === r.id ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t("refCancelReason")} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="small-button" onClick={() => cancelReward(r.id)}>{t("refSave")}</button>
                          <button type="button" className="small-button" onClick={() => { setCancelId(null); setCancelReason(""); }}>{t("cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="small-button" onClick={() => setCancelId(r.id)}>{t("refCancelReward")}</button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {rewards.length === 0 && <tr><td colSpan="6" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="products-card">
        <div className="products-card-head"><h3>{t("refSuspicious")}</h3></div>
        <div style={{ padding: 16 }}>
          {suspicious.length === 0 ? <p className="admin-note">Shubhali holatlar topilmadi</p> : (
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(suspicious, null, 2)}</pre>
          )}
        </div>
      </section>
    </div>
  );
}