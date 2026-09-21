import React from "react";
import { base44 } from "@/api/base44Client";
import AdminEntityTable from "@/components/admin/AdminEntityTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select as SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SAMPLE_COHORTS, grossUpClear, clearMoney } from "@/lib/sampleClearance";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Plus } from "lucide-react";

export default function AdminSampleClearance() {
  const [artists, setArtists] = React.useState([]);
  const [requests, setRequests] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState({ open: false, rec: null });
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        base44.entities.SampleClearanceArtist.list("sort_order", 300).catch(() => []),
        base44.entities.SampleClearanceRequest.list("-created_date", 200).catch(() => []),
      ]);
      setArtists(a);
      setRequests(r);
    } catch {}
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const saveArtist = async () => {
    const r = edit.rec;
    if (!r?.name || !r?.cohort || r.net_fee == null) { toast({ title: "Name, cohort and net fee required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const payload = {
        name: r.name, cohort: r.cohort, era: r.era || "", master_controller: r.master_controller || "", publishing_admin: r.publishing_admin || "",
        net_fee: Number(r.net_fee), gross_fee: Math.round(Number(r.net_fee) * 1.2), currency: r.currency || "USD",
        public_domain: !!r.public_domain, status: r.status || "active", sort_order: Number(r.sort_order || 100),
      };
      if (r.id) await base44.entities.SampleClearanceArtist.update(r.id, payload);
      else await base44.entities.SampleClearanceArtist.create(payload);
      setEdit({ open: false, rec: null });
      load();
    } catch (e) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const act = async (id, data, msg) => {
    try { await base44.entities.SampleClearanceRequest.update(id, data); toast({ title: msg }); load(); }
    catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  const delArtist = async (id) => { try { await base44.entities.SampleClearanceArtist.delete(id); load(); } catch {} };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Clearance matrix ({artists.length})</h3>
          <Button size="sm" className="rounded-full" onClick={() => setEdit({ open: true, rec: { cohort: "nigeria_modern", currency: "USD", status: "active", sort_order: 100 } })}><Plus className="w-4 h-4" /> Add artist</Button>
        </div>
        <AdminEntityTable
          rows={artists}
          columns={[
            { key: "name", label: "Artist" },
            { key: "cohort", label: "Cohort", render: (r) => SAMPLE_COHORTS.find((c) => c.key === r.cohort)?.label.split("(")[0].trim() || r.cohort },
            { key: "master_controller", label: "Master" },
            { key: "publishing_admin", label: "Publisher" },
            { key: "net_fee", label: "Net", render: (r) => clearMoney(r.net_fee, r.currency) },
            { key: "gross_fee", label: "Gross", render: (r) => clearMoney(r.gross_fee || (r.net_fee || 0) * 1.2, r.currency) },
            { key: "public_domain", label: "PD", render: (r) => (r.public_domain ? "Yes" : "—") },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Edit", onClick: (r) => setEdit({ open: true, rec: { ...r } }) },
            { label: "Delete", variant: "destructive", onClick: (r) => delArtist(r.id) },
          ]}
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">Clearance requests ({requests.length})</h3>
        <AdminEntityTable
          rows={requests}
          columns={[
            { key: "original_artist", label: "Original" },
            { key: "new_artist", label: "Sampling Artist" },
            { key: "client_name", label: "Client" },
            { key: "new_song_title", label: "New Track" },
            { key: "total", label: "Escrow", render: (r) => clearMoney(r.total, r.currency) },
            { key: "escrow_status", label: "Escrow", status: true },
            { key: "split_sheet_signed", label: "Split", render: (r) => (r.split_sheet_signed ? "Signed" : "—") },
            { key: "mcsn_registered", label: "MCSN", render: (r) => (r.mcsn_registered ? "Filed" : "—") },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Sign split sheet", visible: (r) => !r.split_sheet_signed, onClick: (r) => act(r.id, { split_sheet_signed: true }, "Split sheet signed") },
            { label: "File with MCSN", visible: (r) => !r.mcsn_registered, onClick: (r) => act(r.id, { mcsn_registered: true }, "Registered with MCSN") },
            { label: "Issue certificate", visible: (r) => !r.clearance_certificate_issued, onClick: (r) => act(r.id, { clearance_certificate_issued: true, escrow_status: "released", escrow_released_at: new Date().toISOString(), status: "cleared" }, "Certificate issued · escrow released") },
            { label: "Bypass fees", visible: (r) => !r.fee_bypassed, onClick: (r) => act(r.id, { fee_bypassed: true, agency_commission: 0, total: r.net_fee }, "Agency fee waived") },
            { label: "Cancel", variant: "destructive", visible: (r) => r.status !== "cancelled", onClick: (r) => act(r.id, { status: "cancelled", escrow_status: "refunded" }, "Request cancelled") },
          ]}
        />
      </div>

      <Dialog open={edit.open} onOpenChange={(v) => !v && setEdit({ open: false, rec: null })}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.rec?.id ? "Edit artist" : "Add artist"}</DialogTitle></DialogHeader>
          {edit.rec && (
            <div className="space-y-3">
              <div><Label className="text-xs">Name</Label><Input className="rounded-xl mt-1" value={edit.rec.name || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, name: e.target.value } }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cohort</Label>
                  <SelectRoot value={edit.rec.cohort} onValueChange={(v) => setEdit((s) => ({ ...s, rec: { ...s.rec, cohort: v } }))}>
                    <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{SAMPLE_COHORTS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label.split("(")[0].trim()}</SelectItem>)}</SelectContent>
                  </SelectRoot>
                </div>
                <div>
                  <Label className="text-xs">Currency</Label>
                  <SelectRoot value={edit.rec.currency || "USD"} onValueChange={(v) => setEdit((s) => ({ ...s, rec: { ...s.rec, currency: v } }))}>
                    <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="NGN">NGN</SelectItem></SelectContent>
                  </SelectRoot>
                </div>
              </div>
              <div><Label className="text-xs">Era</Label><Input className="rounded-xl mt-1" value={edit.rec.era || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, era: e.target.value } }))} /></div>
              <div><Label className="text-xs">Master controller (label)</Label><Input className="rounded-xl mt-1" value={edit.rec.master_controller || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, master_controller: e.target.value } }))} /></div>
              <div><Label className="text-xs">Publishing administrator</Label><Input className="rounded-xl mt-1" value={edit.rec.publishing_admin || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, publishing_admin: e.target.value } }))} /></div>
              <div><Label className="text-xs">Net fee</Label><Input type="number" className="rounded-xl mt-1" value={edit.rec.net_fee || ""} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, net_fee: e.target.value } }))} /></div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!edit.rec.public_domain} onChange={(e) => setEdit((s) => ({ ...s, rec: { ...s.rec, public_domain: e.target.checked } }))} /> Public Domain master (publishing only)</label>
              <Button className="rounded-full w-full" disabled={busy} onClick={saveArtist}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}