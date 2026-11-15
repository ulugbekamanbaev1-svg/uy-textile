import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [41.5505, 60.633];

export default function StoreMap({ latitude, longitude }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const hasCoords =
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude);

    const center = hasCoords ? [latitude, longitude] : DEFAULT_CENTER;
    const zoom = hasCoords ? 15 : 12;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: false,
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

    if (hasCoords) {
      const icon = L.divIcon({
        className: "location-pin-icon",
        html: '<span class="location-pin-dot"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker(center, { icon }).addTo(map);
    }

    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  return <div ref={containerRef} className="store-location-map-view" />;
}
