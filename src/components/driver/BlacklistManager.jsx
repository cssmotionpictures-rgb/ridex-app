import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban, Loader2, Trash2, UserX } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

// Drivers manage passengers they refuse to drive again. Admin reviews each entry.
export default function BlacklistManager({ driver, rides = [] }) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ ride_id: "", passenger_name: "", reason: "", severity: "Block" });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    if (!driver) return;
    setLoading(true);
    base44.entities.Blacklist.filter({ driver_id: driver.id }, "-created_date", 50)
      .then(setList).catch(() => {}).finally(() => setLoading(false));
  }, [driver]);

  React.useEffect(() => { load(); }, [load]);

  const addBlacklist = async (e) => {
    e.preventDefault();
    if (!form.reason.trim()) return;
    setBusy(true);
    try {
      const sel = rides.find((r) => r.id === form.ride_id);
      await base44.entities.Blacklist.create({
        driver_id: driver.id,
        driver_name: driver.full_name,
        passenger_name: form.passenger_name.trim() || (sel ? "Ride passenger" : "Unknown"),
        ride_id: form.ride_id,
        reason: form.reason.trim(),
        severity: form.severity,
        status: "Pending",
      });
      setForm({ ride_id: "", passenger_name: "", reason: "", severity: "Block" });
      load();
      setOpen(false);
    } catch (err) {
      alert(err.message || "Could not blacklist");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Remove this passenger from your blacklist?")) return;
    await base44.entities.Blacklist.delete(id).catch(() => {});
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Passengers you refuse to drive again. Admin reviews each entry.</p>
        <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}><Ban className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        list.length === 0 ? <p className="text-sm text-muted-foreground">No blacklisted passengers.</p> : (
          <div className="space-y-2">
            {list.map((b) => (
              <div key={b.id} className="flex items-start gap-3 rounded-2xl bg-secondary/40 p-3">
                <UserX className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{b.passenger_name || "Passenger"}</p>
                  <p className="text-xs text-muted-foreground">{b.reason}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={b.status} />
                    <span className="text-xs text-muted-foreground">{b.severity}</span>
                  </div>
                </div>
                <button onClick={() => remove(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <form onSubmit={addBlacklist} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Ban className="w-5 h-5 text-destructive" /> Blacklist a passenger</h3>
            <div>
              <Label className="text-xs">Related ride (optional)</Label>
              <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={form.ride_id} onChange={(e) => setForm((f) => ({ ...f, ride_id: e.target.value }))}>
                <option value="" className="bg-card">No specific ride</option>
                {rides.map((r) => <option key={r.id} value={r.id} className="bg-card">{r.pickup_address} → {r.dest_address}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Passenger name (optional)</Label>
              <Input className="rounded-xl mt-1" value={form.passenger_name} onChange={(e) => setForm((f) => ({ ...f, passenger_name: e.target.value }))} placeholder="Passenger name" />
            </div>
            <div>
              <Label className="text-xs">Severity</Label>
              <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                {["Warning", "Block", "Ban Request"].map((s) => <option key={s} value={s} className="bg-card">{s}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Reason *</Label>
              <Textarea className="rounded-xl mt-1" rows={3} required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why should this passenger be blacklisted?" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-full flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" className="rounded-full flex-1" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Add to blacklist</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}