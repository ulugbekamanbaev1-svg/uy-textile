import { useState } from "react";
import { PackageSearch } from "lucide-react";

import OrderStatusTracker from "../components/OrderStatusTracker";
import { trackOrders } from "../services/api";

export default function OrdersPage({ t, lang }) {
  const [trackPhone, setTrackPhone] = useState("");
  const [trackNick, setTrackNick] = useState("");
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [trackState, setTrackState] = useState("idle");

  const handleTrack = async () => {
    const phone = trackPhone.trim();
    const nick = trackNick.trim();

    if (phone.replace(/\D/g, "").length < 7 && !nick.replace(/^@/, "").length) {
      setTrackState("error");
      return;
    }

    setTrackState("loading");

    try {
      const orders = await trackOrders({
        phone: phone || undefined,
        username: nick ? nick.replace(/^@/, "") : undefined
      });

      setTrackedOrders(Array.isArray(orders) ? orders : []);
      setTrackState("done");
    } catch {
      setTrackState("error");
      setTrackedOrders([]);
    }
  };

  return (
    <main>
      <div className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("trackOrdersTitle")}</h2>
      </div>

      <section className="profile-section">
        <p className="option-hint">{t("trackOrdersHint")}</p>

        <div className="track-form">
          <input
            type="tel"
            value={trackPhone}
            placeholder={t("trackOrdersPlaceholder")}
            onChange={(event) => setTrackPhone(event.target.value)}
          />

          <input
            type="text"
            value={trackNick}
            placeholder={t("trackOrdersNickPlaceholder")}
            onChange={(event) => setTrackNick(event.target.value)}
          />

          <button
            type="button"
            className="primary-button"
            onClick={handleTrack}
            disabled={trackState === "loading"}
          >
            <PackageSearch size={16} />
            {trackState === "loading" ? t("loading") : t("trackOrdersButton")}
          </button>
        </div>

        {trackState === "error" && (
          <p className="form-error">{t("trackOrdersError")}</p>
        )}

        {trackState === "done" && trackedOrders.length === 0 && (
          <p className="option-hint">{t("trackOrdersEmpty")}</p>
        )}

        {trackState === "done" && trackedOrders.length > 0 && (
          <div className="tracked-orders">
            {trackedOrders.map((order) => (
              <div className="tracked-order" key={order.id}>
                <OrderStatusTracker status={order.status} order={order} t={t} lang={lang} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
