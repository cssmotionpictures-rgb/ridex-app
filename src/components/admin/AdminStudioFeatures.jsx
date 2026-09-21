import React from "react";
import { base44 } from "@/api/base44Client";
import AdminEntityTable from "@/components/admin/AdminEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select as SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { STUDIO_TIERS, grossUpStudio, usd, freeFeatureTierLabel } from "@/lib/studioFeatures";
import { money } from "@/lib/pricing";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Plus } from "lucide-react";

export default function AdminStudioFeatures() {
  const [artists, setArtists] = React.useState([]);
  const [bookings, setBookings] = React.useState([]);
  const [apps, setApps] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState({ open: false, rec: null });
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, f] = await Promise.all([
        base44.entities.StudioFeatureArtist.list("sort_order", 200).catch(() => []),
        base44.entities.StudioFeatureBooking.list("-created_date", 200).catch(() => []),
        base44.entities.FreeFeatureApplication.list("-created_date", 200).catch(() => []),
      ]);
      setArtists(a);
      setBookings(b);
      setApps(f);
    } catch {}
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const saveArtist = async () => {
    const r = edit.rec;
    if (!r?.name || !r?.tier || r.net_fee == null) { toast({ title: "Name, tier and net fee required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const payload = { name: r.name, tier: r.tier, net_fee: Number(r.net_fee), gross_fee: Math.round(Number(r.net_fee) * 1.2), status: r.status || "active", sort_order: Number(r.sort_order || 100) };
      if (r.id) await base44.entities.StudioFeatureArtist.update(r.id, payload);
      else await base44.entities.StudioFeatureArtist.create(payload);
      setEdit({ open: false, rec: null });
      load();
    } catch (e) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const act = async (id, data, msg) => {
    try { await base44.entities.StudioFeatureBooking.update(id, data); toast({ title: msg }); load(); }
    catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  const delArtist = async (id) => { try { await base44.entities.StudioFeatureArtist.delete(id); load(); } catch {} };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Rate sheet ({artists.length})</h3>
          <Button size="sm" className="rounded-full" onClick={() => setEdit({ open: true, rec: { tier: "tier2_african", status: "active", sort_order: 100 } })}><Plus className="w-4 h-4" /> Add artist</Button>
        </div>
        <AdminEntityTable
          rows={artists}
          columns={[
            { key: "name", label: "Artist" },
            { key: "tier", label: "Tier", render: (r) => STUDIO_TIERS.find((t) => t.key === r.tier)?.label.split("·")[0].trim() || r.tier },
            { key: "net_fee", label: "Net", render: (r) => usd(r.net_fee) },
            { key: "gross_fee", label: "Gross", render: (r) => usd(r.gross_fee || (r.net_fee || 0) * 1.2) },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Edit", onClick: (r) => setEdit({ open: true, rec: { ...r } }) },
            { label: "Deactivate", visible: (r) => r.status === "active", onClick: (r) => saveArtistInline(r, { status: "inactive" }) },
            { label: "Activate", visible: (r) => r.status === "inactive", onClick: (r) => saveArtistInline(r, { status: "active" }) },
            { label: "Delete", variant: "destructive", onClick: (r) => delArtist(r.id) },
          ]}
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">Feature bookings ({bookings.length})</h3>
        <AdminEntityTable
          rows={bookings}
          columns={[
            { key: "guest_artist_name", label: "Guest" },
            { key: "principal_artist", label: "Principal" },
            { key: "client_name", label: "Client" },
            { key: "song_title", label: "Song" },
            { key: "total", label: "Escrow", render: (r) => usd(r.total) },
            { key: "escrow_status", label: "Escrow", status: true },
            { key: "status", label: "Status", status: true },
            { key: "fee_bypassed", label: "Fee", render: (r) => (r.fee_bypassed ? "Waived" : "20%") },
          ]}
          actions={[
            { label: "Release escrow", visible: (r) => r.escrow_status === "held", onClick: (r) => act(r.id, { escrow_status: "released", escrow_released_at: new Date().toISOString(), stems_delivered: true, status: "delivered" }, "Escrow released · stems unlocked") },
            { label: "Mark in studio", visible: (r) => r.status === "confirmed", onClick: (r) => act(r.id, { status: "in_studio" }, "Moved to in-studio") },
            { label: "Mark delivered", visible: (r) => r.status !== "delivered" && r.status !== "cancelled", onClick: (r) => act(r.id, { status: "delivered", stems_delivered: true }, "Marked delivered") },
            { label: "Sign split sheet", visible: (r) => !r.split_sheet_signed, onClick: (r) => act(r.id, { split_sheet_signed: true }, "Split sheet signed") },
            { label: "Bypass fees", visible: (r) => !r.fee_bypassed, onClick: (r) => act(r.id, { fee_bypassed: true, agency_commission: 0, engineering_surcharge: 0, total: r.net_fee }, "Agency fees waived") },
            { label: "Cancel", variant: "destructive", visible: (r) => r.status !== "cancelled", onClick: (r) => act(r.id, { status: "cancelled", escrow_status: "refunded" }, "Booking cancelled") },
          ]}
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">Free feature applications ({apps.length})</h3>
        <AdminEntityTable
          rows={apps}
          columns={[
            { key: "artist_name", label: "Artist" },
            { key: "song_title", label: "Song" },
            { key: "feature_tier", label: "Tier", render: (r) => freeFeatureTierLabel(r.feature_tier) },
            { key: "genre", label: "Genre" },
            { key: "music_url", label: "Link", render: (r) => r.music_url ? <a href={r.music_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs truncate max-w-[140px] inline-block">listen</a> : "—" },
            { key: "application_fee", label: "Fee", render: (r) => money(r.application_fee) },
            { key: "payment_status", label: "Paid", status: true },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Accept", visible: (r) => r.payment_status === "paid" && r.status !== "approved", onClick: (r) => act(r.id, { status: "approved", approved_at: new Date().toISOString() }, "Free feature accepted") },
            { label: "Decline", variant: "destructive", visible: (r) => r.status !== "rejected", onClick: (r) => { const reason = window.prompt("Decline reason:"); if (reason !== null) act(r.id, { status: "rejected", rejection_reason: reason || "Not selected in the 50/50 draw" }, "Application declined"); } },
          ]}
        />
      </div>

      <Dialog open={edit.open} onOpenChange={(v) => !v && setEdit({ open: false, rec: null })}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>{edit.rec?.id ? "Edit artist" : "Add artist"}</DialogTitle></DialogHeader>
          {edit.rec && (
            <div className="space-y-3">
              <div><Label className="text-xs">Name</Label><Input className="rounded-xl mt-1" value={edit.rec.name || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, name: e.target.value } }))} /></div>
              <div>
                <Label className="text-xs">Tier</Label>
                <SelectRoot value={edit.rec.tier} onValueChange={(v) => setEdit((s) => ({ ...s, rec: { ...s.rec, tier: v } }))}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STUDIO_TIERS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </SelectRoot>
              </div>
              <div><Label className="text-xs">Net fee (USD)</Label><Input type="number" className="rounded-xl mt-1" value={edit.rec.net_fee || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, net_fee: e.target.value } }))} /></div>
              <div><Label className="text-xs">Sort order</Label><Input type="number" className="rounded-xl mt-1" value={edit.rec.sort_order || 100} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, sort_order: e.target.value } }))} /></div>
              <Button className="rounded-full w-full" disabled={busy} onClick={saveArtist}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  async function saveArtistInline(r, patch) {
    try { await base44.entities.StudioFeatureArtist.update(r.id, { ...r, ...patch, gross_fee: Math.round((r.net_fee || 0) * 1.2) }); load(); }
    catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  }
}