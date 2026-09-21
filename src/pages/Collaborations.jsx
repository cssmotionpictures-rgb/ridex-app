import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, COLLAB_COMMISSION } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, X, Handshake, Search, Star, CheckCircle2, Clock } from "lucide-react";

const SERVICES = ["All", "Producer", "Singer", "Mixer", "Videographer", "Songwriter"];

export default function Collaborations() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [listings, setListings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [booking, setBooking] = React.useState(null);
  const [filter, setFilter] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [form, setForm] = React.useState({ provider_name: "", service_type: "Producer", description: "", price: "" });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.Collaboration.filter({ status: "open" }, "-created_date", 200)
        .then(setListings).catch(() => {})
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const filtered = listings
    .filter((c) => (filter === "All" ? true : c.service_type === filter))
    .filter((c) => !search || c.provider_name?.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()));

  const createListing = async () => {
    if (!form.provider_name || !form.price) {
      toast({ title: "Missing details", description: "Provider name and price are required.", variant: "destructive" });
      return;
    }
    const c = await base44.entities.Collaboration.create({
      provider_name: form.provider_name,
      provider_id: user?.id || "",
      service_type: form.service_type,
      description: form.description,
      price: Number(form.price),
      commission: COLLAB_COMMISSION,
      artist_name: "",
      status: "open",
    });
    setListings((prev) => [c, ...prev]);
    setOpen(false);
    setForm({ provider_name: "", service_type: "Producer", description: "", price: "" });
    toast({ title: "Service listed", description: `${form.provider_name} is now available for hire.` });
  };

  const startBooking = (c) => setBooking(c);

  const onBooked = async () => {
    const c = booking;
    try {
      await base44.functions.invoke("auto-submit-batch", {
        feature_type: "collaboration", reference_id: c.id, title: `Booking: ${c.provider_name} (${c.service_type})`,
        amount: c.price, owner_id: c.provider_id || "", owner_name: c.provider_name,
      });
    } catch {}
    setBooking(null);
    toast({ title: "Request sent", description: `Your booking request for ${c.provider_name} is pending their approval.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Collabs"
        title="Artist Collaboration Marketplace"
        subtitle="Find and hire producers, singers, mixers, videographers & songwriters. 15% service fee per booking."
        action={<Button className="rounded-full" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Offer a service</Button>}
      />

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search providers…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-5">
        {SERVICES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${filter === s ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20"><Handshake className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" /><p className="text-muted-foreground">No services listed yet.</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
              <div className="flex items-center gap-2"><Handshake className="w-4 h-4 text-primary" /><p className="font-semibold truncate">{c.provider_name}</p></div>
              <p className="text-xs text-primary mt-0.5">{c.service_type}</p>
              {c.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{c.description}</p>}
              <div className="flex items-center justify-between mt-3">
                <span className="font-bold">{money(c.price)}</span>
                {c.featured && <span className="inline-flex items-center gap-1 text-[10px] text-amber-300"><Star className="w-3 h-3" /> Featured</span>}
              </div>
              <Button className="w-full rounded-full mt-3" disabled={c.status !== "open"} onClick={() => startBooking(c)}>
                {c.status === "open" ? `Book · ${money(c.price)}` : "Booked"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-semibold">Offer a service</p><button onClick={() => setOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <div><Label className="text-xs">Your name / stage name</Label><Input className="rounded-xl mt-1" value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} /></div>
            <div><Label className="text-xs">Service type</Label>
              <select className="w-full mt-1 rounded-xl bg-secondary border border-border text-sm h-9 px-2" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                {SERVICES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Description</Label><Textarea className="rounded-xl mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What you offer, experience, turnaround…" /></div>
            <div><Label className="text-xs">Price (₦)</Label><Input type="number" className="rounded-xl mt-1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <Button className="w-full rounded-full" onClick={createListing}>List service</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!booking}
        onOpenChange={(v) => !v && setBooking(null)}
        amount={booking?.price}
        service="collaboration"
        description={booking ? `Book ${booking.provider_name} (${booking.service_type})` : ""}
        referenceId={booking ? `collab-${booking.id}` : ""}
        onPaid={onBooked}
        allowCash={false}
        commission={COLLAB_COMMISSION}
      />
    </div>
  );
}