import React from "react";
import { base44 } from "@/api/base44Client";
import AdminEntityTable from "@/components/admin/AdminEntityTable";
import { ngn } from "@/lib/copyrightProtection";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export default function AdminCopyright() {
  const [regs, setRegs] = React.useState([]);
  const [splits, setSplits] = React.useState([]);
  const [cases, setCases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s, c] = await Promise.all([
        base44.entities.CopyrightRegistration.list("-created_date", 200).catch(() => []),
        base44.entities.SplitSheet.list("-created_date", 200).catch(() => []),
        base44.entities.InfringementCase.list("-created_date", 200).catch(() => []),
      ]);
      setRegs(r); setSplits(s); setCases(c);
    } catch {}
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const act = async (entity, id, data, msg) => {
    try { await base44.entities[entity].update(id, data); toast({ title: msg }); load(); }
    catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold mb-3">Track registrations ({regs.length})</h3>
        <AdminEntityTable
          rows={regs}
          columns={[
            { key: "song_title", label: "Song" },
            { key: "artist_name", label: "Artist" },
            { key: "client_name", label: "Client" },
            { key: "total", label: "Deposit", render: (r) => ngn(r.total) },
            { key: "ncc_deposited", label: "NCC", render: (r) => (r.ncc_deposited ? "Deposited" : "Pending") },
            { key: "escrow_status", label: "Escrow", status: true },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Mark NCC deposited", visible: (r) => !r.ncc_deposited, onClick: (r) => act("CopyrightRegistration", r.id, { ncc_deposited: true, ncc_certificate_id: `NCC-2026-CR${String(r.id).slice(-4).toUpperCase()}`, status: "registered" }, "NCC deposit confirmed · certificate issued") },
            { label: "Release escrow", visible: (r) => r.escrow_status === "held", onClick: (r) => act("CopyrightRegistration", r.id, { escrow_status: "released", escrow_released_at: new Date().toISOString() }, "Escrow released") },
            { label: "Bypass fees", visible: (r) => !r.fee_bypassed, onClick: (r) => act("CopyrightRegistration", r.id, { fee_bypassed: true, agency_legal_fee: 0, content_id_fee: 0, total: r.publishing_admin_fee }, "Agency fees waived") },
            { label: "Cancel", variant: "destructive", visible: (r) => r.status !== "cancelled", onClick: (r) => act("CopyrightRegistration", r.id, { status: "cancelled", escrow_status: "refunded" }, "Registration cancelled") },
          ]}
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">Split sheets ({splits.length})</h3>
        <AdminEntityTable
          rows={splits}
          columns={[
            { key: "song_title", label: "Song" },
            { key: "studio_location", label: "Studio" },
            { key: "filed_with_mcsn", label: "MCSN", render: (r) => (r.filed_with_mcsn ? "Filed" : "—") },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Unfile MCSN", visible: (r) => r.filed_with_mcsn, onClick: (r) => act("SplitSheet", r.id, { filed_with_mcsn: false, status: "signed" }, "Removed from MCSN") },
            { label: "Re-file MCSN", visible: (r) => !r.filed_with_mcsn, onClick: (r) => act("SplitSheet", r.id, { filed_with_mcsn: true, status: "filed" }, "Re-filed with MCSN") },
            { label: "Cancel", variant: "destructive", onClick: (r) => act("SplitSheet", r.id, { status: "draft" }, "Split sheet voided") },
          ]}
        />
      </div>

      <div>
        <h3 className="font-semibold mb-3">Infringement cases ({cases.length})</h3>
        <AdminEntityTable
          rows={cases}
          columns={[
            { key: "track_title", label: "Track" },
            { key: "infringing_party", label: "Infringer" },
            { key: "infringing_company", label: "Company" },
            { key: "settlement_amount", label: "Settlement", render: (r) => (r.settlement_amount ? ngn(r.settlement_amount) : "—") },
            { key: "status", label: "Status", status: true },
          ]}
          actions={[
            { label: "Mark resolved", visible: (r) => r.status !== "resolved", onClick: (r) => act("InfringementCase", r.id, { status: "resolved" }, "Case resolved") },
            { label: "Escalate", variant: "destructive", visible: (r) => r.status !== "escalated", onClick: (r) => act("InfringementCase", r.id, { status: "escalated" }, "Case escalated to litigation") },
          ]}
        />
      </div>
    </div>
  );
}