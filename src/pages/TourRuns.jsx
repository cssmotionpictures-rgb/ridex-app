import React from "react";
import { base44 } from "@/api/base44Client";
import { money } from "@/lib/pricing";
import { talentPriceFor } from "@/lib/talentPricing";
import { AGENCY, grossUp } from "@/lib/agency";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import InvoiceDialog from "@/components/talent/InvoiceDialog";
import { Loader2, MapPin, Plus, Trash2, Route, FileText } from "lucide-react";

export default function TourRuns() {
  const { toast } = useToast();
  const [artists, setArtists] = React.useState([]);
  const [tours, setTours] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", artistId: "", promoter_company: "" });
  const [legs, setLegs] = React.useState([{ date: "", city: "", venue: "", capacity: "" }]);
  const [invoiceFor, setInvoiceFor] = React.useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        base44.entities.TalentArtist.filter({ status: "active" }, "-tier", 200).catch(() => []),
        base44.entities.TourRun.list("-created_date", 50).catch(() => []),
      ]);
      setArtists(a); setTours(t);
    } finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);

  const artist = artists.find((x) => x.id === form.artistId);
  const perLeg = artist ? talentPriceFor(artist) : 0;
  const total = perLeg * legs.filter((l) => l.date).length;

  const setLeg = (i, k, v) => setLegs((p) => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const addLeg = () => setLegs((p) => [...p, { date: "", city: "", venue: "", capacity: "" }]);
  const dropLeg = (i) => setLegs((p) => p.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!form.title.trim() || !form.artistId) { toast({ title: "Add a title and select an artist", variant: "destructive" }); return; }
    const cleanLegs = legs.filter((l) => l.date && l.city);
    if (!cleanLegs.length) { toast({ title: "Add at least one tour leg", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await base44.entities.TourRun.create({
        title: form.title,
        artist_id: form.artistId,
        artist_name: artist.stage_name,
        promoter_company: form.promoter_company,
        legs: JSON.stringify(cleanLegs),
        leg_count: cleanLegs.length,
        per_leg_gross: perLeg,
        total_gross: total,
        deposit_50: Math.round(total / 2),
        status: "draft",
      });
      toast({ title: "Tour run created", description: `${cleanLegs.length} legs · ${money(total)} gross` });
      setForm({ title: "", artistId: "", promoter_company: "" });
      setLegs([{ date: "", city: "", venue: "", capacity: "" }]);
      load();
    } finally { setSaving(false); }
  };

  const generateBookings = async (tour) => {
    const parsed = JSON.parse(tour.legs || "[]");
    const bookings = parsed.map((l) => ({
      artist_id: tour.artist_id,
      artist_name: tour.artist_name,
      talent_type: "musician",
      event_type: "concert",
      event_date: l.date,
      project_details: `${tour.title} — ${l.city}, ${l.venue} (cap ${l.capacity || "—"})`,
      promoter_company: tour.promoter_company,
      rider_committed: true,
      price: tour.per_leg_gross,
      platform_commission: grossUp(tour.per_leg_gross).agency,
      artist_earnings: grossUp(tour.per_leg_gross).net,
      status: "pending",
      escrow_status: "held",
    }));
    await base44.entities.TalentBooking.bulkCreate(bookings);
    await base44.entities.TourRun.update(tour.id, { status: "active" });
    toast({ title: "Escrow bookings generated", description: `${bookings.length} legs → My Bookings` });
    load();
  };

  return (
    <div>
      <PageHeader eyebrow="Tour Routing" title="Multi-City Tour Runs" subtitle="Route an artist across several cities — each leg becomes an escrow-protected booking." />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div>
            <Label className="text-xs">Tour title</Label>
            <Input className="rounded-xl mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Davido — Lagos x Abuja x PH Run" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Artist</Label>
              <Select value={form.artistId} onValueChange={(v) => setForm({ ...form, artistId: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select artist" /></SelectTrigger>
                <SelectContent>{artists.map((a) => <SelectItem key={a.id} value={a.id}>{a.stage_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Promoter company</Label>
              <Input className="rounded-xl mt-1" value={form.promoter_company} onChange={(e) => setForm({ ...form, promoter_company: e.target.value })} />
            </div>
          </div>
          {artist && <p className="text-xs text-muted-foreground">Per-leg promoter gross: <span className="text-foreground font-medium">{money(perLeg)}</span></p>}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Tour legs</p>
            {legs.map((l, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-2.5 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4"><Input type="date" className="rounded-lg text-xs" value={l.date} onChange={(e) => setLeg(i, "date", e.target.value)} /></div>
                <div className="col-span-3"><Input className="rounded-lg text-xs" placeholder="City" value={l.city} onChange={(e) => setLeg(i, "city", e.target.value)} /></div>
                <div className="col-span-3"><Input className="rounded-lg text-xs" placeholder="Venue" value={l.venue} onChange={(e) => setLeg(i, "venue", e.target.value)} /></div>
                <div className="col-span-1"><Input className="rounded-lg text-xs" placeholder="Cap" value={l.capacity} onChange={(e) => setLeg(i, "capacity", e.target.value)} /></div>
                <div className="col-span-1 flex justify-center">{legs.length > 1 && <button onClick={() => dropLeg(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>}</div>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="rounded-full" onClick={addLeg}><Plus className="w-4 h-4" /> Add leg</Button>
          </div>
          <div className="rounded-xl bg-secondary p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Run total (gross)</span>
            <span className="font-bold">{money(total)}</span>
          </div>
          <Button className="w-full rounded-full" disabled={saving} onClick={save}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create tour run"}</Button>
        </div>

        <div className="space-y-3">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : tours.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-muted-foreground text-sm"><Route className="w-8 h-8 mx-auto mb-2 opacity-50" /> No tour runs yet.</div>
          ) : tours.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-xs text-primary">{t.artist_name} · {t.leg_count} legs · {t.status}</p>
                </div>
                <span className="text-sm font-bold">{money(t.total_gross)}</span>
              </div>
              <div className="mt-2 space-y-1">
                {JSON.parse(t.legs || "[]").map((l, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /> {l.date} · {l.city} · {l.venue}</p>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-muted-foreground">50% deposit: {money(t.deposit_50)} · {AGENCY.phone}</span>
                {t.status === "draft" && <Button size="sm" className="rounded-full" onClick={() => generateBookings(t)}>Generate escrow bookings</Button>}
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setInvoiceFor({ id: t.id, artist_name: t.artist_name, price: t.total_gross, project_details: t.title, event_date: (JSON.parse(t.legs || "[]")[0] || {}).date || "", promoter_company: t.promoter_company })}><FileText className="w-3.5 h-3.5" /> Invoice</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <InvoiceDialog booking={invoiceFor} onClose={() => setInvoiceFor(null)} />
    </div>
  );
}