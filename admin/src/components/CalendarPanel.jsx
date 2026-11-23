import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../services/adminApi";
import { formatPrice, localized } from "../utils/format";

const STATUS_KEYS = {
  new: "statusNew",
  confirmed: "statusConfirmed",
  delivering: "statusDelivering",
  done: "statusDone",
  cancelled: "statusCancelled",
};

function monthRange(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end };
}
function iso(d) { return d.toISOString().slice(0,10); }

export default function CalendarPanel({ t, lang, onOpenOrders }) {
  const today = new Date();
  const init = monthRange(today);
  const [view, setView] = useState("month");
  const [dateFrom, setDateFrom] = useState(iso(init.start));
  const [dateTo, setDateTo] = useState(iso(init.end));
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (opts = {}) => {
    const df = opts.dateFrom ?? dateFrom;
    const dt = opts.dateTo ?? dateTo;
    const vw = opts.view ?? view;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ date_from: df, date_to: dt, view: vw });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await adminFetch(`/api/admin/calendar/orders?${params.toString()}`);
      setData(res);
    } catch (e) { setError(e.message || "Xatolik"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const setViewAndRange = (v) => {
    const base = selectedDay ? new Date(selectedDay + "T00:00:00") : new Date();
    let s, e;
    if (v === "day") { s = new Date(base); e = new Date(base); }
    else if (v === "week") {
      const day = base.getDay();
      const diff = (day + 6) % 7; // Monday start
      s = new Date(base); s.setDate(base.getDate() - diff);
      e = new Date(s); e.setDate(s.getDate() + 6);
    } else { // month/list default month
      const m = monthRange(base); s = m.start; e = m.end;
    }
    const df = iso(s), dt = iso(e);
    setView(v); setDateFrom(df); setDateTo(dt); setSelectedDay("");
    setTimeout(() => load({ dateFrom: df, dateTo: dt, view: v }), 0);
  };

  const orders = data?.orders || [];
  const byDay = useMemo(() => {
    const map = {};
    for (const o of orders) {
      const day = (o.created_at || "").slice(0,10);
      if (!day) continue;
      (map[day] ||= []).push(o);
    }
    return map;
  }, [orders]);

  const days = useMemo(() => {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T00:00:00");
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(iso(new Date(d)));
    }
    return out;
  }, [dateFrom, dateTo]);

  const visibleOrders = selectedDay ? (byDay[selectedDay] || []) : orders;

  return (
    <div>
      {error && <div className="admin-error"><p>{error}</p></div>}

      <section className="stats" style={{ marginBottom: 16 }}>
        <div className="stat-card"><p>{t("calToday")}</p><h2>{data?.stats?.today ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("calNew")}</p><h2>{data?.stats?.new ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("calSewing")}</p><h2>{data?.stats?.confirmed ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("calDelivering")}</p><h2>{data?.stats?.delivering ?? "—"}</h2></div>
        <div className="stat-card"><p>{t("calDone")}</p><h2>{data?.stats?.done ?? "—"}</h2></div>
      </section>

      <section className="products-card" style={{ marginBottom: 16 }}>
        <div className="products-card-head"><h3>{t("calendarTitle")}</h3></div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["month","week","day","list"].map((v) => (
              <button key={v} type="button" className={`small-button${view===v?" active":""}`} onClick={() => setViewAndRange(v)}>
                {t(`cal${v[0].toUpperCase()+v.slice(1)}`)}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
            <label className="admin-field"><span>{t("calDateFrom")}</span><input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} /></label>
            <label className="admin-field"><span>{t("calDateTo")}</span><input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} /></label>
            <label className="admin-field"><span>{t("calStatus")}</span>
              <select value={status} onChange={(e)=>setStatus(e.target.value)}>
                <option value="">{t("calAll")}</option>
                {Object.entries(STATUS_KEYS).map(([k,v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </label>
            <label className="admin-field"><span>{t("calSearch")}</span><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="#123 / Ism" /></label>
          </div>
          <div><button type="button" className="primary-admin-button" onClick={load} disabled={loading}>{loading ? t("loading") : t("qrApplyFilter")}</button></div>
        </div>
      </section>

      {view !== "list" && (
        <section className="products-card" style={{ marginBottom: 16 }}>
          <div className="products-card-head"><h3>{t("calOrders")}</h3></div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
            {days.map((day) => {
              const count = (byDay[day] || []).length;
              return (
                <button key={day} type="button" className={`small-button${selectedDay===day?" active":""}`} style={{textAlign:"left", padding:10}} onClick={() => setSelectedDay(selectedDay===day?"":day)}>
                  <div style={{fontWeight:600}}>{day.slice(8,10)}</div>
                  <div style={{opacity:.75, fontSize:12}}>{day}</div>
                  <div style={{marginTop:4}}>{count} ta</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="products-card">
        <div className="products-card-head">
          <h3>{selectedDay ? `${t("calOrders")} — ${selectedDay}` : t("calOrders")}</h3>
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th>№</th><th>Mijoz</th><th>{t("calCreated")}</th><th>{t("calStatus")}</th><th>{t("orderTotalLabel")}</th><th>{t("orderProducts")}</th></tr></thead>
          <tbody>
            {visibleOrders.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.number}</strong></td>
                <td>{o.customer_name}<div style={{opacity:.7}}>{o.phone}</div></td>
                <td>{o.created_at ? new Date(o.created_at).toLocaleString() : ""}</td>
                <td>{t(STATUS_KEYS[o.status] || o.status)}</td>
                <td>{formatPrice(o.total, lang)}</td>
                <td style={{minWidth:220}}>
                  {(o.items||[]).slice(0,3).map((it, idx) => (
                    <div key={idx}>{localized(it, "name", lang)} × {it.quantity}</div>
                  ))}
                  {(o.items||[]).length > 3 ? <div>…</div> : null}
                  {o.planned_delivery_at ? <div style={{opacity:.7}}>{t("calPlannedDelivery")}: {new Date(o.planned_delivery_at).toLocaleDateString()}</div> : null}
                  {o.sewing_at ? <div style={{opacity:.7}}>{t("calSewingDate")}: {new Date(o.sewing_at).toLocaleDateString()}</div> : null}
                </td>
              </tr>
            ))}
            {visibleOrders.length === 0 && <tr><td colSpan="6" className="admin-note">{t("calNoOrders")}</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}