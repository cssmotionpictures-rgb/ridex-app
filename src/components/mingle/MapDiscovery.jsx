import React from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// PRIVACY MAP — aggregate activity areas only. Individual people are NEVER
// placed on this map: an area is drawn only when 2+ compatible people share
// it (see aggregateZones), and no circle is ever bound to a person or identity.
export default function MapDiscovery({ center, zones }) {
  const pos = center || [6.5244, 3.3792];
  return (
    <div className="rounded-3xl overflow-hidden border border-primary/25 h-64">
      <MapContainer center={pos} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker center={pos} radius={8} pathOptions={{ color: "#f7c948", fillColor: "#f7c948", fillOpacity: 0.9 }}>
          <Tooltip>You — your position is only ever visible to yourself</Tooltip>
        </CircleMarker>
        {(zones || []).map((z, i) => (
          <Circle
            key={i}
            center={[z.lat, z.lng]}
            radius={z.radiusKm * 1000}
            pathOptions={{ color: "#a855f7", fillColor: "#a855f7", fillOpacity: 0.18, weight: 1 }}
          >
            <Tooltip>💜 Compatible people are active around this area</Tooltip>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}