import React from "react";
import { base44 } from "@/api/base44Client";
import { freezeAllVirtualCards } from "@/lib/virtualCards";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Snowflake } from "lucide-react";

// Instant Lock — one prominent emergency button on the main dashboard that
// freezes every active virtual card of the signed-in user in a single tap.
// Only appears for users who actually have cards.
export default function InstantLock() {
  const { toast } = useToast();
  const [cards, setCards] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    base44.entities.VirtualCard.list().then(setCards).catch(() => setCards([]));
  }, []);
  React.useEffect(load, [load]);

  if (cards === null || !cards.length) return null;

  const active = cards.filter((c) => c.status !== "frozen").length;
  const locked = active === 0;

  const lock = async () => {
    setBusy(true);
    try {
      const res = await freezeAllVirtualCards();
      toast({
        title: locked ? "Cards already locked" : "All cards locked",
        description: locked
          ? "Every card is frozen — nothing can be spent."
          : `${res.frozen} card${res.frozen === 1 ? "" : "s"} frozen instantly. Unfreeze anytime from Virtual cards.`,
      });
      load();
    } catch (e) {
      toast({ title: "Could not lock cards", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div
      className={`rounded-3xl border p-5 mb-8 flex items-center gap-4 ${
        locked ? "border-sky-500/30 bg-sky-500/5" : "border-destructive/50 bg-destructive/10"
      }`}
    >
      <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${locked ? "bg-sky-500/15" : "bg-destructive/15"}`}>
        {locked ? <Snowflake className="w-6 h-6 text-sky-300" /> : <ShieldAlert className="w-6 h-6 text-destructive" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold leading-tight">Instant Lock</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {locked
            ? "All your cards are frozen — nothing can be spent."
            : `See something unusual? Freeze all ${active} card${active === 1 ? "" : "s"} in one tap.`}
        </p>
      </div>
      <Button
        variant={locked ? "outline" : "destructive"}
        className="rounded-full px-6 shrink-0"
        disabled={busy || locked}
        onClick={lock}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
        {locked ? "Locked" : "Lock all"}
      </Button>
    </div>
  );
}