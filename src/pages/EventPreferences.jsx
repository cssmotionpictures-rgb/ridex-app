import React from "react";
import { base44 } from "@/api/base44Client";
import { Save, Loader2, Bell, Mail, Smartphone, Heart } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const GENRES = ["Afrobeats", "Gospel", "Hip-Hop", "R&B", "Highlife", "Amapiano", "Pop", "Dancehall"];
const TYPES = [
  { key: "concert", label: "Concerts" },
  { key: "festival", label: "Festivals" },
  { key: "live_stream", label: "Live Streams" },
  { key: "meet_greet", label: "Meet & Greets" },
  { key: "album_launch", label: "Album Launches" },
];

export default function EventPreferences() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [pref, setPref] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      let u;
      try { u = await base44.auth.me(); setUser(u); } catch { return; }
      try {
        const existing = await base44.entities.UserEventPreference.filter({ user_id: u.id });
        if (existing.length) {
          setPref(existing[0]);
        } else {
          setPref({ user_id: u.id, preferred_genres: "", preferred_artists: "", city: "", event_types: "concert,festival,live_stream", notify_in_app: true, notify_email: true, notify_sms: false });
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  const set = (k, v) => setPref((p) => ({ ...p, [k]: v }));
  const toggleGenre = (g) => {
    const list = (pref.preferred_genres || "").split(",").map((x) => x.trim()).filter(Boolean);
    const has = list.includes(g);
    set("preferred_genres", (has ? list.filter((x) => x !== g) : [...list, g]).join(","));
  };
  const toggleType = (t) => {
    const list = (pref.event_types || "").split(",").map((x) => x.trim()).filter(Boolean);
    const has = list.includes(t);
    set("event_types", (has ? list.filter((x) => x !== t) : [...list, t]).join(","));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (pref.id) {
        await base44.entities.UserEventPreference.update(pref.id, pref);
      } else {
        const created = await base44.entities.UserEventPreference.create(pref);
        setPref(created);
      }
      toast({ title: "Preferences saved" });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!user) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!pref) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const genreList = (pref.preferred_genres || "").split(",").map((x) => x.trim()).filter(Boolean);
  const typeList = (pref.event_types || "").split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHeader eyebrow="RIDE X LIVE" title="Event Preferences" subtitle="Tell us what you love and we'll push the right events and tickets to you." />

      <div className="space-y-6">
        <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Genres you love</h3>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${genreList.includes(g) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
          <h3 className="font-semibold">Artists you follow</h3>
          <Input
            className="rounded-xl"
            placeholder="Burna Boy, Rema, Asake..."
            value={pref.preferred_artists || ""}
            onChange={(e) => set("preferred_artists", e.target.value)}
          />
        </div>

        <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
          <h3 className="font-semibold">Your city</h3>
          <Input className="rounded-xl" placeholder="Lagos" value={pref.city || ""} onChange={(e) => set("city", e.target.value)} />
        </div>

        <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
          <h3 className="font-semibold">Event types</h3>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => toggleType(t.key)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${typeList.includes(t.key) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Notifications</h3>
          {[
            { k: "notify_in_app", label: "In-app notifications", icon: Bell, desc: "Banners inside RIDE X" },
            { k: "notify_email", label: "Email notifications", icon: Mail, desc: "Event and ticket alerts by email" },
            { k: "notify_sms", label: "SMS notifications", icon: Smartphone, desc: "Text reminders before events" },
          ].map((n) => (
            <div key={n.k} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                  <n.icon className="w-4 h-4" />
                </div>
                <div>
                  <Label className="cursor-pointer">{n.label}</Label>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
              </div>
              <Switch checked={!!pref[n.k]} onCheckedChange={(v) => set(n.k, v)} />
            </div>
          ))}
        </div>

        <Button className="w-full rounded-full h-12 font-semibold" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save preferences</>}
        </Button>
      </div>
    </div>
  );
}