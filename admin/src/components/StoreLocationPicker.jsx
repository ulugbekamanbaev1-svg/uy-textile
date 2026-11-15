import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";

const DEFAULT_CENTER = [41.5505, 60.633];
const DEFAULT_ZOOM = 12;
const PICKED_ZOOM = 15;

export default function StoreLocationPicker({ latitude, longitude, onChange, t }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const coords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

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
      onChange(lat, lng);
    });

    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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
      markerRef.current = L.marker(position, { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const point = markerRef.current.getLatLng();
        onChange(point.lat, point.lng);
      });
    } else {
      markerRef.current.setLatLng(position);
    }

    map.setView(position, Math.max(map.getZoom(), PICKED_ZOOM), { animate: true });
  }, [coords?.latitude, coords?.longitude]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return (
    <div className="store-location-picker">
      <div ref={containerRef} className="store-location-map" />
      <div className="store-location-actions">
        <button type="button" className="ghost-button" onClick={useMyLocation}>
          <Navigation size={15} />
          {t("useMyLocation") || "Моё местоположение"}
        </button>
        {coords ? (
          <span className="admin-note" style={{ margin: 0 }}>
            <MapPin size={14} /> {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </span>
        ) : (
          <span className="admin-note" style={{ margin: 0 }}>
            {t("tapToPickStoreLocation") || "Нажмите на карту, чтобы отметить магазин"}
          </span>
        )}
        {coords && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              onChange(null, null);
            }}
          >
            {t("clearLocation") || "Убрать метку"}
          </button>
        )}
      </div>
    </div>
  );
}
