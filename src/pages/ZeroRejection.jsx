import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Receipt, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { BLUEPRINT_RESOURCES } from "@/lib/zeroRejection";
import ZeroRejectionAgreementDialog from "@/components/blueprint/ZeroRejectionAgreementDialog";
import MediaPlacementInvoiceDialog from "@/components/blueprint/MediaPlacementInvoiceDialog";

export default function ZeroRejection() {
  const [agreement, setAgreement] = React.useState(false);
  const [invoice, setInvoice] = React.useState(false);

  return (
    <div>
      <PageHeader
        eyebrow="Mutual IP Partnership"
        title="Zero-Rejection Curator & Influencer Blueprint"
        subtitle="Pitch curators and creators a Mutual IP Exploitation Partnership — a blanket Content ID waiver, 100% revenue retention and viral cash bonuses — so they feature your music for free without asking for favors."
      />

      {/* Strategy pillars */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {[
          { icon: ShieldCheck, t: "Content ID Waiver", d: "Permanently whitelist the curator's handles in YouTube Content ID & Meta Rights Manager — zero copyright strikes, mutes or DMCA takedowns." },
          { icon: Zap, t: "100% Revenue Retention", d: "The partner keeps every kobo of ad-revenue on videos using your track. No upfront fee demanded — pure upside for them." },
          { icon: Sparkles, t: "Viral Cash Bonus", d: "A ₦500,000 performance bonus (20% gross-up) when their placement drives 500K+ uses or 100K+ streams, plus a 5% co-broker cut on sync deals." },
        ].map((p) => (
          <div key={p.t} className="rounded-2xl border border-border/60 bg-card p-5">
            <p.icon className="w-7 h-7 text-primary mb-2" />
            <p className="font-semibold">{p.t}</p>
            <p className="text-xs text-muted-foreground mt-1">{p.d}</p>
          </div>
        ))}
      </div>

      {/* Document toolkit */}
      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 flex flex-col">
          <FileText className="w-7 h-7 text-primary mb-2" />
          <p className="font-semibold">Zero-Rejection Agreement</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Generate the Exclusive Audio Rights Clearance & Viral Syndication Mandate to send alongside your submission. Locks down a 100% acceptance rate by legally clearing the curator of copyright risk.</p>
          <Button className="rounded-full mt-auto w-full" onClick={() => setAgreement(true)}>Generate agreement</Button>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col">
          <Receipt className="w-7 h-7 text-primary mb-2" />
          <p className="font-semibold">Media Placement Invoice</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Commercial invoice on the 20% agency gross-up model for labels/investors funding a placement campaign. Escrow deposit is processed through the Media Hub.</p>
          <Button className="rounded-full mt-auto w-full" variant="outline" onClick={() => setInvoice(true)}>Generate invoice</Button>
        </div>
      </div>

      {/* Native automation note */}
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5 mb-10 flex flex-wrap items-center gap-4">
        <Zap className="w-6 h-6 text-accent shrink-0" />
        <p className="text-sm flex-1 min-w-[220px]">
          Automated outreach to your curator &amp; influencer roster runs <span className="font-semibold text-accent">natively inside RIDE X</span> via Auto-Promote — no external scrapers or SMTP blasters. Every submission is tracked, receipted and monetized in-platform.
        </p>
        <Link to="/auto-promote"><Button className="rounded-full">Open Auto-Promote</Button></Link>
      </div>

      {/* Resource directory */}
      <h2 className="text-lg font-bold mb-1">Direct Regulatory, Placement & Curation Platforms</h2>
      <p className="text-xs text-muted-foreground mb-5">Submit metadata and verify rights clearance through these official industry channels so your pitches are legally recognized and cleared for monetization.</p>
      <div className="space-y-6">
        {BLUEPRINT_RESOURCES.map((grp) => (
          <div key={grp.section}>
            <p className="text-xs uppercase tracking-[0.18em] text-primary mb-2">{grp.section}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {grp.items.map((it) => (
                <a key={it.url} href={it.url} target="_blank" rel="noreferrer" className="rounded-xl border border-border/60 bg-card p-3 flex gap-3 hover:border-primary/40 transition-colors group">
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{it.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{it.note}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ZeroRejectionAgreementDialog open={agreement} onOpenChange={setAgreement} />
      <MediaPlacementInvoiceDialog open={invoice} onOpenChange={setInvoice} />
    </div>
  );
}