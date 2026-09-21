import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, LICENSE_COMMISSIONS } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileText, Plus, X, CheckCircle2, Clock, XCircle, Music } from "lucide-react";

const TYPES = [
  { key: "sync", label: "Sync License", desc: "Use in film, TV, ads & video" },
  { key: "mechanical", label: "Mechanical License", desc: "Reproduce & distribute the song" },
  { key: "exclusive", label: "Exclusive License", desc: "Sole rights — no other licensees" },
];

export default function SongLicensing() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [licenses, setLicenses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [checkout, setCheckout] = React.useState(null);
  const [form, setForm] = React.useState({ artist_name: "", song_title: "", license_type: "sync", usage_scope: "", amount: "" });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.SongLicense.filter({}, "-created_date", 50)
        .then(setLicenses).catch(() => {})
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const startLicense = () => {
    if (!form.artist_name || !form.song_title || !form.amount) {
      toast({ title: "Missing details", description: "Artist, song title and license fee are required.", variant: "destructive" });
      return;
    }
    setCheckout(form);
  };

  const onPaid = async () => {
    const f = checkout;
    const lic = await base44.entities.SongLicense.create({
      artist_name: f.artist_name,
      song_title: f.song_title,
      licensee_name: user?.full_name || "",
      licensee_email: user?.email || "",
      license_type: f.license_type,
      amount: Number(f.amount),
      commission: LICENSE_COMMISSIONS[f.license_type],
      usage_scope: f.usage_scope,
      user_id: user?.id || "",
      status: "pending",
    });
    try {
      await base44.functions.invoke("auto-submit-batch", {
        feature_type: "song_license", reference_id: lic.id, title: `${f.song_title} — ${f.artist_name}`, amount: Number(f.amount),
      });
    } catch {}
    setLicenses((prev) => [lic, ...prev]);
    setCheckout(null);
    setOpen(false);
    setForm({ artist_name: "", song_title: "", license_type: "sync", usage_scope: "", amount: "" });
    toast({ title: "Submitted for approval", description: `${f.song_title} license request sent for approval.` });
  };

  const statusIcon = (st) => st === "active" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : st === "rejected" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-amber-400" />;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Licensing"
        title="Song Licensing Platform"
        subtitle="License your songs for commercial use — sync, mechanical & exclusive. Commission: 15% (sync/mechanical), 10% (exclusive)."
        action={<Button className="rounded-full" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Request a license</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {TYPES.map((t) => (
          <div key={t.key} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2"><Music className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">{t.label}</p></div>
            <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
            <p className="text-xs text-primary mt-2">Commission {LICENSE_COMMISSIONS[t.key] * 100}%</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : licenses.length === 0 ? (
        <div className="text-center py-20"><FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" /><p className="text-muted-foreground">No licenses issued yet.</p></div>
      ) : (
        <div className="space-y-2">
          {licenses.map((l) => (
            <div key={l.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{l.song_title} <span className="text-muted-foreground">— {l.artist_name}</span></p>
                <p className="text-xs text-muted-foreground">{TYPES.find((t) => t.key === l.license_type)?.label} · {money(l.amount)}</p>
              </div>
              <div className="flex items-center gap-2 text-xs shrink-0">{statusIcon(l.status)}<span className="capitalize">{l.status}</span></div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-semibold">Request a license</p><button onClick={() => setOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button></div>
            <div><Label className="text-xs">Artist name</Label><Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} /></div>
            <div><Label className="text-xs">Song title</Label><Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => setForm({ ...form, song_title: e.target.value })} /></div>
            <div><Label className="text-xs">License type</Label>
              <select className="w-full mt-1 rounded-xl bg-secondary border border-border text-sm h-9 px-2" value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })}>
                {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Usage scope</Label><Textarea className="rounded-xl mt-1" value={form.usage_scope} onChange={(e) => setForm({ ...form, usage_scope: e.target.value })} placeholder="e.g. Background music for a 30-sec TV ad, 6 months" /></div>
            <div><Label className="text-xs">License fee (₦)</Label><Input type="number" className="rounded-xl mt-1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <Button className="w-full rounded-full" onClick={startLicense}>Pay & Issue License</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={checkout?.amount}
        service="song_license"
        description={checkout ? `License: ${checkout.song_title} (${checkout.license_type})` : ""}
        referenceId="song-license"
        onPaid={onPaid}
        allowCash={false}
        commission={checkout ? LICENSE_COMMISSIONS[checkout.license_type] : 0.15}
      />
    </div>
  );
}