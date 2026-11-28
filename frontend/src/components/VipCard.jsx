import { useEffect, useState } from "react";
import { Crown, ShoppingBag, Wallet } from "lucide-react";

import { fetchMyVip } from "../services/api";
import { formatPrice } from "../utils/format";
import "./VipCard.css";

const LEVEL_LABELS = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  platinum: "PLATINUM",
  diamond: "DIAMOND",
};

export default function VipCard({ t, lang }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyVip()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) return null;

  if (!data) {
    return (
      <section className="lux-card lux-vip">
        <div className="lux-section-head">
          <span className="lux-icon"><Crown size={18} /></span>
          <div>
            <h3>{t("vipTitle")}</h3>
            <p>{t("vipSubtitle")}</p>
          </div>
        </div>
        <p className="lux-loading">{t("loading")}</p>
      </section>
    );
  }

  const level = data.level || "silver";
  const levelLabel = LEVEL_LABELS[level] || String(level).toUpperCase();
  const nextLabel = data.next_level ? (LEVEL_LABELS[data.next_level] || String(data.next_level).toUpperCase()) : null;
  const isMax = !data.next_level;
  const progress = isMax ? 100 : Math.max(0, Math.min(100, data.progress_percent || 0));

  const formatMetric = (value, criterion) =>
    criterion === "count" ? t("vipOrdersLeft", { count: value }) : formatPrice(value, lang);
  const metricText = formatMetric(data.metric, data.criterion);
  const remainingText = formatMetric(data.remaining, data.criterion);

  return (
    <section className="lux-card lux-vip">
      <div className="lux-section-head">
        <span className="lux-icon"><Crown size={18} /></span>
        <div>
          <h3>{t("vipTitle")}</h3>
          <p>{t("vipSubtitle")}</p>
        </div>
      </div>

      <div className={`vip-card vip-${level}`} aria-label={levelLabel}>
        <div className="vip-card-glow" aria-hidden="true" />
        <div className="vip-card-shimmer" aria-hidden="true" />
        {level === "diamond" && (
          <div className="vip-particles" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, index) => (
              <span key={index} style={{ "--i": index }} />
            ))}
          </div>
        )}
        <div className="vip-card-top">
          <span className="vip-brand">FARRUX SHOP</span>
          <span className="vip-badge">VIP</span>
        </div>
        <div className="vip-card-main">
          <div className="vip-level">{levelLabel}</div>
          <div className="vip-sub">{t("vipCurrent")}</div>
        </div>
        <div className="vip-card-foot">
          <span>{data.criterion === "count" ? t("vipCompletedOrders") : t("vipCompletedAmount")}</span>
          <strong>{metricText}</strong>
        </div>
      </div>

      <div className="vip-stats">
        <div className="vip-stat">
          <span className="vip-stat-icon"><ShoppingBag size={17} /></span>
          <div className="vip-stat-body">
            <span>{t("vipCompletedOrders")}</span>
            <strong>{data.completed_orders}</strong>
          </div>
        </div>
        <span className="vip-stat-divider" aria-hidden="true" />
        <div className="vip-stat">
          <span className="vip-stat-icon"><Wallet size={17} /></span>
          <div className="vip-stat-body">
            <span>{t("vipCompletedAmount")}</span>
            <strong>{formatPrice(data.completed_amount, lang)}</strong>
          </div>
        </div>
      </div>

      <div className="vip-progress">
        <div className="vip-progress-head">
          <span>{t("vipProgress")}</span>
          <span>{isMax ? "100%" : `${progress}%`}</span>
        </div>
        <div className="vip-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className={`vip-progress-fill vip-fill-${level}`} style={{ width: `${progress}%` }} />
        </div>
        {isMax ? (
          <p className="vip-progress-hint vip-max-note">{t("vipMax")}</p>
        ) : (
          <p className="vip-progress-hint">
            {t("vipNext")}: <strong>{nextLabel}</strong> ? {remainingText}
          </p>
        )}
      </div>
    </section>
  );
}
