import { useEffect, useState } from "react";
import { fetchMyVip } from "../services/api";
import { formatPrice } from "../utils/format";
import "./VipCard.css";

const LABELS = {
  silver: "SILVER — KUMUSH",
  gold: "GOLD — OLTIN",
  platinum: "PLATINUM — PLATINA",
  diamond: "DIAMOND — OLMOS",
};

export default function VipCard({ t, lang }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMyVip().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) {
    return <section className="profile-section"><h3>{t("vipTitle")}</h3><p className="option-hint">{t("loading")}</p></section>;
  }

  const level = data.level || "silver";
  const nextLabel = data.next_level ? (LABELS[data.next_level] || data.next_level) : null;

  return (
    <section className="profile-section">
      <h3>{t("vipTitle")}</h3>

      <div className={`vip-card vip-${level}`} aria-label={LABELS[level]}>
        <div className="vip-card-glow" />
        <div className="vip-card-shimmer" />
        {level === "diamond" && (
          <div className="vip-particles" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => <span key={i} style={{"--i": i}} />)}
          </div>
        )}
        <div className="vip-card-top">
          <span className="vip-brand">FARRUX SHOP</span>
          <span className="vip-badge">VIP</span>
        </div>
        <div className="vip-level">{LABELS[level] || level.toUpperCase()}</div>
        <div className="vip-sub">{t("vipCurrent")}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <div className="profile-link-row" style={{flexDirection:"column", alignItems:"flex-start", gap:4}}>
          <span>{t("vipCompletedOrders")}</span><strong>{data.completed_orders}</strong>
        </div>
        <div className="profile-link-row" style={{flexDirection:"column", alignItems:"flex-start", gap:4}}>
          <span>{t("vipCompletedAmount")}</span><strong>{formatPrice(data.completed_amount, lang)}</strong>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
          <span>{t("vipProgress")}</span>
          <span>{data.next_level ? `${data.progress_percent}%` : t("vipMax")}</span>
        </div>
        <div style={{ height: 10, background: "rgba(0,0,0,.08)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${data.progress_percent}%`,
            height: "100%",
            borderRadius: 999,
            background: level === "diamond" ? "linear-gradient(90deg,#bfc7d5,#fff,#bfc7d5)" : "linear-gradient(90deg,#c7a24b,#f3d77c)",
            transition: "width .6s ease"
          }} />
        </div>
        {data.next_level ? (
          <p className="option-hint" style={{ marginTop: 8 }}>
            {t("vipNext")}: {nextLabel} · {data.criterion === "count"
              ? `${data.remaining} ta buyurtma`
              : formatPrice(data.remaining, lang)}
          </p>
        ) : (
          <p className="option-hint" style={{ marginTop: 8 }}>{t("vipMax")}</p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h4 style={{ marginBottom: 8 }}>{t("vipHistory")}</h4>
        {(data.history || []).length === 0 ? (
          <p className="option-hint">{t("vipNoHistory")}</p>
        ) : (
          <div className="contact-list">
            {data.history.map((h) => (
              <div className="profile-link-row" key={h.id}>
                <span>{new Date(h.created_at).toLocaleDateString()} · {(LABELS[h.old_level]||h.old_level)} → {(LABELS[h.new_level]||h.new_level)}</span>
                <strong>{h.metric_value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}