import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { featureTotals, usd } from "@/lib/studioFeatures";
import { Loader2 } from "lucide-react";

const EMPTY = { principal_artist: "", client_name: "", client_email: "", song_title: "", genre: "", bpm: "", song_key: "", release_date: "" };

export default function FeatureRequestDialog({ open, onOpenChange, artist, onCreated }) {
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const t = featureTotals(artist?.net_fee || artist?.net || 0);

  React.useEffect(() => { if (open) { setForm(EMPTY); setErr(""); } }, [open, artist?.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.principal_artist.trim() || !form.client_name.trim() || !form.song_title.trim()) {
      setErr("Principal artist, client name and song title are required.");
      return;
    }
    setBusy(true);
    try {
      const rec = await base44.entities.StudioFeatureBooking.create({
        guest_artist_id: artist?.id || "",
        guest_artist_name: artist?.name,
        principal_artist: form.principal_artist.trim(),
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        song_title: form.song_title.trim(),
        genre: form.genre.trim(),
        bpm: form.bpm.trim(),
        song_key: form.song_key.trim(),
        release_date: form.release_date || "",
        net_fee: t.net,
        agency_commission: t.agency,
        engineering_surcharge: t.engineering,
        total: t.total,
        escrow_status: "held",
        status: "confirmed",
        split_sheet_signed: false,
        stems_delivered: false,
        fee_bypassed: false,
      });
      setBusy(false);
      onCreated?.(rec);
    } catch (e) {
      setBusy(false);
      setErr(e.message || "Could not submit request");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Feature · {artist?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Principal artist (main)</Label>
              <Input className="rounded-xl mt-1" value={form.principal_artist} onChange={(e) => set("principal_artist", e.target.value)} placeholder="Your artist name" />
            </div>
            <div>
              <Label className="text-xs">Client / sponsor</Label>
              <Input className="rounded-xl mt-1" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Label or investor" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Song title</Label>
              <Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => set("song_title", e.target.value)} placeholder="Working title" />
            </div>
            <div>
              <Label className="text-xs">Genre</Label>
              <Input className="rounded-xl mt-1" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Afrobeats / Hip-Hop" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">BPM</Label>
              <Input className="rounded-xl mt-1" value={form.bpm} onChange={(e) => set("bpm", e.target.value)} placeholder="102" />
            </div>
            <div>
              <Label className="text-xs">Key</Label>
              <Input className="rounded-xl mt-1" value={form.song_key} onChange={(e) => set("song_key", e.target.value)} placeholder="Am" />
            </div>
            <div>
              <Label className="text-xs">Release date</Label>
              <Input type="date" className="rounded-xl mt-1" value={form.release_date} onChange={(e) => set("release_date", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Client email (for escrow wire telemetry)</Label>
            <Input className="rounded-xl mt-1" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} placeholder="a&r@label.com" />
          </div>

          <div className="rounded-2xl bg-secondary p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Talent feature (net)</span><span>{usd(t.net)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Agency surcharge (20%)</span><span>{usd(t.agency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Engineering & split-sheet clearing</span><span>{usd(t.engineering)}</span></div>
            <div className="flex justify-between font-bold pt-1 border-t border-border/50 mt-1"><span>Escrow funding required</span><span>{usd(t.total)}</span></div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit & generate invoice"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Booking auto-confirms. Escrow held until stems + split sheet are delivered. Admin can waive fees.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}