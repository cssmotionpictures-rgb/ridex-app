import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { grossUpClear, clearMoney, SAMPLE_TYPES } from "@/lib/sampleClearance";
import { Loader2 } from "lucide-react";

const EMPTY = { original_song: "", new_artist: "", client_name: "", client_email: "", new_song_title: "", sample_type: "master_loop", sample_start: "", sample_end: "" };

export default function SampleClearanceDialog({ open, onOpenChange, artist, onCreated }) {
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const cur = artist?.currency || "USD";
  const t = grossUpClear(artist?.net_fee || artist?.net || 0);

  React.useEffect(() => { if (open) { setForm(EMPTY); setErr(""); } }, [open, artist?.name]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.new_artist.trim() || !form.client_name.trim() || !form.new_song_title.trim() || !form.original_song.trim()) {
      setErr("Original song, new artist, client and new song title are required.");
      return;
    }
    setBusy(true);
    try {
      const rec = await base44.entities.SampleClearanceRequest.create({
        original_artist: artist?.name,
        original_song: form.original_song.trim(),
        original_label: artist?.master || artist?.master_controller || "",
        original_publisher: artist?.publisher || artist?.publishing_admin || "",
        public_domain: !!artist?.public_domain,
        new_artist: form.new_artist.trim(),
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        new_song_title: form.new_song_title.trim(),
        sample_type: form.sample_type,
        sample_start: form.sample_start.trim(),
        sample_end: form.sample_end.trim(),
        net_fee: t.net,
        agency_commission: t.agency,
        total: t.gross,
        currency: cur,
        escrow_status: "held",
        status: "confirmed",
        split_sheet_signed: false,
        mcsn_registered: false,
        clearance_certificate_issued: false,
        fee_bypassed: false,
      });
      setBusy(false);
      onCreated?.(rec);
    } catch (e) {
      setBusy(false);
      setErr(e.message || "Could not submit clearance request");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clear Sample · {artist?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {artist?.public_domain && (
            <p className="text-[11px] rounded-xl bg-primary/10 text-primary px-3 py-2">Public Domain master (1960s rule) — only the publishing side is cleared. No master license fee.</p>
          )}
          <div>
            <Label className="text-xs">Original song title</Label>
            <Input className="rounded-xl mt-1" value={form.original_song} onChange={(e) => set("original_song", e.target.value)} placeholder="Song being sampled" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">New sampling artist</Label><Input className="rounded-xl mt-1" value={form.new_artist} onChange={(e) => set("new_artist", e.target.value)} placeholder="Your artist" /></div>
            <div><Label className="text-xs">Client / label</Label><Input className="rounded-xl mt-1" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Funding entity" /></div>
          </div>
          <div><Label className="text-xs">New song title</Label><Input className="rounded-xl mt-1" value={form.new_song_title} onChange={(e) => set("new_song_title", e.target.value)} placeholder="Derivative track" /></div>
          <div>
            <Label className="text-xs">Sample use type</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SAMPLE_TYPES.map((s) => (
                <button key={s.key} type="button" onClick={() => set("sample_type", s.key)} className={`px-3 py-1.5 rounded-full text-xs ${form.sample_type === s.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{s.label.split(" / ")[0]}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sample start</Label><Input className="rounded-xl mt-1" value={form.sample_start} onChange={(e) => set("sample_start", e.target.value)} placeholder="0:30" /></div>
            <div><Label className="text-xs">Sample end</Label><Input className="rounded-xl mt-1" value={form.sample_end} onChange={(e) => set("sample_end", e.target.value)} placeholder="1:00" /></div>
          </div>
          <div><Label className="text-xs">Client email (escrow wire telemetry)</Label><Input className="rounded-xl mt-1" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} placeholder="legal@label.com" /></div>

          <div className="rounded-2xl bg-secondary p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Net clearance fee</span><span>{clearMoney(t.net, cur)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Agency surcharge (20%)</span><span>{clearMoney(t.agency, cur)}</span></div>
            <div className="flex justify-between font-bold pt-1 border-t border-border/50 mt-1"><span>Escrow funding required</span><span>{clearMoney(t.gross, cur)}</span></div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit & generate clearance docs"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Auto-confirms on submit. Escrow held until split sheet is signed & filed with MCSN. Admin can waive fees.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}