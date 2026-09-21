import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CheckCircle2, XCircle, Trash2, Megaphone } from "lucide-react";

// Inline admin ad-manager shown on the Watch Ads hub. Admins can approve,
// reject or delete pending/active sponsor ads directly here — all entity CRUD,
// works during the integration-credit freeze (no backend functions).
export default function WatchAdsAdmin({ onChanged }) {
  const [ads, setAds] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setIsAdmin(me?.role === "admin");
      if (me?.role !== "admin") { setLoading(false); return; }
      const list = await base44.entities.SponsorAd.list("-created_date", 200);
      setAds(list || []);
    } catch {}
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const act = async (a, status) => {
    setBusy(a.id);
    try { await base44.entities.SponsorAd.update(a.id, { status }); await load(); onChanged?.(); }
    catch (e) { alert("Update failed: " + (e?.message || "error")); }
    finally { setBusy(null); }
  };
  const remove = async (a) => {
    if (!confirm(`Delete "${a.name}"?`)) return;
    setBusy(a.id);
    try { await base44.entities.SponsorAd.delete(a.id); await load(); onChanged?.(); }
    catch (e) { alert("Delete failed: " + (e?.message || "error")); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!isAdmin) return null;

  const pending = ads.filter((a) => a.status === "pending");
  const active = ads.filter((a) => a.status === "active");

  const Row = ({ a }) => (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{a.name} <span className="text-[9px] text-muted-foreground">· {a.sponsor || "Unknown"}</span></p>
        <p className="text-[10px] text-muted-foreground truncate">▶ {a.plays || 0} · ₦{(a.revenue || 0).toLocaleString()} · ₦{(a.remaining_budget ?? a.budget ?? 0).toLocaleString()} left</p>
      </div>
      {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <div className="flex gap-1">
          {a.status !== "active" && <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] rounded-full" onClick={() => act(a, "active")}><CheckCircle2 className="w-3 h-3" /> Approve</Button>}
          {a.status !== "rejected" && a.status !== "pending" && <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] rounded-full text-destructive" onClick={() => act(a, "rejected")}><XCircle className="w-3 h-3" /> Reject</Button>}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(a)}><Trash2 className="w-3 h-3" /></Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 mt-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Admin · Manage ads</h3>
      <p className="text-xs text-muted-foreground">Approve submissions here to make them play in the reel. All changes save instantly — no backend needed.</p>
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400 flex items-center gap-1"><Megaphone className="w-3 h-3" /> Pending ({pending.length})</p>
          {pending.map((a) => <Row key={a.id} a={a} />)}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">Live ({active.length})</p>
        {active.length === 0 ? <p className="text-xs text-muted-foreground">No live ads. Approve a pending ad to go live.</p> : active.map((a) => <Row key={a.id} a={a} />)}
      </div>
    </div>
  );
}