import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { adminInvoiceHtml, registrationCertificateHtml, splitSheetHtml, ceaseDesistHtml } from "@/lib/copyrightProtection";
import { Printer } from "lucide-react";

const BUILDERS = {
  certificate: { fn: registrationCertificateHtml, label: "Registration Certificate" },
  invoice: { fn: adminInvoiceHtml, label: "Administration Invoice" },
  splitsheet: { fn: splitSheetHtml, label: "Split Sheet" },
  ceasedesist: { fn: ceaseDesistHtml, label: "Cease & Desist Notice" },
};

const printHtml = (html, title) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); }, 300);
};

export default function CopyrightDocsDialog({ open, onOpenChange, docType, record }) {
  if (!record) return null;
  const b = BUILDERS[docType] || BUILDERS.certificate;
  const html = b.fn(record);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{b.label}</DialogTitle></DialogHeader>
        <div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: html }} />
        <Button className="rounded-full w-full" onClick={() => printHtml(html, b.label)}><Printer className="w-4 h-4" /> Print {b.label}</Button>
      </DialogContent>
    </Dialog>
  );
}