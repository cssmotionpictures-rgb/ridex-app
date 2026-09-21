import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import ServiceMap from "@/components/shared/ServiceMap";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageSearch, Loader2, Radio } from "lucide-react";

const STEPS = ["pending", "driver_assigned", "pickup", "in_transit", "arriving_soon", "delivered"];

// Receiver-facing live tracking. Anyone with the tracking number from their
// RIDE X email can follow the package on the map in real time — no internal
// record id needed. Updates stream in via the realtime subscription.
export default function TrackPackage() {
  const [number, setNumber] = React.useState(new URLSearchParams(window.location.search).get("number") || "");
  const [req, setReq] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [needLogin, setNeedLogin] = React.useState(false);

  const lookup = async (value) => {
    const num = String(value ?? number).trim().toUpperCase();
    if (!num) return;
    setBusy(true); setError(""); setNeedLogin(false); setReq(null);
    try {
      const rows = await base44.entities.LogisticsRequest.filter({ tracking_number: num });
      if (rows && rows.length) setReq(rows[0]);
      else setError(`No delivery found for ${num}. Check the tracking number in your RIDE X email and try again.`);
    } catch (e) {
      setNeedLogin(true);
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("number");
    if (initial) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates — every status / driver-position change lands instantly.
  React.useEffect(() => {
    if (!req?.id) return;
    const unsubscribe = base44.entities.LogisticsRequest.subscribe((event) => {
      if (event?.id !== req.id) return;
      if (event.type === "delete") { setReq(null); setError("This delivery was removed."); return; }
      setReq((cur) => ({ ...cur, ...(event.data || {}) }));
    });
    return unsubscribe;
  }, [req?.id]);

  const from = req ? [req.pickup_lat, req.pickup_lng] : null;
  const to = req ? [req.delivery_lat, req.delivery_lng] : null;
  const driver = req?.driver_lat ? [req.driver_lat, req.driver_lng] : from;
  const stepIndex = req ? STEPS.indexOf(req.status) : -1;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        eyebrow="RIDE X Logistics"
        title="Track your package"
        subtitle="Enter the tracking number from your RIDE X email to follow your delivery live on the map."
      />

      <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
        <div className="flex gap-2">
          <Input
            className="rounded-xl font-mono uppercase"
            placeholder="e.g. RX12345678"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <Button className="rounded-full shrink-0" disabled={busy || !number.trim()} onClick={() => lookup()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageSearch className="w-4 h-4 mr-1" />} Track
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {needLogin && (
          <p className="text-sm text-muted-foreground">
            Please <Link className="text-primary underline" to="/login">sign in</Link> to track a delivery.
          </p>
        )}
      </div>

      {req && (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tracking number</p>
                <p className="font-mono font-bold text-primary text-lg">{req.tracking_number}</p>
              </div>
              <StatusBadge status={req.status} />
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-primary" /> Live — this page updates automatically.
            </p>
            <p className="text-sm">{req.pickup_address} → {req.delivery_address}</p>
            <p className="text-xs text-muted-foreground">
              {req.driver_name ? `Courier: ${req.driver_name}` : "Assigning a courier…"}
              {req.status !== "delivered" && req.eta_minutes ? ` · ETA ~${req.eta_minutes} min` : ""}
            </p>
          </div>

          <ServiceMap
            height="420px"
            markers={[
              { position: from, kind: "pickup", label: "Pickup" },
              { position: to, kind: "destination", label: "Delivery" },
              { position: driver, kind: "driver", label: req.driver_name },
            ]}
            route={[from, to]}
          />

          <div className="rounded-3xl border border-border/60 bg-card p-6">
            <p className="font-semibold mb-4">Delivery progress</p>
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-secondary"}`} />
                  <span className={`text-sm capitalize ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}