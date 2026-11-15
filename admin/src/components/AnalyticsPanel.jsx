import {
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet
} from "lucide-react";

import { formatPrice, localized } from "../utils/format";

const STATUS_KEYS = {
  new: "statusNew",
  confirmed: "statusConfirmed",
  delivering: "statusDelivering",
  done: "statusDone",
  cancelled: "statusCancelled"
};

const PERIODS = [7, 30, 90];

export default function AnalyticsPanel({
  analytics,
  days,
  onDaysChange,
  t,
  lang
}) {
  if (!analytics) {
    return <p className="admin-note">{t("loading")}</p>;
  }

  const maxRevenue = Math.max(
    ...analytics.daily.map((point) => point.revenue),
    1
  );
  const labelStep = Math.ceil(analytics.daily.length / 10);

  const kpis = [
    ["analyticsRevenue", formatPrice(analytics.revenue, lang), Wallet],
    ["analyticsOrders", analytics.orders, ShoppingBag],
    ["analyticsAverage", formatPrice(analytics.average_order, lang), TrendingUp],
    ["analyticsClients", analytics.clients, Users]
  ];

  return (
    <>
      <div className="analytics-toolbar">
        <div className="order-filters">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              className={days === period ? "active" : ""}
              onClick={() => onDaysChange(period)}
            >
              {t(`period${period}`)}
            </button>
          ))}
        </div>
        <p className="admin-note">{t("analyticsHint")}</p>
      </div>

      <section className="stats analytics-stats">
        {kpis.map(([key, value, Icon]) => (
          <div className="stat-card" key={key}>
            <Icon size={22} />
            <p>{t(key)}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </section>

      <div className="analytics-grid">
        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsDailyTitle")}</h3>
            <span className="table-count">
              {t("analyticsOrders")}: {analytics.orders}
            </span>
          </div>

          {analytics.orders === 0 ? (
            <p className="admin-note">{t("analyticsNoSales")}</p>
          ) : (
            <div className="sales-chart">
              {analytics.daily.map((point, index) => (
                <div
                  className="chart-column"
                  key={point.day}
                  title={`${point.day}: ${formatPrice(point.revenue, lang)}`}
                >
                  <div className="chart-bar-wrap">
                    <div
                      className={`chart-bar${
                        point.orders ? " has-sales" : ""
                      }`}
                      style={{
                        height: `${Math.max(
                          point.revenue ? 4 : 1,
                          Math.round((point.revenue / maxRevenue) * 100)
                        )}%`
                      }}
                    />
                  </div>
                  <span>
                    {index % labelStep === 0 || index === analytics.daily.length - 1
                      ? point.day.slice(8)
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsTopTitle")}</h3>
          </div>

          {analytics.top_products.length === 0 ? (
            <p className="admin-note">{t("analyticsNoSales")}</p>
          ) : (
            <div className="top-products">
              {analytics.top_products.map((product, index) => (
                <div className="top-product" key={`${product.name_ru}-${index}`}>
                  <span className="top-rank">{index + 1}</span>
                  <div className="top-product-info">
                    <strong>{localized(product, "name", lang)}</strong>
                    <span>
                      {t("analyticsQuantity")}: {product.quantity}
                    </span>
                  </div>
                  <strong className="top-product-revenue">
                    {formatPrice(product.revenue, lang)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsStatusTitle")}</h3>
          </div>

          <div className="status-summary">
            {analytics.statuses.map((status) => (
              <div className="status-summary-row" key={status.status}>
                <span className={`status-dot ${status.status}`} />
                <span>{t(STATUS_KEYS[status.status] || "orderStatus")}</span>
                <strong>{status.count}</strong>
              </div>
            ))}
          </div>

          <p className="admin-note">
            {t("statusDone")}: {analytics.delivered} · {t("statusCancelled")}:{" "}
            {analytics.cancelled}
          </p>
        </section>
      </div>
    </>
  );
}
