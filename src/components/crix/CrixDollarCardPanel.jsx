import React from "react";
import { invokeCrixFunction } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import CrixCoinCardVisual from "@/components/crix/CrixCoinCardVisual";
import IssueDollarCardDialog from "@/components/crix/IssueDollarCardDialog";
import DollarCardDetailDialog from "@/components/crix/DollarCardDetailDialog";
import DollarCardTopUpDialog from "@/components/crix/DollarCardTopUpDialog";
import CrixDollarCardSummary from "@/components/crix/CrixDollarCardSummary";
import { CreditCard, Loader2, Plus, Snowflake, Sun, Eye } from "lucide-react";

const usd = (v) => "$" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const STATUS_BADGE = {
  issued: { label: "Issued", cls: "bg-primary/15 text-primary" },
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-400" },
  created: { label: "Processing", cls: "bg-amber-500/15 text-amber-400" },
  unknown: { label: "Confirming", cls: "bg-amber-500/15 text-amber-400" },
  frozen: { label: "Frozen", cls: "bg-sky-500/15 text-sky-400" },
  refunded: { label: "Refunded", cls: "bg-slate-500/15 text-slate-400" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
};

// CRIXCOIN DOLLAR CARDS — the customer's virtual Visa dollar cards on the
// Strowallet card network. Every action runs on the secured server function;
// the panel shows the provider's honest live availability (fail-closed).
export default function CrixDollarCardPanel({ user, onChanged }) {
  const { toast } = useToast();
  const [net, setNet] = React.useState(undefined);
  const [cards, setCards] = React.useState(null);
  const [kyc, setKyc] = React.useState(null);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [detailCard, setDetailCard] = React.useState(null);
  const [topUpCard, setTopUpCard] = React.useState(null);
  const [freezeBusy, setFreezeBusy] = React.useState("");

  const load = React.useCallback(() => {
    invokeCrixFunction("crix-dollar-card", { action: "network" }).then(setNet).catch(() => setNet(null));
    invokeCrixFunction("crix-dollar-card", { action: "list" })
      .then((d) => setCards(d.cards || []))
      .catch(() => setCards([]));
    invokeCrixFunction("crix-dollar-card", { action: "kyc_status" }).then(setKyc).catch(() => setKyc(null));
  }, []);
  React.useEffect(load, [load]);

  const toggleFreeze = async (card) => {
    const freezing = card.status !== "frozen";
    setFreezeBusy(card.card_key);
    try {
      await invokeCrixFunction("crix-dollar-card", {
        action: "status", card_key: card.card_key, status: freezing ? "frozen" : "active",
      });
      toast({ title: freezing ? "Card frozen" : "Card unfrozen", description: freezing ? "New payments on this card are blocked." : "Your card can spend again." });
      load();
    } catch (e) {
      toast({ title: "Could not update the card", description: e.message, variant: "destructive" });
    }
    setFreezeBusy("");
  };

  if (net === undefined || cards === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (net === null || (!net.reachable && !net.paused)) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold">Dollar cards are not available right now</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          The card network did not answer — nothing was charged. Your wallet and every other CRIXCOIN service keep working. Please try again shortly.
        </p>
      </div>
    );
  }

  const railPaused = !!(net && net.paused);

  return (
    <div className="space-y-4">
      {railPaused ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-semibold text-primary">New dollar cards are paused</p>
          <p className="text-muted-foreground mt-0.5">
            {net.reason || "We no longer convert Naira into USD cards — we are moving to a crypto-funded dollar card provider."}
            {" "}Your existing cards below keep working.
          </p>
        </div>
      ) : null}
      {kyc && kyc.kyc_status === "pending" ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-300">Your identity review is in progress</p>
          <p className="text-muted-foreground mt-0.5">The card network is reviewing your identity — your dollar card unlocks the moment it is approved.</p>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-6 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-xl font-extrabold">Crypto-funded dollar cards are coming</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {railPaused
              ? "We are moving dollar cards to a crypto-funded provider — Naira is no longer converted into USD cards. We will announce here the moment new cards are live."
              : "A virtual Visa card that pays from your Naira wallet at the live rate — perfect for online shopping and global subscriptions. One-time identity review, then it is yours in minutes."}
          </p>
          {!railPaused ? (
            <button
              onClick={() => setIssueOpen(true)}
              className="mt-5 h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[44px]"
            >
              Get your dollar card
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <CrixDollarCardSummary cards={cards} />
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Your dollar cards</h3>
            {!railPaused ? (
              <button onClick={() => setIssueOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary min-h-[36px]">
                <Plus className="w-3.5 h-3.5" /> New card
              </button>
            ) : null}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {cards.map((card) => {
              const badge = STATUS_BADGE[card.status] || { label: card.status, cls: "bg-secondary text-muted-foreground" };
              const actionable = card.provider_card_id && ["issued", "active", "frozen"].includes(card.status);
              return (
                <div key={card.card_key} className="rounded-3xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Visa · USD</p>
                    <span className={"text-[11px] font-bold px-2.5 py-1 rounded-full " + badge.cls}>{badge.label}</span>
                  </div>
                  <CrixCoinCardVisual pan={card.masked_pan} cardholder={card.cardholder_name || user?.full_name} />
                  <p className="text-xs text-muted-foreground text-center">Funded {usd(card.funding_usd)} · charged ₦{Number(card.total_debit_ngn || 0).toLocaleString()}</p>
                  {actionable ? (
                    <div className={railPaused ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
                      <button onClick={() => setDetailCard(card)} className="h-10 rounded-xl bg-secondary border border-border text-xs font-semibold inline-flex items-center justify-center gap-1 min-h-[40px]">
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                      {!railPaused ? <button onClick={() => setTopUpCard(card)} className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold min-h-[40px]">Top up</button> : null}
                      <button
                        onClick={() => toggleFreeze(card)}
                        disabled={freezeBusy === card.card_key}
                        className="h-10 rounded-xl bg-secondary border border-border text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50 min-h-[40px]"
                      >
                        {freezeBusy === card.card_key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : card.status === "frozen" ? <><Sun className="w-3.5 h-3.5" /> Unfreeze</> : <><Snowflake className="w-3.5 h-3.5" /> Freeze</>}
                      </button>
                    </div>
                  ) : null}
                  {card.status === "unknown" ? (
                    <p className="text-[11px] text-amber-400 text-center">Being confirmed with the card network — do not submit the same purchase again.</p>
                  ) : null}
                  {card.status === "refunded" || card.status === "failed" ? (
                    <p className="text-[11px] text-muted-foreground text-center">This purchase did not go through — your wallet was not charged.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {issueOpen ? (
        <IssueDollarCardDialog
          user={user}
          kycStatus={kyc ? kyc.kyc_status : "unknown"}
          onClose={() => setIssueOpen(false)}
          onChanged={() => { load(); onChanged && onChanged(); }}
        />
      ) : null}
      {detailCard ? (
        <DollarCardDetailDialog card={detailCard} user={user} onClose={() => setDetailCard(null)} />
      ) : null}
      {topUpCard ? (
        <DollarCardTopUpDialog card={topUpCard} onClose={() => setTopUpCard(null)} onChanged={() => { load(); onChanged && onChanged(); }} />
      ) : null}
    </div>
  );
}