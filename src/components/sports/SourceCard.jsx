import React from "react";
import { ExternalLink } from "lucide-react";

export default function SourceCard({ source }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-border/60 bg-card p-4 card-lift">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: source.color }}>{source.emoji}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{source.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{source.note}</p>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      <p className="text-xs text-muted-foreground">{source.covers}</p>
    </a>
  );
}