import { useEffect, useRef } from "react";
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

  const located = orders.filter(
    (order) => order.latitude !== null && order.longitude !== null
  );
  const withoutCoords = orders.filter(
    (order) => order.latitude === null || order.longitude === null
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      center: DELIVERY_CENTER,
      zoom: 10,
      scrollWheelZoom: true,
      // без стандартного контрола — свой префикс без флага
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

    if (!map) {
      return;
    }

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

    if (located.length === 1) {
      map.setView(
        [located[0].latitude, located[0].longitude],
        14,
        { animate: false }
      );
    } else if (located.length > 1) {
      map.fitBounds(
        L.latLngBounds(
          located.map((order) => [order.latitude, order.longitude])
        ),
        { padding: [40, 40] }
      );
    }
  }, [orders, lang]);

  const focusOrder = (order) => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.flyTo([order.latitude, order.longitude], 15, { duration: 0.6 });
    window.setTimeout(() => map.openPopup(
      L.popup()
        .setLatLng([order.latitude, order.longitude])
        .setContent(buildPopup(order, t, lang))
    ), 650);
  };

  return (
    <div className="map-layout">
      <section className="map-panel">
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
