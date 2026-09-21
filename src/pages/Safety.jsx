import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import VerificationCard from "@/components/safety/VerificationCard";
import EmergencyContacts from "@/components/safety/EmergencyContacts";
import SosButton from "@/components/safety/SosButton";
import { Button } from "@/components/ui/button";
import { Phone, Ambulance, ShieldCheck, Check, X, Loader2 } from "lucide-react";

const EMERGENCY_NUMBER = "112";

export default function Safety() {
  const [user, setUser] = React.useState(null);
  const [prefs, setPrefs] = React.useState({ share_trip: true, ridecheck_alerts: true, anonymize_phone: true });
  const [savingPrefs, setSavingPrefs] = React.useState(false);

  // Admin verification review
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [pendingVerifs, setPendingVerifs] = React.useState([]);
  const [verifBusy, setVerifBusy] = React.useState(false);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setIsAdmin(u?.role === "admin");
      if (u?.safety_prefs) setPrefs(u.safety_prefs);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!isAdmin) return;
    base44.entities.Verification.filter({ status: "pending" }, "-created_date", 50).then(setPendingVerifs).catch(() => {});
  }, [isAdmin]);

  const togglePref = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      await base44.auth.updateMe({ safety_prefs: prefs });
    } finally {
      setSavingPrefs(false);
    }
  };

  const reviewVerif = async (id, status) => {
    setVerifBusy(true);
    try {
      await base44.entities.Verification.update(id, { status });
      setPendingVerifs((p) => p.filter((v) => v.id !== id));
    } finally {
      setVerifBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Safety" title="Safety center" subtitle="Tools to keep every ride and delivery safe — verification, SOS, emergency contacts and more." />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* SOS */}
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-semibold">Emergency SOS</h3>
          </div>
          <p className="text-sm text-muted-foreground">Trigger an instant alert to the RIDE X safety team and your emergency contacts with your live location.</p>
          <SosButton context={{ page: "Safety center" }} />
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={`tel:${EMERGENCY_NUMBER}`}><Button variant="outline" className="rounded-full"><Phone className="w-4 h-4 mr-2" /> Call {EMERGENCY_NUMBER}</Button></a>
            <a href="tel:767"><Button variant="outline" className="rounded-full"><Ambulance className="w-4 h-4 mr-2" /> Request ambulance (LASAMBUS 767)</Button></a>
          </div>
        </div>

        {/* Verification */}
        <VerificationCard />

        {/* Safety preferences */}
        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
          <h3 className="font-semibold">Safety preferences</h3>
          {[
            { key: "share_trip", label: "Share live trip status with my emergency contacts" },
            { key: "ridecheck_alerts", label: "Alert me on unusual route deviations or long stops" },
            { key: "anonymize_phone", label: "Mask my phone number from drivers during trips" },
          ].map((p) => (
            <button key={p.key} onClick={() => togglePref(p.key)} className="flex items-center gap-3 w-full text-left">
              <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${prefs[p.key] ? "bg-primary" : "bg-secondary"}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${prefs[p.key] ? "translate-x-4" : ""}`} />
              </span>
              <span className="text-sm">{p.label}</span>
            </button>
          ))}
          <Button className="rounded-full" onClick={savePrefs} disabled={savingPrefs}>
            {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save preferences
          </Button>
        </div>

        {/* Emergency contacts */}
        <div className="lg:col-span-2">
          <EmergencyContacts />
        </div>

        {/* Admin verification review */}
        {isAdmin && (
          <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card p-6 space-y-4">
            <h3 className="font-semibold">Identity verification review</h3>
            {pendingVerifs.length === 0 && <p className="text-sm text-muted-foreground">No pending verifications.</p>}
            {pendingVerifs.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 p-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-medium">{v.user_name || "User"} <span className="text-muted-foreground">· {v.user_email}</span></p>
                </div>
                <a href={v.id_document_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View ID</a>
                <a href={v.selfie_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View selfie</a>
                <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => reviewVerif(v.id, "approved")} disabled={verifBusy}><Check className="w-4 h-4 mr-1" /> Approve</Button>
                <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => reviewVerif(v.id, "rejected")} disabled={verifBusy}><X className="w-4 h-4 mr-1" /> Reject</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}