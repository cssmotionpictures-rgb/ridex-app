import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, FileText } from "lucide-react";
import { generateAgreementHTML, printHtml } from "@/lib/zeroRejection";
import { AGENCY } from "@/lib/agency";
import { useToast } from "@/components/ui/use-toast";

export default function ZeroRejectionAgreementDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [f, setF] = React.useState({ agency: AGENCY.name, artist: "", songTitle: "", curator: "", handle: "", mediaClass: "Playlist Curator" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const gen = () => {
    if (!f.artist || !f.songTitle || !f.curator) {
      toast({ title: "Fill artist, song title and curator", variant: "destructive" });
      return;
    }
    const ok = printHtml(generateAgreementHTML(f));
    if (!ok) toast({ title: "Allow pop-ups to print the agreement", variant: "destructive" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Zero-Rejection Agreement</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Agency</Label><Input className="rounded-xl mt-1" value={f.agency} onChange={(e) => set("agency", e.target.value)} /></div>
          <div><Label className="text-xs">Artist / Licensor</Label><Input className="rounded-xl mt-1" value={f.artist} onChange={(e) => set("artist", e.target.value)} placeholder="Tems" /></div>
          <div className="col-span-2"><Label className="text-xs">Song title</Label><Input className="rounded-xl mt-1" value={f.songTitle} onChange={(e) => set("songTitle", e.target.value)} placeholder='"Free Mind"' /></div>
          <div className="col-span-2"><Label className="text-xs">Curator / Influencer name</Label><Input className="rounded-xl mt-1" value={f.curator} onChange={(e) => set("curator", e.target.value)} placeholder="Lagos Vibe Playlists" /></div>
          <div><Label className="text-xs">Handle</Label><Input className="rounded-xl mt-1" value={f.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@lagos_vibes" /></div>
          <div>
            <Label className="text-xs">Media class</Label>
            <select className="w-full rounded-xl mt-1 bg-secondary border border-border px-3 h-9 text-sm" value={f.mediaClass} onChange={(e) => set("mediaClass", e.target.value)}>
              <option>Playlist Curator</option>
              <option>Content Creator / Influencer</option>
              <option>TikTok Creator</option>
              <option>Film Supervisor</option>
              <option>Apple/Spotify Curator</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Generates a printable Media Syndication Agreement granting a blanket Content ID waiver + 100% revenue retention + viral cash bonus. Send it to the curator alongside your music submission.</p>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="rounded-full" onClick={gen}><Printer className="w-4 h-4" /> Generate &amp; print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}