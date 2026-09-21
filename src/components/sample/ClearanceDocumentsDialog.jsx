import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { clearanceContractHtml, loiHtml, royaltyBreakdownHtml, dispatchEmailHtml } from "@/lib/sampleClearance";
import { Printer } from "lucide-react";

const printHtml = (html, title) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
};

const TABS = [
  { key: "contract", label: "Contract", fn: clearanceContractHtml },
  { key: "loi", label: "LOI Proposal", fn: loiHtml },
  { key: "royalty", label: "Royalty Split", fn: royaltyBreakdownHtml },
  { key: "dispatch", label: "Dispatch Email", fn: dispatchEmailHtml },
];

export default function ClearanceDocumentsDialog({ open, onOpenChange, request }) {
  const [tab, setTab] = React.useState("contract");
  React.useEffect(() => { if (open) setTab("contract"); }, [open]);
  if (!request) return null;
  const active = TABS.find((t) => t.key === tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clearance documents · {request.original_artist}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex gap-1 bg-transparent p-0 mb-3 flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: t.fn(request) }} />
            </TabsContent>
          ))}
        </Tabs>
        <Button className="rounded-full w-full" onClick={() => printHtml(active.fn(request), active.label)}>
          <Printer className="w-4 h-4" /> Print {active.label}
        </Button>
      </DialogContent>
    </Dialog>
  );
}