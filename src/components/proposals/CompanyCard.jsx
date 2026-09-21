import React from "react";
import { ExternalLink, Building2, CheckCircle2, Clock } from "lucide-react";

const STATUS_COLORS = {
  ready: "text-emerald-400",
  sent: "text-sky-300",
  awaiting: "text-amber-300",
  interested: "text-primary",
  declined: "text-red-400",
};

export default function CompanyCard({ company, status, onOpen }) {
  return (
    <button onClick={onOpen} className="text-left rounded-xl border border-border/60 bg-card p-3 card-lift h-full">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{company.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{company.sector}</p>
          <p className="text-[10px] text-muted-foreground/70 truncate">{company.country}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-primary inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Contact</span>
        {status && (
          <span className={`text-[10px] font-medium capitalize inline-flex items-center gap-1 ${STATUS_COLORS[status] || ""}`}>
            {status === "ready" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {status}
          </span>
        )}
      </div>
    </button>
  );
}