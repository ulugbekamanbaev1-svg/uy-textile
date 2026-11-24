import { useEffect, useState } from "react";
import { adminFetch } from "../services/adminApi";

export default function GroupPurchasePanel({ t }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await adminFetch("/api/admin/group-purchases");
      setItems(res.items || []);
    } catch (e) { setError(e.message || "Error"); }
    finally { setLoading(false); }
  };
  const loadDetail = async (id) => {
    try { setDetail(await adminFetch(`/api/admin/group-purchases/${id}`)); setSelected(id); }
    catch (e) { setError(e.message || "Error"); }
  };
  useEffect(() => { load(); }, []);

  const act = async (path, body) => {
    setError("");
    try {
      await adminFetch(path, { method: "POST", body: JSON.stringify(body || {}) });
      await load();
      if (selected) await loadDetail(selected);
    } catch (e) { setError(e.message || "Error"); }
  };

  if (loading) return <p className="admin-note">{t("loading")}</p>;
  return (
    <div className="admin-panel">
      {error && <div className="admin-error"><p>{error}</p></div>}
      <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
        <div className="admin-stat-card"><div className="admin-stat-label">{t("gpAdminActive")}</div><div className="admin-stat-value">{items.filter(i=>["open","target_reached","payment_pending"].includes(i.status)).length}</div></div>
        <div className="admin-stat-card"><div className="admin-stat-label">{t("gpAdminPaid")}</div><div className="admin-stat-value">{items.filter(i=>i.status==="paid"||i.status==="admin_confirmed").length}</div></div>
        <div className="admin-stat-card"><div className="admin-stat-label">{t("gpAdminCompleted")}</div><div className="admin-stat-value">{items.filter(i=>i.status==="completed").length}</div></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:12 }}>
        <div className="admin-card">
          <div className="admin-card-head"><h3>{t("gpAdminGroups")}</h3></div>
          <div style={{ overflowX:"auto" }}>
            <table className="admin-table" style={{ width:"100%" }}>
              <thead><tr><th>ID</th><th>{t("gpStatus")}</th><th>m</th><th>{t("gpPaymentMode")}</th><th></th></tr></thead>
              <tbody>
                {items.map(g => (
                  <tr key={g.id}>
                    <td>#{g.public_code}</td>
                    <td>{g.status}</td>
                    <td>{Number(g.confirmed_meters).toFixed(1)}/{Number(g.minimum_meters).toFixed(0)}</td>
                    <td>{g.payment_mode}</td>
                    <td><button type="button" className="admin-filter-btn" onClick={()=>loadDetail(g.id)}>{t("gpAdminOpen")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><h3>{t("gpAdminDetail")}</h3></div>
          {!detail ? <p className="admin-note">{t("gpSelect")}</p> : (
            <div style={{ display:"grid", gap:8 }}>
              <div><b>#{detail.public_code}</b> — {detail.status}</div>
              <div>{t("gpPaymentMode")}: {detail.payment_mode}</div>
              <div>{t("gpMeters")}: {Number(detail.confirmed_meters).toFixed(2)} / {Number(detail.minimum_meters).toFixed(2)}</div>
              <div>{t("gpParticipants")}: {detail.participants?.length || 0}</div>
              <div style={{ display:"grid", gap:6 }}>
                {(detail.participants||[]).map(p => (
                  <div key={p.id} style={{ padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                    <div><b>{p.display_name}</b> {p.is_organizer ? "(org)" : ""} — {Number(p.meters).toFixed(2)}m — {p.payment_status}/{p.fulfillment_status}</div>
                    <div style={{ fontSize:12, opacity:.8 }}>{p.phone} {p.address}</div>
                  </div>
                ))}
              </div>
              <label className="admin-field"><span>{t("gpAdminReason")}</span><input value={reason} onChange={e=>setReason(e.target.value)} /></label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button type="button" className="admin-save-btn" onClick={()=>act(`/api/admin/group-purchases/${detail.id}/confirm-payment`, { reason })}>{t("gpAdminConfirmPayment")}</button>
                <button type="button" className="admin-filter-btn" onClick={()=>act(`/api/admin/group-purchases/${detail.id}/status`, { status: "admin_confirmed", reason })}>{t("gpAdminConfirm")}</button>
                <button type="button" className="admin-filter-btn" onClick={()=>act(`/api/admin/group-purchases/${detail.id}/status`, { status: "completed", reason })}>{t("gpAdminComplete")}</button>
                <button type="button" className="admin-filter-btn" onClick={()=>act(`/api/admin/group-purchases/${detail.id}/status`, { status: "cancelled", reason })}>{t("gpAdminCancel")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}