import React from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import DriverSosButton from "@/components/driver/DriverSosButton";
import IncidentReportForm from "@/components/driver/IncidentReportForm";
import BlacklistManager from "@/components/driver/BlacklistManager";
import SafetyTips from "@/components/driver/SafetyTips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Star, ShieldCheck, Ban, Loader2, Phone, Settings, AlertTriangle, Star as StarIcon } from "lucide-react";

export default function DriverSafety() {
  const nav = useNavigate();
  const [me, setMe] = React.useState(null);
  const [driver, setDriver] = React.useState(null);
  const [rides, setRides] = React.useState([]);
  const [ratings, setRatings] = React.useState([]);
  const [settings, setSettings] = React.useState({ auto_record_audio: true, panic_mode: true, share_live_location: true, sos_alert_type: "All" });
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [activeRide, setActiveRide] = React.useState(null);
  const [rateTarget, setRateTarget] = React.useState(null);
  const [rateValue, setRateValue] = React.useState(5);
  const [rateReview, setRateReview] = React.useState("");
  const [rateBusy, setRateBusy] = React.useState(false);

  const loadRatings = (d) =>
    base44.entities.PassengerRating.filter({ driver_id: d.id }, "-created_date", 50).then(setRatings).catch(() => {});

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => nav("/login?next=/driver-safety"));
  }, []);

  React.useEffect(() => {
    if (!me) return;
    base44.entities.Driver.filter({ created_by_id: me.id }).then(async (list) => {
      if (!list.length) { nav("/driver-signup"); return; }
      const d = list[0];
      setDriver(d);
      const [r, sets] = await Promise.all([
        base44.entities.Ride.filter({ driver_id: d.id }, "-created_date", 50).catch(() => []),
        base44.entities.DriverSafetySettings.filter({ driver_id: d.id }, "-created_date", 1).catch(() => []),
      ]);
      setRides(r);
      setSettings(sets[0] || { driver_id: d.id, auto_record_audio: true, panic_mode: true, share_live_location: true, sos_alert_type: "All" });
      loadRatings(d);
    }).catch(() => {});
  }, [me]);

  React.useEffect(() => {
    if (!driver) return;
    setActiveRide(rides.find((r) => ["arriving", "in_progress"].includes(r.status)) || null);
  }, [rides, driver]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      if (settings.id) {
        setSettings(await base44.entities.DriverSafetySettings.update(settings.id, settings));
      } else {
        setSettings(await base44.entities.DriverSafetySettings.create(settings));
      }
    } finally { setSavingSettings(false); }
  };

  const submitRating = async () => {
    if (!rateTarget) return;
    setRateBusy(true);
    try {
      await base44.entities.PassengerRating.create({
        driver_id: driver.id,
        driver_name: driver.full_name,
        passenger_id: "",
        passenger_name: rateTarget.customer_phone || "Passenger",
        ride_id: rateTarget.id,
        rating: rateValue,
        review: rateReview.trim(),
        flags: rateValue <= 2 ? ["Low rating"] : [],
      });
      setRateTarget(null);
      setRateValue(5);
      setRateReview("");
      loadRatings(driver);
    } catch (err) {
      alert(err.message || "Could not submit rating");
    } finally { setRateBusy(false); }
  };

  if (!me) return <p className="text-muted-foreground">Loading…</p>;
  if (!driver) return <p className="text-muted-foreground">Loading driver profile…</p>;

  const unrated = rides.filter((r) => r.status === "completed" && !ratings.some((rt) => rt.ride_id === r.id));

  return (
    <div>
      <PageHeader eyebrow="Driver safety" title="Safety & protection" subtitle="Your protection toolkit — SOS, incident reporting, blacklists, passenger screening, and safety tips." />

      {/* Always-visible SOS + active ride */}
      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-5 mb-6">
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-semibold">Emergency SOS</h3>
          </div>
          <p className="text-xs text-muted-foreground">One tap alerts admin, your emergency contacts, and shares live GPS. Panic mode re-shares your location every 5 seconds.</p>
          <DriverSosButton driver={driver} ride={activeRide} />
          <a href="tel:112" className="block"><Button variant="outline" className="rounded-full w-full"><Phone className="w-4 h-4 mr-2" /> Call 112</Button></a>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Active ride monitoring</h3>
          {activeRide ? (
            <>
              <p className="text-sm font-medium">{activeRide.pickup_address} → {activeRide.dest_address}</p>
              <div className="flex items-center gap-2"><StatusBadge status={activeRide.status} /><span className="text-xs text-muted-foreground">{activeRide.customer_phone || "No phone"}</span></div>
              {driver.lat && <p className="text-xs text-muted-foreground">Live location: <a className="text-primary underline" href={`https://maps.google.com/?q=${driver.lat},${driver.lng}`} target="_blank" rel="noreferrer">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</a></p>}
              <p className="text-xs text-muted-foreground">Your location is being shared live during this ride. Admin can monitor all active rides.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No active ride. When a trip starts, live monitoring and route-deviation alerts turn on automatically.</p>
          )}
        </div>
      </div>

      {/* Passenger screening */}
      <div className="rounded-3xl border border-border/60 bg-card p-5 mb-6 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Passenger screening</h3>
        <p className="text-xs text-muted-foreground">Rate every passenger after a ride. Low-rated passengers are flagged for admin review and may be banned. Unverified passengers cannot book rides.</p>
        {unrated.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-300">Rate these completed rides:</p>
            {unrated.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">{r.pickup_address} → {r.dest_address}</p>
                  <p className="text-xs text-muted-foreground">{r.customer_phone || "Passenger"}</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setRateTarget(r)}><StarIcon className="w-4 h-4 mr-1" /> Rate</Button>
              </div>
            ))}
          </div>
        )}
        {ratings.length > 0 && (
          <div className="pt-2">
            <p className="text-sm font-medium mb-2">Recent passenger ratings</p>
            <div className="space-y-2">
              {ratings.slice(0, 6).map((rt) => (
                <div key={rt.id} className="flex items-center gap-3 rounded-2xl bg-secondary/40 p-3">
                  <div className="flex">{[1,2,3,4,5].map((s) => <StarIcon key={s} className={`w-3.5 h-3.5 ${s <= rt.rating ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />)}</div>
                  <p className="text-sm flex-1 truncate">{rt.passenger_name}</p>
                  {rt.flags?.length > 0 && <span className="text-xs text-destructive">⚠ flagged</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Incident + Blacklist */}
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Ban className="w-4 h-4 text-primary" /> Incident reporting</h3>
          <p className="text-xs text-muted-foreground">File a report after a dangerous ride. Attach photos, audio, or video evidence. Anonymous option available. Safety team reviews within 24 hours.</p>
          <IncidentReportForm driver={driver} rides={rides} />
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Ban className="w-4 h-4 text-primary" /> Blacklist management</h3>
          <BlacklistManager driver={driver} rides={rides} />
        </div>
      </div>

      {/* Settings */}
      {settings && (
      <div className="rounded-3xl border border-border/60 bg-card p-5 mb-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Safety settings</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { key: "auto_record_audio", label: "Auto-record audio during SOS", desc: "Encrypted audio captured as evidence" },
            { key: "panic_mode", label: "Panic mode on SOS", desc: "Re-share live location every 5 seconds" },
            { key: "share_live_location", label: "Share live location on trips", desc: "Admin can monitor active rides" },
          ].map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-2xl bg-secondary/40 p-4">
              <div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
              <Switch checked={!!settings[s.key]} onCheckedChange={(v) => setSettings((p) => ({ ...p, [s.key]: v }))} />
            </div>
          ))}
          <div className="rounded-2xl bg-secondary/40 p-4">
            <Label className="text-xs">SOS alert recipients</Label>
            <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={settings.sos_alert_type} onChange={(e) => setSettings((p) => ({ ...p, sos_alert_type: e.target.value }))}>
              {["All", "Police+Admin", "Admin Only"].map((o) => <option key={o} value={o} className="bg-card">{o}</option>)}
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Emergency contact name</Label>
            <Input className="rounded-xl mt-1" value={settings.emergency_contact_name || ""} onChange={(e) => setSettings((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Emergency contact phone</Label>
            <Input className="rounded-xl mt-1" value={settings.emergency_contact_phone || ""} onChange={(e) => setSettings((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
          </div>
        </div>
        <Button className="rounded-full" onClick={saveSettings} disabled={savingSettings}>
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save settings
        </Button>
      </div>
      )}

      {/* Safety tips */}
      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <h3 className="font-semibold mb-3">Safety tips</h3>
        <SafetyTips />
      </div>

      {/* Rate passenger modal */}
      {rateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold">Rate this passenger</h3>
            <p className="text-sm text-muted-foreground">{rateTarget.pickup_address} → {rateTarget.dest_address}</p>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map((s) => (
                <button key={s} onClick={() => setRateValue(s)}>
                  <StarIcon className={`w-8 h-8 ${s <= rateValue ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />
                </button>
              ))}
            </div>
            <Input className="rounded-xl" placeholder="Optional review…" value={rateReview} onChange={(e) => setRateReview(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={() => setRateTarget(null)} disabled={rateBusy}>Cancel</Button>
              <Button className="rounded-full flex-1" onClick={submitRating} disabled={rateBusy}>{rateBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}