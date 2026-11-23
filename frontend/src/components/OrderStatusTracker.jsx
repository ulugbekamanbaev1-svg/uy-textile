import {
  CheckCircle2,
  ClipboardList,
  Home,
  PackageSearch,
  Truck,
  XCircle
} from "lucide-react";

import { assetUrl } from "../services/api";
import { formatPrice, localized } from "../utils/format";

const STEPS = [
  { key: "new", index: 0, icon: ClipboardList },
  { key: "confirmed", index: 1, icon: CheckCircle2 },
  { key: "delivering", index: 2, icon: Truck },
  { key: "done", index: 3, icon: Home }
];

const STEP_INDEX = {
  new: 0,
  confirmed: 1,
  delivering: 2,
  done: 3
};

const statusKey = (status) =>
  `status${status ? status.charAt(0).toUpperCase() + status.slice(1) : ""}`;

function stepState(status, index) {
  if (status === "cancelled") return "cancelled";

  const current = STEP_INDEX[status] ?? 0;

  if (index < current) return "done";
  if (index === current) return "active";
  return "todo";
}

export default function OrderStatusTracker({ status, order, t, lang }) {
  const cancelled = status === "cancelled";
  const currentIndex = STEP_INDEX[status] ?? 0;

  const currentStep = STEPS[currentIndex];

  const completedSteps = cancelled ? 0 : status === "done" ? STEPS.length : currentIndex;

  return (
    <div className="order-tracker">
      <div className="order-tracker-card">
        <div className="order-tracker-head">
          <div className="order-tracker-title">
            <span className="order-tracker-icon">
              <PackageSearch size={20} />
            </span>
            <div>
              <span className="order-tracker-label">{t("orderStatus")}</span>
              <strong className="order-tracker-number">{order?.number}</strong>
            </div>
          </div>

          <span className={`status-pill ${status}`}>
            {t(statusKey(status))}
          </span>
        </div>

        {cancelled ? (
          <div className="order-tracker-cancelled">
            <XCircle size={26} color="#b3564a" />
            <div>
              <strong>{t("statusCancelled")}</strong>
              <p className="option-hint">{t("orderCancelledHint")}</p>
            </div>
          </div>
        ) : (
          <div className="order-tracker-steps">
            {STEPS.map((step) => {
              const state = stepState(status, step.index);

              return (
                <div
                  className={`order-step ${state}`}
                  key={step.key}
                >
                  <div className="order-step-marker">
                    <span className="order-step-icon">
                      {state === "done" ? (
                        <CheckCircle2 size={18} />
                      ) : state === "active" ? (
                        <step.icon size={18} />
                      ) : (
                        <step.icon size={18} />
                      )}
                    </span>

                    {step.index < STEPS.length - 1 && (
                      <span className="order-step-line" />
                    )}
                  </div>

                  <div className="order-step-content">
                    <span className="order-step-label">
                      {t(statusKey(step.key))}
                    </span>
                    <span className="order-step-state">
                      {state === "done"
                        ? t("orderStepDone")
                        : state === "active"
                          ? t("orderStepActive")
                          : t("orderStepWaiting")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {order?.items?.length > 0 && (
          <div className="order-items">
            <span className="order-items-title">
              {t("orderItemsTitle")}
            </span>
            <div className="order-items-list">
              {order.items.map((item, index) => {
                const itemName = localized(item, "name", lang) || item.name_ru || item.product_slug || "";

                return (
                  <div className="order-item" key={item.id || `${item.product_slug}-${index}`}>
                    {item.image_url ? (
                      <img
                        className="order-item-photo"
                        src={assetUrl(item.image_url)}
                        alt={itemName}
                      />
                    ) : (
                      <div className="order-item-photo order-item-photo-empty">
                        {item.pricing_type === "meter"
                          ? t("meterUnit")
                          : item.pricing_type === "area"
                            ? t("meterUnit")
                            : t("pieceUnit")}
                      </div>
                    )}

                    <div className="order-item-info">
                      <span className="order-item-name">{itemName}</span>
                      <span className="order-item-meta">
                        {item.pricing_type === "meter"
                          ? `${item.meters ?? 0} ${t("meterUnit")} × ${item.quantity}`
                          : `${t("itemsCount", { count: item.quantity })} · ${formatPrice(item.line_total || item.unit_price * item.quantity, lang)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="order-tracker-success">
            <CheckCircle2 size={18} color="#2f6b45" />
            <span>{t("orderDeliveredSuccess")}</span>
          </div>
        )}

        <div className="tracked-order-meta">
          <span>
            {new Date(order?.created_at).toLocaleDateString(lang === "ru" ? "ru-RU" : lang)}
          </span>
          <strong>{formatPrice(order?.total || 0, lang)}</strong>
        </div>
      </div>
    </div>
  );
}
