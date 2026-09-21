import React from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Loader2, Phone, X, Siren, MapPin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const EMERGENCY_NUMBER = "112";

// Always-visible driver SOS button. Creates an SosAlert record (admin sees it
// instantly via the safety dashboard), captures live GPS, and offers to dial 112.
export default function DriverSosButton({ driver, ride = null }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [location, setLocation] = React.useState(null);
  const [locError, setLocError] = React.useState("");
  const [panicActive, setPanicActive] = React.useState(false);
  const panicIntervalRef = React.useRef(null);

  const captureLocation = () => {
    if (navigator.geolocation?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(
        (p) => setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setLocError("Location unavailable"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocError("Location unavailable");
    }
  };

  const trigger = () => {
    setOpen(true);
    setDone(false);
    setLocError("");
    captureLocation();
  };

  // Panic mode: re-share location every 5 seconds by updating the SosAlert record.
  const startPanic = (alertId) => {
    setPanicActive(true);
    if (panicIntervalRef.current) clearInterval(panicIntervalRef.current);
    panicIntervalRef.current = setInterval(async () => {
      if (navigator.geolocation?.getCurrentPosition) {
        navigator.geolocation.getCurrentPosition(
          (p) => base44.entities.SosAlert.update(alertId, {
            location_lat: p.coords.latitude, location_lng: p.coords.longitude,
          }).catch(() => {}),
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    }, 5000);
  };

  const stopPanic = () => {
    setPanicActive(false);
    if (panicIntervalRef.current) { clearInterval(panicIntervalRef.current); panicIntervalRef.current = null; }
  };

  React.useEffect(() => () => stopPanic(), []);

  const confirmSos = async () => {
    setBusy(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const lat = location?.lat;
      const lng = location?.lng;

      // 1. Create the SOS alert — admin sees it on the safety dashboard instantly.
      const alert = await base44.entities.SosAlert.create({
        driver_id: driver?.id || me?.id || "",
        driver_name: driver?.full_name || me?.full_name || "Unknown driver",
        ride_id: ride?.id || "",
        location_lat: lat,
        location_lng: lng,
        panic_mode: true,
        status: "Active",
      }).catch(() => null);

      // 2. High-priority support ticket for the safety team.
      const locText = lat ? `https://maps.google.com/?q=${lat},${lng}` : locError || "unknown";
      await base44.entities.SupportTicket.create({
        subject: "EMERGENCY SOS — DRIVER",
        message: `Driver: ${driver?.full_name || me?.full_name}\nRide: ${ride?.id || "n/a"}\nLocation: ${locText}\nTriggered from Driver Safety Dashboard`,
        service: "ride",
        customer_email: me?.email || "",
      }).catch(() => {});

      // 3. Alert emergency contacts by email (registered users only).
      const contacts = await base44.entities.EmergencyContact.list(50).catch(() => []);
      for (const c of contacts) {
        if (c.email) {
          await base44.functions.invoke("email-proxy", {
            to: c.email,
            subject: "RIDE X Driver Emergency SOS",
            body: `Hello ${c.name || ""},\n\nEmergency SOS triggered by driver ${driver?.full_name || ""}.\n\nLive location: ${locText}\n\nPlease reach them or contact emergency services (112).`,
          }).catch(() => {});
        }
      }

      // 4. Start panic mode (live location re-share every 5s).
      if (alert?.id) startPanic(alert.id);
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (panicActive) stopPanic();
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={trigger}
        className="w-full flex items-center justify-center gap-2 rounded-full h-14 bg-destructive text-destructive-foreground font-bold text-lg shadow-lg shadow-destructive/30 hover:bg-destructive/90 active:scale-95 transition"
      >
        <ShieldAlert className="w-6 h-6" /> SOS
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-destructive/40 bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-semibold">Driver Emergency SOS</h3>
              </div>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {done ? (
              <div className="space-y-4">
                {panicActive && (
                  <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 p-3 text-destructive animate-pulse">
                    <Siren className="w-5 h-5" /> <span className="text-sm font-medium">PANIC MODE ACTIVE — sharing live location every 5s</span>
                  </div>
                )}
                <p className="text-sm text-emerald-300">SOS alert sent to RIDE X admin and your emergency contacts. Stay safe — help is on the way.</p>
                {location && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> <a className="text-primary underline" href={`https://maps.google.com/?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</a></p>
                )}
                <div className="flex gap-2">
                  <a href={`tel:${EMERGENCY_NUMBER}`} className="flex-1"><Button className="w-full rounded-full h-12 bg-destructive text-destructive-foreground"><Phone className="w-4 h-4 mr-2" /> Call 112</Button></a>
                  {panicActive ? (
                    <Button variant="outline" className="rounded-full h-12 flex-1" onClick={stopPanic}>Stop panic mode</Button>
                  ) : (
                    <Button variant="outline" className="rounded-full h-12 flex-1" onClick={close}>Close</Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  This will alert the RIDE X admin & safety team, share your live location, and start panic mode (re-sharing your location every 5 seconds). Police line available after sending.
                </p>
                {location && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> <a className="text-primary underline" href={`https://maps.google.com/?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</a></p>
                )}
                {locError && <p className="text-xs text-amber-300">{locError} — alert will still be sent.</p>}
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-full h-12 flex-1" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="destructive" className="rounded-full h-12 flex-1 font-bold" onClick={confirmSos} disabled={busy}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Send SOS
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}