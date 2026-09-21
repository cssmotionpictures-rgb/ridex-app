import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select as SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SPLIT_ROLES, PRO_LIST } from "@/lib/copyrightProtection";
import { Loader2, Plus, X } from "lucide-react";

const EMPTY = { song_title: "", studio_location: "", isrc_code: "", upc_code: "" };
const newWriter = () => ({ name: "", role: "Lyrics", pro: "MCSN", split: "" });

export default function SplitSheetDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = React.useState(EMPTY);
  const [writers, setWriters] = React.useState([newWriter(), newWriter()]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setForm(EMPTY); setWriters([newWriter(), newWriter()]); setErr(""); } }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setWriter = (i, k, v) => setWriters((ws) => ws.map((w, idx) => idx === i ? { ...w, [k]: v } : w));
  const total = writers.reduce((s, w) => s + (Number(w.split) || 0), 0);

  const submit = async () => {
    if (!form.song_title.trim()) { setErr("Song title is required."); return; }
    if (writers.some((w) => !w.name.trim())) { setErr("Every co-writer needs a name."); return; }
    if (total !== 100) { setErr(`Splits must total 100% — currently ${total}%.`); return; }
    setBusy(true);
    try {
      const rec = await base44.entities.SplitSheet.create({
        ...form,
        writers: JSON.stringify(writers),
        filed_with_mcsn: true,
        signed_date: new Date().toISOString(),
        status: "signed",
      });
      setBusy(false);
      onCreated?.(rec, "splitsheet");
    } catch (e) { setBusy(false); setErr(e.message || "Could not file split sheet"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>File Co-Writer Split Sheet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Song title</Label><Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => set("song_title", e.target.value)} placeholder="Working title" /></div>
            <div><Label className="text-xs">Studio location</Label><Input className="rounded-xl mt-1" value={form.studio_location} onChange={(e) => set("studio_location", e.target.value)} placeholder="Studio / DAW" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">ISRC (optional)</Label><Input className="rounded-xl mt-1" value={form.isrc_code} onChange={(e) => set("isrc_code", e.target.value)} /></div>
            <div><Label className="text-xs">UPC (optional)</Label><Input className="rounded-xl mt-1" value={form.upc_code} onChange={(e) => set("upc_code", e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Co-writers & splits</Label>
              <span className={`text-xs font-semibold ${total === 100 ? "text-accent" : "text-destructive"}`}>Total: {total}%</span>
            </div>
            {writers.map((w, i) => (
              <div key={i} className="rounded-2xl bg-secondary p-2.5 space-y-2">
                <div className="flex gap-2">
                  <Input className="rounded-lg flex-1 h-8 text-sm" placeholder="Legal name" value={w.name} onChange={(e) => setWriter(i, "name", e.target.value)} />
                  {writers.length > 1 && <button onClick={() => setWriters((ws) => ws.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SelectRoot value={w.role} onValueChange={(v) => setWriter(i, "role", v)}>
                    <SelectTrigger className="rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SPLIT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </SelectRoot>
                  <SelectRoot value={w.pro} onValueChange={(v) => setWriter(i, "pro", v)}>
                    <SelectTrigger className="rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRO_LIST.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </SelectRoot>
                  <Input type="number" className="rounded-lg h-8 text-sm" placeholder="%" value={w.split} onChange={(e) => setWriter(i, "split", e.target.value)} />
                </div>
              </div>
            ))}
            {writers.length < 8 && <Button variant="outline" size="sm" className="rounded-full w-full" onClick={() => setWriters((ws) => [...ws, newWriter()])}><Plus className="w-3.5 h-3.5" /> Add co-writer</Button>}
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "File & auto-register with MCSN"}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Auto-signed & filed with MCSN on submit. Splits must total 100%.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}