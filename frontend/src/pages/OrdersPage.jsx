import { useEffect, useState } from "react";
import { PackageSearch, RefreshCw } from "lucide-react";

import OrderStatusTracker from "../components/OrderStatusTracker";
import { fetchMyOrders } from "../services/api";

export default function OrdersPage({ t, lang }) {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");

  const load = async () => {
    setState("loading");
    setError("");
    try {
      const data = await fetchMyOrders();
      setOrders(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message || t("trackOrdersError"));
      setOrders([]);
      setState("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <div className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("trackOrdersTitle")}</h2>
      </div>

      <section className="profile-section">
        <p className="option-hint">{t("myOrdersSecureHint")}</p>

        <div className="track-form">
          <button
            type="button"
            className="primary-button"
            onClick={load}
            disabled={state === "loading"}
          >
            {state === "loading" ? <PackageSearch size={16} /> : <RefreshCw size={16} />}
            {state === "loading" ? t("loading") : t("refreshOrders")}
          </button>
        </div>

        {state === "error" && <p className="form-error">{error}</p>}

        {state === "ready" && orders.length === 0 && (
          <p className="option-hint">{t("trackOrdersEmpty")}</p>
        )}

        {state === "ready" && orders.length > 0 && (
          <div className="tracked-orders">
            {orders.map((order) => (
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
