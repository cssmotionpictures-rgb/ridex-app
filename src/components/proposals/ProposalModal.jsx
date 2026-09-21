import React from "react";
import { generateProposal } from "@/lib/companyDirectory";
import { X, Copy, ExternalLink, CheckCircle2, Send, Clock, ThumbsUp, Ban, Sparkles } from "lucide-react";

const STATUSES = [
  { k: "ready", l: "Ready", icon: CheckCircle2 },
  { k: "sent", l: "Sent", icon: Send },
  { k: "awaiting", l: "Awaiting", icon: Clock },
  { k: "interested", l: "Interested", icon: ThumbsUp },
  { k: "declined", l: "Declined", icon: Ban },
];

export default function ProposalModal({ company, sender, status, onStatus, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const proposal = React.useMemo(() => generateProposal(company, sender), [company, sender]);

  const copy = () => {
    navigator.clipboard.writeText(proposal)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[700] bg-black/85 flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl border border-border/60" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card/95 backdrop-blur flex items-center justify-between px-4 py-3 border-b border-border/60 z-10">
          <div className="min-w-0">
            <p className="font-semibold truncate">{company.name}</p>
            <p className="text-xs text-muted-foreground truncate">{company.sector} · {company.country}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400 mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Auto-generated proposal tailored to {company.sector}
          </div>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 bg-secondary/40 rounded-xl p-3 border border-border/40 font-mono">{proposal}</pre>
          <div className="flex flex-wrap gap-2 mt-3">
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              <ExternalLink className="w-3.5 h-3.5" /> Open contact page & send
            </a>
            <button onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary text-xs font-medium">
              <Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy proposal"}
            </button>
          </div>
          <div className="mt-4">
            <p className="text-[11px] text-muted-foreground mb-1.5">Track this submission (internal status)</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const Icon = s.icon;
                const active = status === s.k;
                return (
                  <button key={s.k} onClick={() => onStatus(s.k)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border/60"}`}>
                    <Icon className="w-3 h-3" /> {s.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}