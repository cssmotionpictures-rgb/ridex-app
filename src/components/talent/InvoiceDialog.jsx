import React from "react";
import { Button } from "@/components/ui/button";
import { invoiceData, invoiceHtml } from "@/lib/agencyInvoice";
import { money } from "@/lib/pricing";
import { Printer } from "lucide-react";

const Row = ({ label, v, bold }) => (
  <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
    <span className="text-muted-foreground">{label}</span><span>{v}</span>
  </div>
);

export default function InvoiceDialog({ booking, onClose }) {
  if (!booking) return null;
  const d = invoiceData(booking);
  const print = () => {
    const w = window.open("", "_blank");
    w.document.write(invoiceHtml(d));
    w.document.close(); w.print();
  };
  return (
    <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold">Escrow Invoice · {d.serial}</p>
            <p className="text-xs text-muted-foreground">Ride X Live Routing Desk</p>
          </div>
          <Button size="sm" className="rounded-full" onClick={print}><Printer className="w-4 h-4" /> Print</Button>
        </div>
        <div className="text-xs space-y-0.5 font-mono mb-3">
          <p>{d.artist} · {d.date}</p>
          <p className="text-muted-foreground">{d.project}</p>
          <p className="text-muted-foreground">Client: {d.promoter}</p>
        </div>
        <div className="space-y-1.5 text-sm">
          <Row label="Talent (net to artist)" v={money(d.net)} />
          <Row label="Agency surcharge (20% gross-up)" v={money(d.agency)} />
          <Row label="Logistics & advancement fee" v={money(d.logistics)} />
          <div className="border-t border-border/60 my-1" />
          <Row label="Total balance due" v={money(d.total)} bold />
          <div className="rounded-lg bg-primary/10 px-3 py-2 mt-1">
            <Row label="Mandatory 50% escrow deposit" v={money(d.deposit)} bold />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">Clearance via Zenith/GTB. Wire telemetry to routing desk to lock the date.</p>
        <Button variant="outline" className="w-full rounded-full mt-4" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}