import React from "react";
import { ExternalLink, Landmark, Music2, CalendarDays, FileText, Building2 } from "lucide-react";

const PORTALS = [
  { icon: Landmark, label: "NCC eRegistration", href: "http://eregistration.copyright.gov.ng/", desc: "Deposit masters & split sheets for a federal ownership certificate." },
  { icon: Music2, label: "MCSN Terminal", href: "https://www.mcsnnigeria.org/", desc: "Register mechanical & performance splits to collect royalties across West Africa." },
  { icon: CalendarDays, label: "Flytime Fest Arena Grid", href: "https://flytimefest.com/", desc: "Audit festival rosters & live venue royalty distribution." },
  { icon: FileText, label: "Escrow Framework (Scribd)", href: "https://www.scribd.com/document/696349968/Artist-Venue-Promoter-Offer-Sheet-Basic", desc: "Baseline three-way booking & financial guarantee template." },
  { icon: FileText, label: "Venue-Promoter Liability (Scribd)", href: "https://www.scribd.com/document/438570379/promoter-and-venue-contract", desc: "Standard indemnity & property protection parameters." },
  { icon: Building2, label: "Corporate Event Planners Matrix (Scribd)", href: "https://www.scribd.com/document/788832097/Event-Planners-in-Nigeria", desc: "Top corporate agencies buying sync licenses for ads." },
];

export default function RegulatoryPortals({ compact }) {
  return (
    <div className={`rounded-2xl border border-border/60 bg-card p-4 ${compact ? "" : "md:p-5"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Regulatory &amp; legal portals</p>
      <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-2`}>
        {PORTALS.map((p) => (
          <a key={p.label} href={p.href} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 rounded-xl bg-secondary/40 p-3 hover:bg-secondary transition-colors">
            <p.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1">{p.label}<ExternalLink className="w-3 h-3 text-muted-foreground" /></p>
              <p className="text-[11px] text-muted-foreground leading-snug">{p.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}