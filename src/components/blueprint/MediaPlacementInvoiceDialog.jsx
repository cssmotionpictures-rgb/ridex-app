import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, Receipt } from "lucide-react";
import { generateInvoiceHTML, printHtml } from "@/lib/zeroRejection";
import { useToast } from "@/components/ui/use-toast";
import { money } from "@/lib/pricing";

export default function MediaPlacementInvoiceDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [f, setF] = React.useState({ client: "", exec: "", project: "", baseRate: 500000 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const net = Number(f.baseRate) || 0;
  const agency = Math.round(net * 0.2);
  const gross = net + agency;

  const gen = () => {
    if (!f.client || !f.project) {
      toast({ title: "Fill client and project", variant: "destructive" });
      return;
    }
    const ok = printHtml(generateInvoiceHTML(f));
    if (!ok) toast({ title: "Allow pop-ups to print the invoice", variant: "destructive" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> Media Placement Invoice</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label className="text-xs">Client / investor name</Label><Input className="rounded-xl mt-1" value={f.client} onChange={(e) => set("client", e.target.value)} placeholder="Independent label or investor" /></div>
          <div><Label className="text-xs">Project executive</Label><Input className="rounded-xl mt-1" value={f.exec} onChange={(e) => set("exec", e.target.value)} placeholder="Attn" /></div>
          <div><Label className="text-xs">Project / song title</Label><Input className="rounded-xl mt-1" value={f.project} onChange={(e) => set("project", e.target.value)} placeholder="Target song for promotion" /></div>
          <div className="col-span-2"><Label className="text-xs">Intake screening &amp; clearance base (₦)</Label><Input className="rounded-xl mt-1" type="number" value={f.baseRate} onChange={(e) => set("baseRate", e.target.value)} /></div>
        </div>
        <div className="rounded-xl bg-secondary p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Intake (net)</span><span>{money(net)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">20% agency gross-up</span><span>{money(agency)}</span></div>
          <div className="flex justify-between font-bold border-t border-border/60 pt-1"><span>Escrow deposit due</span><span>{money(gross)}</span></div>
        </div>
        <p className="text-[11px] text-muted-foreground">Printable commercial invoice on the 20% gross-up model. Escrow funding is processed through the Media Hub.</p>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="rounded-full" onClick={gen}><Printer className="w-4 h-4" /> Generate &amp; print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}