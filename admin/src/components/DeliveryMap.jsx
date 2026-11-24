import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";

import { formatPrice } from "../utils/format";

// Центр доставки — город Хорезм (Ургенч)
const DELIVERY_CENTER = [41.5505, 60.633];

const STATUS_KEYS = {
  new: "statusNew",
  confirmed: "statusConfirmed",
  delivering: "statusDelivering",
  done: "statusDone",
  cancelled: "statusCancelled"
};

const FILTER_STATUSES = ["new", "confirmed", "delivering", "done"];

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}

export default function DeliveryMap({ orders, t, lang }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const fittedSignatureRef = useRef("");
  const [statusFilter, setStatusFilter] = useState({
    new: true,
    confirmed: true,
    delivering: true,
    done: true,
  });

  const filteredOrders = useMemo(
    () => orders.filter((o) => statusFilter[o.status]),
    [orders, statusFilter]
  );

  const located = useMemo(
    () => filteredOrders.filter((order) => order.latitude !== null && order.longitude !== null),
    [filteredOrders]
  );
  const withoutCoords = useMemo(
    () => filteredOrders.filter((order) => order.latitude === null || order.longitude === null),
    [filteredOrders]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      center: DELIVERY_CENTER,
      zoom: 10,
      scrollWheelZoom: true,
      attributionControl: false
    });

    L.control.attribution({
      prefix:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    located.forEach((order) => {
      const icon = L.divIcon({
        className: "map-pin",
        html: `<span>${escapeHtml(order.number)}</span>`,
        iconSize: [58, 26],
        iconAnchor: [29, 26]
      });

      const marker = L.marker([order.latitude, order.longitude], { icon })
        .addTo(map)
        .bindPopup(buildPopup(order, t, lang));

      marker.on("click", () => marker.openPopup());
      markersRef.current.push(marker);
    });

    const signature = located.map((o) => `${o.id}:${o.latitude}:${o.longitude}`).sort().join("|");
    if (signature !== fittedSignatureRef.current) {
      fittedSignatureRef.current = signature;
      if (located.length === 1) {
        map.setView([located[0].latitude, located[0].longitude], 14, { animate: false });
      } else if (located.length > 1) {
        map.fitBounds(
          L.latLngBounds(located.map((order) => [order.latitude, order.longitude])),
          { padding: [40, 40] }
        );
      }
    }
  }, [located, lang, t]);

  const focusOrder = (order) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([order.latitude, order.longitude], 15, { duration: 0.6 });
    window.setTimeout(() => {
      L.popup()
        .setLatLng([order.latitude, order.longitude])
        .setContent(buildPopup(order, t, lang))
        .openOn(map);
    }, 650);
  };

  const toggleStatus = (status) => {
    setStatusFilter((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  return (
    <div className="map-layout">
      <section className="map-panel">
        <div className="map-filter-bar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {FILTER_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`admin-filter-btn${statusFilter[status] ? " active" : ""}`}
              onClick={() => toggleStatus(status)}
              style={{ opacity: statusFilter[status] ? 1 : 0.55 }}
            >
              {t(STATUS_KEYS[status])}
            </button>
          ))}
        </div>

        <div ref={containerRef} className="delivery-map" />

        <div className="map-legend">
          <MapPin size={15} />
          {t("mapOrdersCount", { count: located.length })}
        </div>
      </section>

      <aside className="map-side">
        <h3>{t("mapSideTitle")}</h3>
        <p className="admin-note">{t("mapHint")}</p>

        {located.length === 0 && (
          <div className="map-empty">
            <MapPin size={22} />
            <p>{t("mapEmpty")}</p>
          </div>
        )}

        <div className="map-order-list">
          {located.map((order) => (
            <button
              key={order.id}
              type="button"
              className="map-order"
              onClick={() => focusOrder(order)}
            >
              <span className="map-order-top">
                <strong>{order.number}</strong>
                <em className={`status-pill ${order.status}`}>
                  {t(STATUS_KEYS[order.status] || "orderStatus")}
                </em>
              </span>
              <span>{order.customer_name}</span>
              <span>{order.phone}</span>
              <span className="map-order-address">
                <Navigation size={12} />
                {order.address || "—"}
              </span>
              <strong className="map-order-total">
                {formatPrice(order.total, lang)}
              </strong>
            </button>
          ))}
        </div>

        {withoutCoords.length > 0 && (
          <>
            <h4 className="map-subtitle">{t("mapNoCoords")}</h4>
            <div className="map-order-list">
              {withoutCoords.map((order) => (
                <div key={order.id} className="map-order no-coords">
                  <span className="map-order-top">
                    <strong>{order.number}</strong>
                    <em className={`status-pill ${order.status}`}>
                      {t(STATUS_KEYS[order.status] || "orderStatus")}
                    </em>
                  </span>
                  <span>{order.customer_name}</span>
                  <span>{order.address || "—"}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function buildPopup(order, t, lang) {
  const status = t(STATUS_KEYS[order.status] || "orderStatus");
  const items = (order.items || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.quantity)} × ${escapeHtml(
          item[`name_${lang}`] || item.name_ru
        )}${item.variant_label ? ` · ${escapeHtml(item.variant_label)}` : ""}</li>`
    )
    .join("");

  return `
    <div class="map-popup">
      <strong class="map-popup-number">${escapeHtml(order.number)}</strong>
      <span class="map-popup-status">${escapeHtml(status)}</span>
      <p>${escapeHtml(order.customer_name)}</p>
      <p><a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a></p>
      ${order.address ? `<p>${escapeHtml(order.address)}</p>` : ""}
      ${items ? `<ul>${items}</ul>` : ""}
      <strong>${escapeHtml(formatPrice(order.total, lang))}</strong>
      <a class="map-popup-link" target="_blank" rel="noreferrer" href="https://maps.google.com/?q=${order.latitude},${order.longitude}">${escapeHtml(
        t("openMap")
      )}</a>
    </div>
  `;
}