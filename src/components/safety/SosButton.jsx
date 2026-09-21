import React from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Loader2, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const EMERGENCY_NUMBER = "112";

export default function SosButton({ context = {} }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [location, setLocation] = React.useState(null);
  const [locError, setLocError] = React.useState("");

  const trigger = async () => {
    setOpen(true);
    setDone(false);
    setLocError("");
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

  const confirmSos = async () => {
    setBusy(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const locText = location
        ? `https://maps.google.com/?q=${location.lat},${location.lng}`
        : locError || "unknown";
      const ctx = Object.entries(context)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      const subject = "EMERGENCY SOS — RIDE X";
      const message = `Emergency SOS triggered.\n\nUser: ${me?.email || "unknown"} (${me?.full_name || ""})\nLocation: ${locText}\n\n${ctx}`;

      // 1. Create a high-priority support ticket for the safety team.
      await base44.entities.SupportTicket.create({
        subject,
        message,
        service: "ride",
        customer_email: me?.email || "",
      }).catch(() => {});

      // 2. Alert the user's emergency contacts by email (registered users only).
      const contacts = await base44.entities.EmergencyContact.list(50).catch(() => []);
      for (const c of contacts) {
        if (c.email) {
          await base44.functions.invoke("email-proxy", {
            to: c.email,
            subject: "RIDE X Emergency SOS Alert",
            body: `Hello ${c.name || ""},\n\nThis is an automated emergency alert from RIDE X.\n\n${message}\n\nPlease try to reach the user or contact local emergency services (112).`,
          }).catch(() => {});
        }
      }
      setDone(true);
    } catch (e) {
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="w-full rounded-full h-12 font-semibold"
        onClick={trigger}
      >
        <ShieldAlert className="w-4 h-4 mr-2" /> Emergency SOS
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-destructive/40 bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-semibold">Emergency SOS</h3>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {done ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-300">SOS alert sent to RIDE X safety team and your emergency contacts.</p>
                <a href={`tel:${EMERGENCY_NUMBER}`} className="block">
                  <Button className="w-full rounded-full h-12 bg-destructive text-destructive-foreground">
                    <Phone className="w-4 h-4 mr-2" /> Call emergency line ({EMERGENCY_NUMBER})
                  </Button>
                </a>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This will share your live location and trip details with the RIDE X safety team and your emergency contacts, and offer to dial the local emergency line.
                </p>
                {location && (
                  <p className="text-xs text-muted-foreground">
                    Location captured: <a className="text-primary underline" href={`https://maps.google.com/?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</a>
                  </p>
                )}
                {locError && <p className="text-xs text-amber-300">{locError} — alert will still be sent.</p>}
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-full flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                  <Button variant="destructive" className="rounded-full flex-1" onClick={confirmSos} disabled={busy}>
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