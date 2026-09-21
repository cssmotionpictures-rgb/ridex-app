import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import IssueCardForm from "@/components/cards/IssueCardForm";
import VirtualCardPanel from "@/components/cards/VirtualCardPanel";
import CardTxHistory from "@/components/cards/CardTxHistory";
import CardTile from "@/components/cards/CardTile";
import { issueVirtualCard, setVirtualCardStatus, freezeAllVirtualCards, getSpendingSummary } from "@/lib/virtualCards";
import CardSpendingChart from "@/components/cards/CardSpendingChart";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShieldAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function VirtualCards() {
  const { toast } = useToast();
  const [me, setMe] = React.useState(null);
  const [wallet, setWallet] = React.useState(null);
  const [cards, setCards] = React.useState(null); // null = still loading
  const [selectedId, setSelectedId] = React.useState("");
  const [busyCardId, setBusyCardId] = React.useState("");
  const [freezeAllBusy, setFreezeAllBusy] = React.useState(false);
  const [formBusy, setFormBusy] = React.useState(false);
  const [formErr, setFormErr] = React.useState("");
  const [spendSummary, setSpendSummary] = React.useState(null);

  const load = React.useCallback(async (user) => {
    if (!user) return;
    const list = await base44.entities.VirtualCard.filter({ created_by_id: user.id }, "-created_date", 20);
    setCards(list);
    const wallets = await base44.entities.RideXCard.filter({ created_by_id: user.id }, "-created_date", 1);
    setWallet(wallets[0] || null);
  }, []);

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setMe(u);
      await load(u);
    }).catch(() => setCards([]));
  }, [load]);

  // Shared monthly spending summary — feeds the trend chart and the
  // per-card monthly limit progress bars.
  React.useEffect(() => {
    if (!cards || !cards.length) { setSpendSummary(null); return; }
    let alive = true;
    getSpendingSummary()
      .then((s) => alive && setSpendSummary(s))
      .catch(() => alive && setSpendSummary({ months: [], cards: [] }));
    return () => { alive = false; };
  }, [cards]);

  const issue = async (details) => {
    setFormErr("");
    setFormBusy(true);
    try {
      await issueVirtualCard(details);
      await load(me);
    } catch (e) {
      setFormErr(e.message);
    }
    setFormBusy(false);
  };

  const toggleFreeze = async (card) => {
    setBusyCardId(card.id);
    const wasFrozen = card.status === "frozen";
    try {
      await setVirtualCardStatus(card.id, wasFrozen ? "unfreeze" : "freeze");
      await load(me);
      toast({
        title: wasFrozen ? "Card unfrozen" : "Card frozen",
        description: wasFrozen
          ? "Your card can spend again."
          : "Spends on this card are blocked until you unfreeze it.",
      });
    } catch (e) {
      toast({ title: "Could not update the card", description: e.message, variant: "destructive" });
    }
    setBusyCardId("");
  };

  const freezeAll = async () => {
    setFreezeAllBusy(true);
    try {
      const res = await freezeAllVirtualCards();
      await load(me);
      toast({
        title: "All cards frozen",
        description: `${res.frozen} card${res.frozen === 1 ? "" : "s"} frozen — spends are blocked everywhere until you unfreeze.`,
      });
    } catch (e) {
      toast({ title: "Emergency freeze failed", description: e.message, variant: "destructive" });
    }
    setFreezeAllBusy(false);
  };

  if (cards === null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const selected = cards.find((c) => c.id === selectedId) || cards[0] || null;
  const totalCardBalance = cards.reduce((s, c) => s + (c.balance || 0), 0);
  const activeCount = cards.filter((c) => c.status !== "frozen").length;

  return (
    <div>
      <PageHeader
        eyebrow="Ride X Card"
        title="Virtual cards"
        subtitle="Your Ride X virtual cards — see every card at a glance, transfer from your wallet instantly, and freeze anytime."
      />

      {wallet && (
        <div className="glass rounded-2xl border border-border/60 px-5 py-4 mb-6 flex flex-wrap items-center gap-3 max-w-2xl">
          <Wallet className="w-5 h-5 text-primary" />
          <p className="text-sm">
            Ride X wallet balance: <span className="font-bold">{money(wallet.balance || 0, "NGN")}</span>
          </p>
          <Link to="/card" className="ml-auto text-xs text-primary underline">Top up wallet</Link>
        </div>
      )}

      {cards.length === 0 ? (
        <IssueCardForm defaultEmail={me?.email} defaultName={me?.full_name} busy={formBusy} error={formErr} onIssue={issue} />
      ) : (
        <>
          {/* Overview stats */}
          <div className="grid grid-cols-3 gap-3 mb-8 max-w-2xl">
            <div className="glass rounded-2xl border border-border/60 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">On cards</p>
              <p className="text-base md:text-lg font-extrabold gold-text truncate">{money(totalCardBalance, "NGN")}</p>
            </div>
            <div className="glass rounded-2xl border border-border/60 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Wallet</p>
              <p className="text-base md:text-lg font-extrabold truncate">{money(wallet?.balance || 0, "NGN")}</p>
            </div>
            <div className="glass rounded-2xl border border-border/60 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active</p>
              <p className="text-base md:text-lg font-extrabold">
                {activeCount} <span className="text-muted-foreground font-semibold">of {cards.length}</span>
              </p>
            </div>
          </div>

          {/* Card grid */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-heading font-bold text-lg">Your cards</h2>
            {activeCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="rounded-full" disabled={freezeAllBusy}>
                    {freezeAllBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                    Emergency freeze all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Freeze all your cards now?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every active Ride X Card will be blocked from spending instantly — in the app and everywhere
                      else online. You can unfreeze any card later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={freezeAll}>Freeze all cards</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-5 max-w-2xl">
            {cards.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                selected={selected?.id === c.id}
                busy={busyCardId === c.id}
                onSelect={() => setSelectedId(c.id)}
                onToggleFreeze={toggleFreeze}
              />
            ))}
          </div>

          {/* Monthly spending trend per card */}
          <CardSpendingChart summary={spendSummary} />

          {/* Selected card management */}
          {selected && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading font-bold text-lg">Manage •••• {selected.card_last4}</h2>
              </div>
              <VirtualCardPanel
                card={selected}
                wallet={wallet}
                spentThisMonth={
                  (spendSummary?.cards?.find((c) => c.id === selected.id)?.totals?.[
                    spendSummary?.months?.[spendSummary.months.length - 1] || ""
                  ] || 0)
                }
                onChanged={() => load(me)}
              />
              <CardTxHistory cardId={selected.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}