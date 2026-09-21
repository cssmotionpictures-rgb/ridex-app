import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { buildZip } from "@/lib/zipWriter";
import { Loader2, FileArchive, CheckSquare, Square, Music } from "lucide-react";

// Mastered projects library — select any finished masters and export them as
// a single ZIP of WAVs. 100% in-browser (no server, no credits).
export default function MastersZipPanel() {
  const { toast } = useToast();
  const [masters, setMasters] = React.useState(null);
  const [selected, setSelected] = React.useState({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    base44.entities.MasteredTrack.list("-created_date", 200)
      .then((list) => setMasters(list))
      .catch(() => setMasters([]));
  }, []);

  const list = masters || [];
  const selectedMasters = list.filter((m) => selected[m.id]);
  const allOn = list.length > 0 && selectedMasters.length === list.length;
  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => setSelected(allOn ? {} : Object.fromEntries(list.map((m) => [m.id, true])));

  const exportZip = async () => {
    if (!selectedMasters.length) {
      toast({ title: "Select at least one master" });
      return;
    }
    setBusy(true);
    try {
      const files = [];
      const used = {};
      for (const m of selectedMasters) {
        const res = await fetch(m.file_url);
        if (!res.ok) throw new Error(`Couldn't load ${m.file_name}`);
        let name = m.file_name || "master.wav";
        used[name] = (used[name] || 0) + 1;
        if (used[name] > 1) name = name.replace(/\.wav$/i, "") + ` (${used[name]}).wav`;
        files.push({ name, data: new Uint8Array(await res.arrayBuffer()) });
      }
      const zip = buildZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = "RIDE-X Masters.zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast({ title: "ZIP exported", description: `${files.length} master${files.length > 1 ? "s" : ""} bundled into one archive.` });
    } catch (e) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileArchive className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-semibold">Mastered projects</p>
            <p className="text-xs text-muted-foreground">Select masters and export them as one ZIP of WAVs — runs fully in your browser.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={toggleAll} disabled={!list.length}>
            {allOn ? <CheckSquare className="w-3.5 h-3.5 mr-1" /> : <Square className="w-3.5 h-3.5 mr-1" />}
            {allOn ? "Clear" : "Select all"}
          </Button>
          <Button size="sm" className="rounded-full" disabled={busy || !selectedMasters.length} onClick={exportZip}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><FileArchive className="w-3.5 h-3.5 mr-1" /> Export ZIP ({selectedMasters.length})</>}
          </Button>
        </div>
      </div>
      {masters === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No mastered projects yet — finish a master in RIDE X Song Master and download it to list it here.</p>
      ) : (
        <div className="mt-4 space-y-1.5">
          {list.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2 cursor-pointer">
              <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={!!selected[m.id]} onChange={() => toggle(m.id)} />
              <Music className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm truncate flex-1">{m.file_name}</span>
              <span className="text-[10px] uppercase tracking-wider rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5 shrink-0">{m.preset || "master"}</span>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{new Date(m.created_date).toLocaleDateString()}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}