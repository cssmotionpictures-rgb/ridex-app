import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invoiceHtml, contractHtml, offerSheetHtml } from "@/lib/studioFeatures";
import { Printer } from "lucide-react";

const printHtml = (html, title) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
};

export default function StudioFeatureInvoiceDialog({ open, onOpenChange, booking }) {
  const [tab, setTab] = React.useState("invoice");
  React.useEffect(() => { if (open) setTab("invoice"); }, [open]);
  if (!booking) return null;
  const html = tab === "invoice" ? invoiceHtml(booking) : tab === "contract" ? contractHtml(booking) : offerSheetHtml(booking);
  const label = tab === "invoice" ? "Invoice" : tab === "contract" ? "Contract" : "Offer Sheet";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Studio feature documents · {booking.guest_artist_name}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex gap-1 bg-transparent p-0 mb-3">
            <TabsTrigger value="invoice" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Invoice</TabsTrigger>
          <TabsTrigger value="contract" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Contract</TabsTrigger>
          <TabsTrigger value="offer" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Offer Sheet</TabsTrigger>
          </TabsList>
          <TabsContent value="invoice"><div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: invoiceHtml(booking) }} /></TabsContent>
          <TabsContent value="contract"><div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: contractHtml(booking) }} /></TabsContent>
          <TabsContent value="offer"><div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: offerSheetHtml(booking) }} /></TabsContent>
        </Tabs>
        <Button className="rounded-full w-full" onClick={() => printHtml(html, label)}>
          <Printer className="w-4 h-4" /> Print {label}
        </Button>
      </DialogContent>
    </Dialog>
  );
}