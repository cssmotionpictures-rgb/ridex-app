import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, Music2, CheckCircle2, Clock, Radio, ExternalLink } from "lucide-react";

const FEE = 5000;
const PLATFORMS = ["Spotify", "Apple Music", "Amazon Music", "Deezer", "YouTube Music", "Audiomack", "Boomplay"];

const STATUS_META = {
  pending: { icon: Clock, label: "Awaiting distribution", color: "text-amber-400" },
  distributing: { icon: Loader2, label: "Distributing", color: "text-primary" },
  live: { icon: Radio, label: "Live on all platforms", color: "text-emerald-400" },
  rejected: { icon: Music2, label: "Rejected", color: "text-destructive" },
};

export default function MusicDistribution() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [releases, setReleases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [checkout, setCheckout] = React.useState(null);
  const [form, setForm] = React.useState({ artist_name: "", song_title: "", audio_url: "", cover_url: "", platforms: ["Spotify", "Apple Music", "YouTube Music"] });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.MusicDistribution.filter({ user_id: u.id }, "-created_date", 50)
        .then(setReleases).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const togglePlatform = (p) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };

  const startPay = () => {
    if (!form.artist_name || !form.song_title || !form.audio_url) {
      toast({ title: "Missing details", description: "Artist, song title and audio file are required.", variant: "destructive" });
      return;
    }
    if (form.platforms.length === 0) {
      toast({ title: "Pick platforms", description: "Select at least one platform.", variant: "destructive" });
      return;
    }
    setCheckout(true);
  };

  const onUpload = async (e, field) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, [field]: file_url }));
      toast({ title: "Uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const onPaid = async (tx) => {
    const r = await base44.entities.MusicDistribution.create({
      artist_name: form.artist_name,
      song_title: form.song_title,
      audio_url: form.audio_url,
      cover_url: form.cover_url,
      platforms: form.platforms.join(", "),
      user_id: user?.id || "",
      user_email: user?.email || "",
      fee_paid: FEE,
      payment_reference: tx?.reference_id || tx?.id || "",
      release_status: "pending",
    });
    setReleases((prev) => [r, ...prev]);
    setCheckout(null);
    setForm({ artist_name: "", song_title: "", audio_url: "", cover_url: "", platforms: ["Spotify", "Apple Music", "YouTube Music"] });
    toast({ title: "Release submitted!", description: "Your song will be distributed within 3-5 days." });
  };

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Distribution"
        title="Music Distribution"
        subtitle="Get your music on Spotify, Apple Music, Amazon, Deezer, YouTube & more. ₦5,000 per release · 20% platform commission."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
          <p className="font-semibold">New release</p>
          <div>
            <Label className="text-xs">Artist name</Label>
            <Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Song title</Label>
            <Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => setForm({ ...form, song_title: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Audio file</Label>
            <div className="flex items-center gap-2 mt-1">
              <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-secondary cursor-pointer hover:text-foreground">
                <Upload className="w-3.5 h-3.5" /> Upload
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => onUpload(e, "audio_url")} />
              </label>
              {form.audio_url && <span className="text-xs text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Uploaded</span>}
            </div>
          </div>
          <div>
            <Label className="text-xs">Cover art (optional)</Label>
            <div className="flex items-center gap-2 mt-1">
              <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-secondary cursor-pointer hover:text-foreground">
                <Upload className="w-3.5 h-3.5" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e, "cover_url")} />
              </label>
              {form.cover_url && <span className="text-xs text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Cover</span>}
            </div>
          </div>
          <div>
            <Label className="text-xs">Platforms</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-full text-xs ${form.platforms.includes(p) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full rounded-full" onClick={startPay}>Distribute · {money(FEE)}</Button>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">My releases</p>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No releases yet. Submit your first song on the left.</p>
          ) : (
            <div className="space-y-3">
              {releases.map((r) => {
                const sm = STATUS_META[r.release_status] || STATUS_META.pending;
                const SIcon = sm.icon;
                return (
                  <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                      {r.cover_url ? <Image src={r.cover_url} className="w-full h-full" fittingType="fill" /> : <Music2 className="w-6 h-6 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{r.song_title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.artist_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.platforms}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold shrink-0 ${sm.color}`}>
                      <SIcon className="w-4 h-4" /> <span className="hidden sm:inline">{sm.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CheckoutDialog
        open={!!checkout}
        onOpenChange={(v) => !v && setCheckout(null)}
        amount={FEE}
        service="subscription"
        description="Music distribution — single release"
        referenceId="music-distribution"
        onPaid={onPaid}
        allowCash={false}
      />
    </div>
  );
}