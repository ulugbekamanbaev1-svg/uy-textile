import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";

import { openExternalLink } from "../utils/telegram";

// Центр доставки — Хорезм (Ургенч)
const DEFAULT_CENTER = [41.5505, 60.633];
const DEFAULT_ZOOM = 12;
const PICKED_ZOOM = 15;

export default function LocationPicker({
  coords,
  onChange,
  onUseMyLocation,
  locating,
  t
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      center: coords ? [coords.latitude, coords.longitude] : DEFAULT_CENTER,
      zoom: coords ? PICKED_ZOOM : DEFAULT_ZOOM,
      scrollWheelZoom: true,
      attributionControl: false
    });

    L.control
      .attribution({
        prefix:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      })
      .addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);

    map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      onChange({ latitude: lat, longitude: lng });
    });

    mapRef.current = map;

    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // onChange стабилен по смыслу, но не добавляем в deps чтобы не пересоздавать карту
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (!coords) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const position = [coords.latitude, coords.longitude];

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "location-pin-icon",
        html: '<span class="location-pin-dot"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      markerRef.current = L.marker(position, {
        icon,
        draggable: true
      }).addTo(map);

      markerRef.current.on("dragend", () => {
        const point = markerRef.current.getLatLng();
        onChange({ latitude: point.lat, longitude: point.lng });
      });
    } else {
      markerRef.current.setLatLng(position);
    }

    map.setView(position, Math.max(map.getZoom(), PICKED_ZOOM), {
      animate: true
    });
  }, [coords, onChange]);

  return (
    <div className="location-picker">
      <div ref={containerRef} className="location-map" />

      <div className="location-actions">
        <button
          type="button"
          className="location-button"
          onClick={onUseMyLocation}
          disabled={locating}
        >
          <Navigation size={16} />
          {locating ? t("locating") : t("sendLocation")}
        </button>

        {coords ? (
          <div className="location-chip">
            <MapPin size={15} />
            <span>{t("locationAttached")}</span>
            <a
              href={`https://maps.google.com/?q=${coords.latitude},${coords.longitude}`}
              onClick={(e) => {
                e.preventDefault();
                openExternalLink(
                  `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
                );
              }}
            >
              {t("openMap")}
            </a>
          </div>
        ) : (
          <p className="location-hint">{t("tapToPickLocation")}</p>
        )}
      </div>
    </div>
  );
}
