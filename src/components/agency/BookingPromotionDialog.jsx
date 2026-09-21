import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/pricing";
import { Megaphone } from "lucide-react";

const TIER_BADGE = {
  basic: "bg-slate-400/10 text-slate-300 border-slate-300/25",
  premium: "bg-amber-400/15 text-amber-300 border-amber-300/30",
  ultimate: "bg-purple-500/15 text-purple-300 border-purple-400/30",
};

export default function BookingPromotionDialog({ artist, promotions, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Promotional packages · {artist?.stage_name || artist?.full_name || ""}</DialogTitle>
        </DialogHeader>
        {!promotions.length ? (
          <div className="text-center py-8 space-y-2">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No promotional packages for this artist yet.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {promotions.map((p) => (
              <div key={p.id} className="rounded-2xl bg-secondary p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{p.song_title || "Untitled release"}</p>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${TIER_BADGE[p.tier] || TIER_BADGE.basic}`}>{p.tier}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.features_included || "—"}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status: <span className="capitalize text-foreground">{p.status}</span></span>
                  {!!p.price && <span className="font-bold">{money(p.price)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}