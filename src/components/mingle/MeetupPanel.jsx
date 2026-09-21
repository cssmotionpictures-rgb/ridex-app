import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Check, X, Car, Loader2 } from "lucide-react";
import * as api from "@/lib/mingle/api";

const VENUE_TYPES = [
  ["cafe", "Café"], ["restaurant", "Restaurant"], ["mall", "Mall"],
  ["park", "Park"], ["event", "Event"], ["public_venue", "Public venue"],
];

// MEETUP PLANNER — only the agreed PUBLIC venue is shared between matched
// users. Neither person's home, live location or ride data is ever revealed.
export default function MeetupPanel({ user, match, partner }) {
  const { toast } = useToast();
  const [meetups, setMeetups] = React.useState([]);
  const [f, setF] = React.useState({ venue_name: "", venue_type: "cafe", area_label: "", note: "" });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const rows = await api.loadMeetups().catch(() => []);
    setMeetups((rows || []).filter((m) => m.match_id === match.id));
  }, [match.id]);

  React.useEffect(() => {
    load();
    const unsub = api.subscribeMeetups((ev) => { if (ev?.data?.match_id === match.id) load(); });
    return () => { try { unsub(); } catch {} };
  }, [load]);

  const propose = async () => {
    if (!f.venue_name.trim()) { toast({ title: "Name the public venue first." }); return; }
    setBusy(true);
    try {
      await api.proposeMeetup(user, match, f);
      setF({ venue_name: "", venue_type: "cafe", area_label: "", note: "" });
      toast({ title: "Meetup proposed", description: "It becomes confirmed only when they agree." });
      load();
    } catch { toast({ title: "Could not propose the meetup." }); }
    setBusy(false);
  };

  const respond = async (m, status) => {
    try {
      await api.respondMeetup(m.id, status);
      if (status === "CONFIRMED") toast({ title: "📍 Meetup confirmed!", description: "Agreed public venue — book your RideX when ready." });
      load();
    } catch { toast({ title: "Could not respond." }); }
  };

  return (
    <div className="rounded-2xl bg-secondary/50 p-3 space-y-3">
      {meetups.map((m) => (
        <div key={m.id} className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{m.venue_name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.status === "CONFIRMED" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{VENUE_TYPES.find(([k]) => k === m.venue_type)?.[1] || "Venue"}{m.area_label ? ` · ${m.area_label}` : ""} · by {m.proposer_id === user.id ? "you" : partner?.display_name || "your match"}</p>
          {m.note && <p className="text-xs">{m.note}</p>}
          {m.status === "PROPOSED" && m.proposer_id !== user.id && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="rounded-full flex-1 h-8" onClick={() => respond(m, "CONFIRMED")}><Check className="w-3.5 h-3.5 mr-1" /> Accept</Button>
              <Button size="sm" variant="outline" className="rounded-full flex-1 h-8" onClick={() => respond(m, "CANCELLED")}><X className="w-3.5 h-3.5 mr-1" /> Decline</Button>
            </div>
          )}
          {m.status === "CONFIRMED" && (
            <Button asChild size="sm" className="rounded-full w-full h-8 mt-1">
              <Link to="/ride"><Car className="w-3.5 h-3.5 mr-1" /> 🚕 GET A RIDEX to the venue</Link>
            </Button>
          )}
        </div>
      ))}

      <div className="space-y-2 border-t border-border/40 pt-3">
        <Label className="text-xs">Suggest a public venue</Label>
        <Input className="rounded-xl h-9" placeholder="Venue name (e.g. Terra Kulture)" value={f.venue_name} onChange={(e) => setF((p) => ({ ...p, venue_name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <select className="h-9 rounded-xl bg-background border border-input px-2 text-sm" value={f.venue_type} onChange={(e) => setF((p) => ({ ...p, venue_type: e.target.value }))}>
            {VENUE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Input className="rounded-xl h-9" placeholder="Area (e.g. VI)" value={f.area_label} onChange={(e) => setF((p) => ({ ...p, area_label: e.target.value }))} />
        </div>
        <Input className="rounded-xl h-9" placeholder="Note (optional)" value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} />
        <Button size="sm" className="rounded-full w-full" disabled={busy} onClick={propose}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Propose meetup"}
        </Button>
        <p className="text-[10px] text-muted-foreground">Public venues only — your home address and live location are never shared, even after confirming.</p>
      </div>
    </div>
  );
}