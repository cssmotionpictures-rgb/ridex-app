import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const GENRES = ["Afrobeats", "Gospel", "Hip-Hop", "R&B", "Highlife", "Amapiano", "Pop", "Dancehall"];

export default function SubmitEventForm({ user }) {
  const { toast } = useToast();
  const [form, setForm] = React.useState({ title: "", artist_lineup: "", event_date: "", venue: "", city: "", description: "", genres: "", ticket_regular_price: 1500, source: "user" });
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title || !form.artist_lineup || !form.event_date) {
      toast({ title: "Please fill title, artists and date", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await base44.entities.EventSubmission.create({
        ...form,
        event_date: new Date(form.event_date).toISOString(),
        ticket_regular_price: Number(form.ticket_regular_price) || 1500,
        submitter_id: user.id,
        submitter_name: user.full_name || user.email,
        submitter_email: user.email,
        status: "pending",
      });
      setDone(true);
      toast({ title: "Event submitted — admin will review it" });
    } catch (e) {
      toast({ title: e.message || "Submission failed", variant: "destructive" });
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="rounded-3xl bg-card border border-border p-6 text-center space-y-3">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
        <h3 className="font-bold">Event submitted!</h3>
        <p className="text-sm text-muted-foreground">Our team will verify and publish your event. You'll see it in the listings once approved.</p>
        <Button variant="outline" className="rounded-full" onClick={() => { setDone(false); setForm({ title: "", artist_lineup: "", event_date: "", venue: "", city: "", description: "", genres: "", ticket_regular_price: 1500, source: "user" }); }}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
      <h3 className="font-bold">Submit an event</h3>
      <p className="text-sm text-muted-foreground">Know about a concert, festival or live stream? Submit it and earn promoter credit once approved.</p>
      <div className="grid gap-3">
        <div>
          <Label className="text-xs">Event title</Label>
          <Input className="rounded-xl mt-1" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. RIDE X Afrobeats Festival" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Artist lineup</Label>
            <Input className="rounded-xl mt-1" value={form.artist_lineup} onChange={(e) => set("artist_lineup", e.target.value)} placeholder="Burna Boy, Rema..." />
          </div>
          <div>
            <Label className="text-xs">Date & time</Label>
            <Input className="rounded-xl mt-1" type="datetime-local" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Venue</Label>
            <Input className="rounded-xl mt-1" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Eko Hotel Convention Centre" />
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Input className="rounded-xl mt-1" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Lagos" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Genres (comma-separated)</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {GENRES.map((g) => (
              <button key={g} onClick={() => set("genres", (form.genres ? form.genres + "," : "") + g)} className="text-[11px] px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                + {g}
              </button>
            ))}
          </div>
          <Input className="rounded-xl mt-2" value={form.genres} onChange={(e) => set("genres", e.target.value)} placeholder="Afrobeats, Pop" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea className="rounded-xl mt-1" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tell us about the event..." />
        </div>
      </div>
      <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Submit event</>}
      </Button>
    </div>
  );
}