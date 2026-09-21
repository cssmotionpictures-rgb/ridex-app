import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Tag } from "lucide-react";
import { money } from "@/lib/pricing";
import { toast } from "@/components/ui/use-toast";

const EMPTY = { code: "", description: "", discount_type: "percent", value: 20, min_amount: 0, max_uses: 0, applicable_services: "all", expires_at: "", active: true, notes: "" };

export default function AdminPromoCodes() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [editId, setEditId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await base44.entities.PromoCode.list("-created_date", 100)); } catch { setRows([]); }
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({ ...EMPTY, ...r, expires_at: r.expires_at ? r.expires_at.slice(0, 16) : "" });
    setEditId(r.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim()) { toast({ title: "Code is required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discount_type: form.discount_type,
        value: Number(form.value) || 0,
        min_amount: Number(form.min_amount) || 0,
        max_uses: Number(form.max_uses) || 0,
        applicable_services: form.applicable_services.trim() || "all",
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : "",
        active: form.active,
        notes: form.notes,
      };
      if (editId) await base44.entities.PromoCode.update(editId, payload);
      else await base44.entities.PromoCode.create(payload);
      setBusy(false); setOpen(false); load();
      toast({ title: editId ? "Promo updated" : "Promo created" });
    } catch (e) {
      setBusy(false);
      toast({ title: e.message || "Save failed", variant: "destructive" });
    }
  };

  const toggle = async (r) => { await base44.entities.PromoCode.update(r.id, { active: !r.active }); load(); };
  const del = async (r) => { if (!confirm(`Delete promo ${r.code}?`)) return; await base44.entities.PromoCode.delete(r.id); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Promo codes</h3>
          <p className="text-xs text-muted-foreground">Discounts customers apply at checkout. Validated server-side — codes can't be bypassed.</p>
        </div>
        <Button className="rounded-full" onClick={openNew}><Plus className="w-4 h-4" /> New promo</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border/60 rounded-2xl">No promo codes yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0"><Tag className="w-4 h-4 text-primary" /></div>
              <div className="flex-1 min-w-[160px]">
                <p className="font-bold tracking-wide">{r.code} {r.discount_type === "percent" ? `\u00b7 ${r.value}% off` : `\u00b7 ${money(r.value)} off`}</p>
                <p className="text-xs text-muted-foreground">{r.description || "\u2014"}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Used: {r.used_count || 0}{r.max_uses > 0 ? ` / ${r.max_uses}` : " / \u221e"}</p>
                <p>{r.applicable_services === "all" ? "All services" : r.applicable_services}</p>
                {r.expires_at && <p>Expires {new Date(r.expires_at).toLocaleDateString()}</p>}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant={r.active ? "default" : "outline"} className="rounded-full" onClick={() => toggle(r)}>{r.active ? "Active" : "Inactive"}</Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => openEdit(r)}>Edit</Button>
                <Button size="sm" variant="destructive" className="rounded-full" onClick={() => del(r)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit promo" : "New promo code"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Code</Label><Input className="rounded-xl mt-1" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="RIDEX2026" /></div>
            <div><Label className="text-xs">Description</Label><Input className="rounded-xl mt-1" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Launch 20% off" /></div>
            <div>
              <Label className="text-xs">Discount type</Label>
              <select className="w-full rounded-xl mt-1 bg-secondary border border-border px-3 h-9 text-sm" value={form.discount_type} onChange={(e) => set("discount_type", e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (₦)</option>
              </select>
            </div>
            <div><Label className="text-xs">{form.discount_type === "percent" ? "Percent (0-100)" : "Amount (\u20a6)"}</Label><Input className="rounded-xl mt-1" type="number" value={form.value} onChange={(e) => set("value", e.target.value)} /></div>
            <div><Label className="text-xs">Min spend (\u20a6, 0=none)</Label><Input className="rounded-xl mt-1" type="number" value={form.min_amount} onChange={(e) => set("min_amount", e.target.value)} /></div>
            <div><Label className="text-xs">Max uses (0=∞)</Label><Input className="rounded-xl mt-1" type="number" value={form.max_uses} onChange={(e) => set("max_uses", e.target.value)} /></div>
            <div><Label className="text-xs">Applies to (comma services or "all")</Label><Input className="rounded-xl mt-1" value={form.applicable_services} onChange={(e) => set("applicable_services", e.target.value)} placeholder="all / ride,carwash" /></div>
            <div><Label className="text-xs">Expires (optional)</Label><Input className="rounded-xl mt-1" type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} /></div>
            <label className="col-span-2 flex items-center gap-2 text-sm mt-1">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" disabled={busy} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}