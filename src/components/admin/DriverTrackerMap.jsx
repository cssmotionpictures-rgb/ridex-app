import React from "react";
import { base44 } from "@/api/base44Client";
import ServiceMap from "@/components/shared/ServiceMap";

export default function DriverTrackerMap({ drivers = [] }) {
  const [live, setLive] = React.useState(drivers);

  React.useEffect(() => { setLive(drivers); }, [drivers]);

  // Live position updates as drivers move (their app pushes GPS while online).
  React.useEffect(() => {
    const u = base44.entities.Driver.subscribe((ev) => {
      if (ev.type !== "create" && ev.type !== "update") return;
      const r = ev.data;
      setLive((prev) => {
        const exists = prev.find((x) => x.id === r.id);
        return exists ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev];
      });
    });
    return () => u && u();
  }, []);

  const withPos = live.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  const onlineCount = live.filter((d) => d.is_online).length;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Live driver locations</h3>
        <p className="text-xs text-muted-foreground">{onlineCount} online · {withPos.length} with location</p>
      </div>
      {withPos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No drivers have shared their location yet. Drivers appear here once they go online.</p>
      ) : (
        <ServiceMap
          height="460px"
          markers={withPos.map((d) => ({
            position: [d.lat, d.lng],
            kind: "driver",
            label: `${d.full_name} · ${d.vehicle_type || ""} ${d.license_plate ? "· " + d.license_plate : ""} · ${d.is_online ? "Online" : "Offline"} · ${d.rating || 5}★`,
          }))}
        />
      )}
    </div>
  );
}