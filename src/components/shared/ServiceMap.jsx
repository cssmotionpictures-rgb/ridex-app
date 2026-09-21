import React from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = (color, glyph) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${color};box-shadow:0 0 0 6px ${color}33,0 6px 14px rgba(0,0,0,.5);font-size:16px">${glyph}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const ICONS = {
  pickup: pin("#10b981", "📍"),
  destination: pin("#f43f5e", "🏁"),
  driver: pin("#3b82f6", "🚗"),
  venue: pin("#f7c948", "🍽️"),
};

function Fit({ points }) {
  const map = useMap();
  React.useEffect(() => {
    const valid = points.filter(Boolean);
    if (valid.length === 1) map.setView(valid[0], 14);
    else if (valid.length > 1) map.fitBounds(valid, { padding: [50, 50] });
  }, [JSON.stringify(points)]);
  return null;
}

export default function ServiceMap({ markers = [], route = [], height = "420px", onPick, className = "" }) {
  const validPos = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const points = markers.map((m) => m.position).filter(validPos);
  const center = points[0] || [6.5244, 3.3792];
  const validRoute = route.filter(validPos);

  return (
    <div className={`rounded-3xl overflow-hidden border border-border/60 ${className}`} style={{ height }}>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <Fit points={points} />
        <ClickHandler onPick={onPick} />
        {validRoute.length > 1 && <Polyline positions={validRoute} pathOptions={{ color: "#f7c948", weight: 5, opacity: 0.85 }} />}
        {markers.filter((m) => validPos(m.position)).map((m, i) => (
          <Marker key={i} position={m.position} icon={ICONS[m.kind] || ICONS.pickup}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function ClickHandler({ onPick }) {
  const map = useMap();
  React.useEffect(() => {
    if (!onPick) return;
    const handler = (e) => onPick([e.latlng.lat, e.latlng.lng]);
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [map, onPick]);
  return null;
}