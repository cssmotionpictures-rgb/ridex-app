import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Landmark, Plus, Trash2, Pencil, Check, X, Activity } from "lucide-react";

// MANUAL LENDER DIRECTORY — the reliable fallback for automatic lender
// delivery. When the live lender-email web search fails, these admin-curated
// emails are used automatically (matched by funding-source keywords, then by
// amount range). Add or update any address here — no code needed.
export default function LenderDirectory() {
  const [rows, setRows] = React.useState([]);
  const [me, setMe] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // { id, email }
  const [form, setForm] = React.useState({ name: "", email: "", keywords: "", min: "", max: "" });

  const load = React.useCallback(() => {
    base44.entities.LenderDirectory.list("-created_date", 100)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoaded(true));
  }, []);

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => setMe(null));
    load();
  }, [load]);

  if (!loaded || !me || me.role !== "admin") return null;

  const add = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setBusy(true);
    try {
      await base44.entities.LenderDirectory.create({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        keywords: form.keywords.trim(),
        min_amount: Number(form.min) || 0,
        max_amount: Number(form.max) || 0,
      });
      setForm({ name: "", email: "", keywords: "", min: "", max: "" });
      load();
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async (row) => {
    setBusy(true);
    try {
      await base44.entities.LenderDirectory.update(row.id, { email: (editing.email || "").trim().toLowerCase() });
      setEditing(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row) => {
    await base44.entities.LenderDirectory.update(row.id, { active: row.active === false }).catch(() => {});
    load();
  };

  const remove = async (row) => {
    await base44.entities.LenderDirectory.delete(row.id).catch(() => {});
    load();
  };

  return (
    <div className="mt-5 rounded-2xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Landmark className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm">Manual lender directory</p>
            <p className="text-[11px] text-muted-foreground">
              Reliable fallback emails — used automatically whenever a live lender-email search fails. Add or update any time.
            </p>
          </div>
        </div>
        <Link
          to="/delivery-status"
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-[11px] font-semibold hover:bg-secondary/70"
        >
          <Activity className="w-3.5 h-3.5" /> Delivery dashboard
        </Link>
      </div>

      {/* Add form */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Input placeholder="Lender name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Keywords (boi, microfinance…)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
        <Input type="number" placeholder="Min ₦" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />
        <div className="flex gap-2">
          <Input type="number" placeholder="Max ₦" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
          <Button size="sm" className="rounded-full shrink-0" disabled={busy || !form.name.trim() || !form.email.trim()} onClick={add}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No manual entries yet — add a lender above and it becomes the automatic fallback for its keywords / amount range.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-xs">
              <button
                onClick={() => toggleActive(r)}
                title={r.active === false ? "Reactivate this fallback lender" : "Deactivate this fallback lender"}
                className={`shrink-0 px-2 py-0.5 rounded-full font-bold ${r.active === false ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-400"}`}
              >
                {r.active === false ? "OFF" : "ACTIVE"}
              </button>
              <span className="font-bold truncate max-w-[28%]">{r.name}</span>
              {editing?.id === r.id ? (
                <span className="flex flex-1 items-center gap-1 min-w-0">
                  <Input className="h-7 text-xs" value={editing.email} onChange={(e) => setEditing({ id: r.id, email: e.target.value })} />
                  <button disabled={busy} onClick={() => saveEmail(r)} className="text-emerald-400 shrink-0"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditing(null)} className="text-muted-foreground shrink-0"><X className="w-3.5 h-3.5" /></button>
                </span>
              ) : (
                <button onClick={() => setEditing({ id: r.id, email: r.email || "" })} className="flex flex-1 items-center gap-1.5 min-w-0 text-muted-foreground hover:text-foreground">
                  <span className="truncate">{r.email}</span>
                  <Pencil className="w-3 h-3 shrink-0" />
                </button>
              )}
              <span className="hidden sm:block text-muted-foreground/70 truncate max-w-[22%]">{r.keywords}</span>
              <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}