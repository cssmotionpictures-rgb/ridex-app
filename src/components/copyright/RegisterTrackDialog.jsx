import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPYRIGHT_FEES, ngn } from "@/lib/copyrightProtection";
import { Loader2 } from "lucide-react";

const EMPTY = { song_title: "", artist_name: "", client_name: "", client_email: "", studio_location: "", isrc_code: "", upc_code: "" };

export default function RegisterTrackDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setForm(EMPTY); setErr(""); } }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.song_title.trim() || !form.artist_name.trim() || !form.client_name.trim()) {
      setErr("Song title, artist and client name are required.");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const rec = await base44.entities.CopyrightRegistration.create({
        ...form,
        vault_timestamped: true,
        vault_date: now,
        content_id_setup: true,
        ncc_deposited: false,
        publishing_admin_fee: COPYRIGHT_FEES.publishing_admin,
        agency_legal_fee: COPYRIGHT_FEES.agency_legal,
        content_id_fee: COPYRIGHT_FEES.content_id,
        total: COPYRIGHT_FEES.total,
        currency: "NGN",
        escrow_status: "held",
        fee_bypassed: false,
        status: "protected",
      });
      setBusy(false);
      onCreated?.(rec, "certificate");
    } catch (e) { setBusy(false); setErr(e.message || "Could not register track"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Register & Protect a Track</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Song title</Label><Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => set("song_title", e.target.value)} placeholder="Working title" /></div>
            <div><Label className="text-xs">Artist name</Label><Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => set("artist_name", e.target.value)} placeholder="Recording artist" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Client / rights holder</Label><Input className="rounded-xl mt-1" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Label or artist entity" /></div>
            <div><Label className="text-xs">Client email</Label><Input className="rounded-xl mt-1" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} placeholder="legal@label.com" /></div>
          </div>
          <div><Label className="text-xs">Studio location</Label><Input className="rounded-xl mt-1" value={form.studio_location} onChange={(e) => set("studio_location", e.target.value)} placeholder="Lagos / Abuja studio" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">ISRC (optional)</Label><Input className="rounded-xl mt-1" value={form.isrc_code} onChange={(e) => set("isrc_code", e.target.value)} placeholder="Auto if blank" /></div>
            <div><Label className="text-xs">UPC (optional)</Label><Input className="rounded-xl mt-1" value={form.upc_code} onChange={(e) => set("upc_code", e.target.value)} placeholder="Auto if blank" /></div>
          </div>

          <div className="rounded-2xl bg-secondary p-4 text-sm space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">3-Step Proof Framework (auto)</p>
            <p className="text-[11px]">① Vault timestamp · ② ISRC/UPC + Content ID · ③ NCC deposit (admin marks)</p>
            <div className="flex justify-between pt-2"><span className="text-muted-foreground">Publishing admin</span><span>{ngn(COPYRIGHT_FEES.publishing_admin)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Agency legal (20%)</span><span>{ngn(COPYRIGHT_FEES.agency_legal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Content ID fingerprinting</span><span>{ngn(COPYRIGHT_FEES.content_id)}</span></div>
            <div className="flex justify-between font-bold pt-1 border-t border-border/50 mt-1"><span>Deposit to initialize</span><span>{ngn(COPYRIGHT_FEES.total)}</span></div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Register & generate certificate"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Auto-protects on submit. Escrow held until NCC deposit clears. Admin can waive fees.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}