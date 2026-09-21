import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const EMPTY = { track_title: "", artist_name: "", infringing_party: "", infringing_company: "", infringing_address: "", event_campaign: "" };

export default function CeaseDesistDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setForm(EMPTY); setErr(""); } }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.track_title.trim() || !form.infringing_party.trim()) {
      setErr("Track title and infringing party are required.");
      return;
    }
    setBusy(true);
    try {
      const rec = await base44.entities.InfringementCase.create({
        ...form,
        sent_date: new Date().toISOString(),
        status: "sent",
      });
      setBusy(false);
      onCreated?.(rec, "ceasedesist");
    } catch (e) { setBusy(false); setErr(e.message || "Could not dispatch notice"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Issue Cease & Desist Notice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Protected track title</Label><Input className="rounded-xl mt-1" value={form.track_title} onChange={(e) => set("track_title", e.target.value)} placeholder="Your song" /></div>
            <div><Label className="text-xs">Your artist name</Label><Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => set("artist_name", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Infringing party (name)</Label><Input className="rounded-xl mt-1" value={form.infringing_party} onChange={(e) => set("infringing_party", e.target.value)} placeholder="Person / director" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Company</Label><Input className="rounded-xl mt-1" value={form.infringing_company} onChange={(e) => set("infringing_company", e.target.value)} /></div>
            <div><Label className="text-xs">Event / campaign</Label><Input className="rounded-xl mt-1" value={form.event_campaign} onChange={(e) => set("event_campaign", e.target.value)} placeholder="Venue / promo name" /></div>
          </div>
          <div><Label className="text-xs">Infringing address</Label><Input className="rounded-xl mt-1" value={form.infringing_address} onChange={(e) => set("infringing_address", e.target.value)} placeholder="Lekki, Lagos" /></div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Dispatch Cease & Desist"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Auto-dispatches on submit under the Nigerian Copyright Act 2022. Admin can mark resolved / escalated.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}