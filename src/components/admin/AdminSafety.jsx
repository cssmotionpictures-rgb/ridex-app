import React from "react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Ban, Star, Loader2, Check, X, Phone, MapPin } from "lucide-react";

// Admin safety management: live SOS alerts, incident reports, blacklist review, low-rated passengers.
export default function AdminSafety() {
  const [tab, setTab] = React.useState("sos");
  const [alerts, setAlerts] = React.useState([]);
  const [incidents, setIncidents] = React.useState([]);
  const [blacklist, setBlacklist] = React.useState([]);
  const [lowRated, setLowRated] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState({});

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    const [a, i, b, lr] = await Promise.all([
      base44.entities.SosAlert.list("-created_date", 50).catch(() => []),
      base44.entities.IncidentReport.list("-created_date", 50).catch(() => []),
      base44.entities.Blacklist.list("-created_date", 50).catch(() => []),
      base44.entities.PassengerRating.list("-created_date", 100).catch(() => []),
    ]);
    setAlerts(a);
    setIncidents(i);
    setBlacklist(b);
    setLowRated(lr.filter((r) => r.rating <= 2));
    setLoading(false);
  }, []);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  // Live SOS subscription — admin sees new alerts instantly.
  React.useEffect(() => {
    const u = base44.entities.SosAlert.subscribe((ev) => {
      if (ev.type === "create") setAlerts((p) => [ev.data, ...p]);
      if (ev.type === "update") setAlerts((p) => p.map((x) => (x.id === ev.data.id ? ev.data : x)));
    });
    return () => u && u();
  }, []);

  const respondAlert = async (id, status) => {
    setBusy(true);
    try {
      await base44.entities.SosAlert.update(id, { status, admin_response: note[id] || "" });
      setNote((p) => { const n = { ...p }; delete n[id]; return n; });
      loadAll();
    } finally { setBusy(false); }
  };

  const resolveIncident = async (id, status) => {
    setBusy(true);
    try {
      await base44.entities.IncidentReport.update(id, { status, admin_note: note[id] || "" });
      setNote((p) => { const n = { ...p }; delete n[id]; return n; });
      loadAll();
    } finally { setBusy(false); }
  };

  const reviewBlacklist = async (id, status) => {
    setBusy(true);
    try {
      await base44.entities.Blacklist.update(id, { status });
      loadAll();
    } finally { setBusy(false); }
  };

  const activeAlerts = alerts.filter((a) => a.status === "Active");

  const TABS = [
    { key: "sos", label: "SOS alerts", icon: ShieldAlert, count: activeAlerts.length },
    { key: "incidents", label: "Incident reports", icon: Ban, count: incidents.filter((i) => i.status === "Pending").length },
    { key: "blacklist", label: "Blacklist", icon: Ban, count: blacklist.filter((b) => b.status === "Pending").length },
    { key: "rated", label: "Low-rated", icon: Star, count: lowRated.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap border flex items-center gap-1.5 ${tab === t.key ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            {t.count > 0 && <span className={`ml-1 px-1.5 rounded-full text-[10px] ${tab === t.key ? "bg-primary-foreground/20" : "bg-destructive text-white"}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          {tab === "sos" && (
            <div className="space-y-3">
              {alerts.length === 0 && <p className="text-sm text-muted-foreground">No SOS alerts.</p>}
              {activeAlerts.length > 0 && <p className="text-sm font-semibold text-destructive">{activeAlerts.length} active alert(s) need response</p>}
              {alerts.map((a) => (
                <div key={a.id} className={`rounded-2xl border p-4 space-y-2 ${a.status === "Active" ? "border-destructive/50 bg-destructive/5 animate-pulse" : "border-border/60 bg-card"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{a.driver_name || "Driver"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.created_date).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.location_lat && (
                    <a className="text-xs text-primary underline inline-flex items-center gap-1" href={`https://maps.google.com/?q=${a.location_lat},${a.location_lng}`} target="_blank" rel="noreferrer">
                      <MapPin className="w-3 h-3" /> {a.location_lat.toFixed(4)}, {a.location_lng.toFixed(4)}
                    </a>
                  )}
                  {a.panic_mode && <span className="text-xs text-destructive font-medium">⚠ Panic mode active</span>}
                  <Textarea rows={2} placeholder="Admin response note…" value={note[a.id] || ""} onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))} />
                  <div className="flex gap-2">
                    <a href="tel:112"><Button size="sm" variant="outline" className="rounded-full"><Phone className="w-4 h-4 mr-1" /> Police</Button></a>
                    <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => respondAlert(a.id, "Acknowledged")} disabled={busy}>Acknowledge</Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => respondAlert(a.id, "Resolved")} disabled={busy}>Resolve</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "incidents" && (
            <div className="space-y-3">
              {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incident reports.</p>}
              {incidents.map((i) => (
                <div key={i.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{i.anonymous ? "Anonymous driver" : i.driver_name} · {i.category}</p>
                      <p className="text-xs text-muted-foreground">{new Date(i.created_date).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={i.status} />
                  </div>
                  <p className="text-sm">{i.description}</p>
                  {(i.evidence_photos || i.evidence_audio || i.evidence_video) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {i.evidence_photos && <a className="text-primary underline" href={i.evidence_photos.split(",")[0]} target="_blank" rel="noreferrer">Photo</a>}
                      {i.evidence_audio && <a className="text-primary underline" href={i.evidence_audio.split(",")[0]} target="_blank" rel="noreferrer">Audio</a>}
                      {i.evidence_video && <a className="text-primary underline" href={i.evidence_video.split(",")[0]} target="_blank" rel="noreferrer">Video</a>}
                    </div>
                  )}
                  <Textarea rows={2} placeholder="Investigation note…" value={note[i.id] || ""} onChange={(e) => setNote((p) => ({ ...p, [i.id]: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-full" onClick={() => resolveIncident(i.id, "Investigating")} disabled={busy}>Investigate</Button>
                    <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => resolveIncident(i.id, "Resolved")} disabled={busy}>Resolve</Button>
                    <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => resolveIncident(i.id, "Dismissed")} disabled={busy}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "blacklist" && (
            <div className="space-y-3">
              {blacklist.length === 0 && <p className="text-sm text-muted-foreground">No blacklist entries.</p>}
              {blacklist.map((b) => (
                <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{b.passenger_name || "Passenger"}</p>
                      <p className="text-xs text-muted-foreground">By {b.driver_name} · {b.severity}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm">{b.reason}</p>
                  {b.status === "Pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => reviewBlacklist(b.id, "Approved")} disabled={busy}><Check className="w-4 h-4 mr-1" /> Approve</Button>
                      <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => reviewBlacklist(b.id, "Rejected")} disabled={busy}><X className="w-4 h-4 mr-1" /> Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "rated" && (
            <div className="space-y-3">
              {lowRated.length === 0 && <p className="text-sm text-muted-foreground">No low-rated passengers.</p>}
              {lowRated.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.passenger_name || "Passenger"}</p>
                      <p className="text-xs text-muted-foreground">Rated by {r.driver_name} · {new Date(r.created_date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-destructive fill-destructive" />
                      <span className="text-sm font-bold">{r.rating}</span>
                    </div>
                  </div>
                  {r.review && <p className="text-sm mt-1">{r.review}</p>}
                  {r.flags?.length > 0 && <p className="text-xs text-destructive mt-1">⚠ {r.flags.join(", ")}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}