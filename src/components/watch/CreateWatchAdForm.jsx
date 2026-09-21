import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, CheckCircle2 } from "lucide-react";

// Self-serve ad slot: anyone can submit a video ad to play in the Watch Ads
// hub. It lands as "pending" so the existing admin (Sponsor Ad Manager) can
// activate it — the two work together, nothing is removed.
export default function CreateWatchAdForm({ onCreated }) {
  const [form, setForm] = React.useState({ name: "", sponsor: "", video_url: "", target_url: "", budget: 10000 });
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const submit = async () => {
    if (!form.name || !form.video_url) return;
    setSaving(true);
    try {
      await base44.entities.SponsorAd.create({
        name: form.name,
        sponsor: form.sponsor || "Unknown",
        industry: "general",
        video_url: form.video_url,
        target_url: form.target_url || "",
        price_per_play: 50,
        budget: Number(form.budget) || 10000,
        remaining_budget: Number(form.budget) || 10000,
        placement: "any",
        auto_approved: false,
        plays: 0,
        revenue: 0,
        status: "pending",
      });
      setForm({ name: "", sponsor: "", video_url: "", target_url: "", budget: 10000 });
      setDone(true);
      setTimeout(() => setDone(false), 4000);
      onCreated?.();
    } catch (e) {
      alert("Could not submit ad: " + (e?.message || "error"));
    }
    setSaving(false);
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3 mt-4">
      <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Create your ad</h3>
      <p className="text-xs text-muted-foreground">Submit a video ad to play in the Watch Ads hub. It goes live once an admin activates it — then it appears right here in the reel.</p>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Ad name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Sponsor / brand" value={form.sponsor} onChange={(e) => setForm({ ...form, sponsor: e.target.value })} />
        <Input className="col-span-2" placeholder="Video URL (direct MP4)" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
        <Input className="col-span-2" placeholder="Click-through URL (optional)" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} />
        <Input type="number" placeholder="Budget (₦)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
      </div>
      <Button className="rounded-full" disabled={saving || !form.name || !form.video_url} onClick={submit}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {done ? "Submitted for review" : "Submit ad"}
      </Button>
    </div>
  );
}