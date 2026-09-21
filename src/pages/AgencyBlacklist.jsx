import React from "react";
import { base44 } from "@/api/base44Client";
import { AGENCY } from "@/lib/agency";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldBan, Plus } from "lucide-react";

const STATUS_LABEL = {
  permanent_block: { t: "Permanent Block", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  conditional_restructure: { t: "Conditional (100% upfront)", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export default function AgencyBlacklist() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ company_name: "", contact_name: "", reason: "", status: "permanent_block" });
  const [saving, setSaving] = React.useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.PromoterBlacklist.list("-created_date", 50)
      .then(setRows).finally(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.company_name.trim() || !form.reason.trim()) return;
    setSaving(true);
    try {
      await base44.entities.PromoterBlacklist.create({
        ...form,
        log_id: `LOG-${String(rows.length + 1).padStart(3, "0")}`,
      });
      setForm({ company_name: "", contact_name: "", reason: "", status: "permanent_block" });
      load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Risk Management" title="Promoter Blacklist Log" subtitle="Cross-reference every incoming LOI against this register before checking artist calendars." />
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3 h-fit">
          <p className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Add a flagged promoter</p>
          <div>
            <Label className="text-xs">Company / promoter entity</Label>
            <Input className="rounded-xl mt-1" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="e.g. Gidi Vibez Ent." />
          </div>
          <div>
            <Label className="text-xs">Contact name</Label>
            <Input className="rounded-xl mt-1" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Reason / classification</Label>
            <Input className="rounded-xl mt-1" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Payment default, rider safety failure…" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent_block">Permanent Block</SelectItem>
                <SelectItem value="conditional_restructure">Conditional Restructure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full rounded-full" disabled={saving} onClick={add}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to blacklist"}</Button>
          <p className="text-[11px] text-muted-foreground">Maintained by the routing desk · {AGENCY.phone}</p>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-muted-foreground text-sm">
              <ShieldBan className="w-8 h-8 mx-auto mb-2 opacity-50" /> No flagged promoters yet.
            </div>
          ) : rows.map((r) => {
            const s = STATUS_LABEL[r.status] || STATUS_LABEL.permanent_block;
            return (
              <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.company_name}</p>
                    <p className="text-xs text-muted-foreground">{r.contact_name || "No contact on file"} · {r.log_id}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border ${s.cls}`}>{s.t}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{r.reason}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}