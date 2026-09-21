import React from "react";
import CardFace from "@/components/card/CardFace";
import { money } from "@/lib/pricing";
import { Loader2, Snowflake, Sun } from "lucide-react";

/**
 * Compact card overview tile used on the virtual-cards dashboard:
 * live card face, balance and a one-tap freeze/unfreeze control.
 */
export default function CardTile({ card, selected, busy, onSelect, onToggleFreeze }) {
  const frozen = card.status === "frozen";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={`relative rounded-3xl p-3 border transition-all cursor-pointer card-lift ${
        selected ? "border-primary/70 bg-primary/5" : "border-border/60 bg-secondary/40"
      }`}
    >
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: "1.586" }}>
        <CardFace card={card} side="front" />
        {frozen && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-200 text-xs font-semibold">
              <Snowflake className="w-3 h-3" /> Frozen
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">•••• {card.card_last4}</p>
          <p className="font-bold text-lg leading-tight truncate">{money(card.balance || 0, card.currency || "NGN")}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFreeze(card);
          }}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${
            frozen
              ? "border-sky-400/40 text-sky-200 hover:bg-sky-400/10"
              : "border-border text-muted-foreground hover:text-primary hover:border-primary/50"
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : frozen ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Snowflake className="w-3.5 h-3.5" />
          )}
          {frozen ? "Unfreeze" : "Freeze"}
        </button>
      </div>
    </div>
  );
}