import React from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Zap, ShieldCheck, Send } from "lucide-react";

const TOGGLES = [
  { key: "auto_invoice", label: "Auto-generate invoices", desc: "Create a receipt on every successful payment" },
  { key: "auto_email_receipt", label: "Auto-email receipts", desc: "Email the receipt to the customer after Paystack success" },
  { key: "auto_release_escrow", label: "Auto-release escrow", desc: "Release provider escrow on completion (off = manual)" },
  { key: "auto_approve_talent", label: "Auto-approve talent bookings", desc: "Instantly confirm talent bookings on payment" },
  { key: "auto_approve_events", label: "Auto-approve events", desc: "Publish submitted events automatically" },
  { key: "auto_approve_curators", label: "Auto-approve curators", desc: "Approve new curator listings on submission" },
  { key: "auto_approve_influencers", label: "Auto-approve influencers", desc: "Approve influencer profiles on signup" },
  { key: "auto_approve_sponsors", label: "Auto-approve sponsor ads", desc: "Approve sponsor ad creatives automatically" },
  { key: "auto_broadcast_roster", label: "Auto-broadcast roster", desc: "Send the weekly roster to the agency network" },
];

export default function AdminAutomation() {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [releaseId, setReleaseId] = React.useState("");
  const [releasing, setReleasing] = React.useState(false);

  const load = async () => {
    try {
      const list = await base44.entities.AutomationSetting.filter({ name: "global" });
      setCfg(list[0] || null);
    } catch { setCfg(null); }
  };
  React.useEffect(() => { load(); }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const u = await base44.auth.me();
      const payload = { ...cfg, updated_by: u?.email || "admin" };
      delete payload.id; delete payload.created_date; delete payload.updated_date; delete payload.created_by_id;
      if (cfg?.id) {
        await base44.entities.AutomationSetting.update(cfg.id, payload);
      } else {
        const created = await base44.entities.AutomationSetting.create({ name: "global", ...payload });
        setCfg(created);
      }
      toast({ title: "Automation settings saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const releaseEscrow = async () => {
    if (!releaseId.trim()) return;
    setReleasing(true);
    try {
      await base44.entities.Transaction.update(releaseId.trim(), {
        escrow_status: "released",
        escrow_released_at: new Date().toISOString(),
        escrow_released_by_name: "admin",
      });
      toast({ title: "Escrow released", description: releaseId.trim() });
      setReleaseId("");
    } catch (e) {
      toast({ title: "Release failed", description: e.message, variant: "destructive" });
    } finally { setReleasing(false); }
  };

  if (!cfg) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-center gap-2 mb-1"><Zap className="w-5 h-5 text-primary" /><h3 className="font-semibold text-base">Global automation</h3></div>
        <p className="text-xs text-muted-foreground mb-5">Master switches for every automated flow across Ride X. Overrides apply platform-wide.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-3 rounded-2xl bg-secondary/50 p-4">
              <div>
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </div>
              <Switch checked={!!cfg[t.key]} onCheckedChange={(v) => set(t.key, v)} />
            </div>
          ))}
        </div>
        <Button className="rounded-full mt-5" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Save automation
        </Button>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-center gap-2 mb-1"><Send className="w-5 h-5 text-primary" /><h3 className="font-semibold text-base">Manual escrow release</h3></div>
        <p className="text-xs text-muted-foreground mb-4">Force-release escrow for any Transaction ID (overrides the customer-confirmation step).</p>
        <div className="flex gap-2">
          <Input value={releaseId} onChange={(e) => setReleaseId(e.target.value)} placeholder="Transaction id…" className="rounded-xl" />
          <Button className="rounded-full" disabled={releasing} onClick={releaseEscrow}>
            {releasing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Release"}
          </Button>
        </div>
      </div>
    </div>
  );
}