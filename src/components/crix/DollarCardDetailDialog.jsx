import React from "react";
import { invokeCrixFunction } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import CrixCoinCardVisual from "@/components/crix/CrixCoinCardVisual";
import { Loader2, Eye, EyeOff, RefreshCw, History } from "lucide-react";

// Full live card details — number, CVV, expiry and balance — fetched from the
// card network only for the verified owner, never stored anywhere.
export default function DollarCardDetailDialog({ card, user, onClose }) {
  const { toast } = useToast();
  const [detail, setDetail] = React.useState(null);
  const [reveal, setReveal] = React.useState(false);
  const [history, setHistory] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setBusy(true);
    invokeCrixFunction("crix-dollar-card", { action: "details", card_key: card.card_key })
      .then((d) => { setDetail(d.card); setBusy(false); })
      .catch((e) => { toast({ title: "Could not load card details", description: e.message, variant: "destructive" }); setBusy(false); });
  }, [card.card_key]);
  React.useEffect(load, [load]);

  const loadHistory = () => {
    if (history) return;
    invokeCrixFunction("crix-dollar-card", { action: "history", card_key: card.card_key })
      .then((d) => setHistory(d.transactions || []))
      .catch((e) => toast({ title: "Could not load card activity", description: e.message, variant: "destructive" }));
  };

  const usd = (v) => "$" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Card details</h3>
          <button onClick={load} className="text-muted-foreground min-h-[36px] p-1" aria-label="Refresh">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>

        {detail ? (
          <>
            <CrixCoinCardVisual
              pan={reveal && detail.card_number ? detail.card_number : detail.masked_pan || card.masked_pan}
              expiry={reveal ? detail.expiry : "••/••"}
              cvv={reveal ? detail.cvv : "•••"}
              cardholder={card.cardholder_name || user?.full_name}
            />
            <div className="rounded-2xl border border-border bg-secondary/50 p-4 mt-3 text-xs space-y-1.5">
              <p className="flex justify-between"><span className="text-muted-foreground">Card balance</span><span className="font-bold text-primary">{usd(detail.balance)}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Brand</span><span className="font-semibold capitalize">{detail.card_brand} · {detail.card_status || card.status}</span></p>
              {reveal ? (
                <>
                  <p className="flex justify-between"><span className="text-muted-foreground">Number</span><span className="font-mono font-semibold">{detail.card_number}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Expiry</span><span className="font-mono font-semibold">{detail.expiry}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">CVV</span><span className="font-mono font-semibold">{detail.cvv}</span></p>
                </>
              ) : null}
            </div>
            <button
              onClick={() => setReveal((r) => !r)}
              className="mt-3 w-full h-11 rounded-xl bg-secondary border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px]"
            >
              {reveal ? <><EyeOff className="w-4 h-4" /> Hide details</> : <><Eye className="w-4 h-4" /> Show full details</>}
            </button>

            <button onClick={loadHistory} className="mt-3 w-full text-xs font-semibold text-primary inline-flex items-center justify-center gap-1 min-h-[36px]">
              <History className="w-3.5 h-3.5" /> {history ? "Card activity" : "Load card activity"}
            </button>
            {history ? (
              <div className="mt-2 space-y-1.5">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">No card activity yet.</p>
                ) : history.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{t.narrative || t.method || "Card activity"}</p>
                      <p className="text-[10px] text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleString("en-NG") : ""} · {t.status}</p>
                    </div>
                    <p className={"text-xs font-bold shrink-0 " + (t.type === "credit" ? "text-emerald-400" : "")}>
                      {t.type === "credit" ? "+" : "−"}{usd(t.amount)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        )}

        <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[44px]">Close</button>
      </div>
    </div>
  );
}