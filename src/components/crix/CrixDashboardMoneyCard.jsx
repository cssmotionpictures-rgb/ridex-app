import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { invokeCrixFunction } from "@/lib/crix";
import { money } from "@/lib/pricing";
import CrixCoinCardVisual from "@/components/crix/CrixCoinCardVisual";
import { Coins, CreditCard, Loader2 } from "lucide-react";

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

const STATUS_LABEL = {
  paid: { label: "Paid", cls: "text-emerald-400" },
  created: { label: "Processing", cls: "text-amber-400" },
  unknown: { label: "Confirming", cls: "text-amber-400" },
  refunded: { label: "Refunded", cls: "text-sky-400" },
  failed: { label: "Failed", cls: "text-destructive" },
};

// The customer's CRIXCOIN money on the main dashboard — Naira wallet balance,
// their CRIXCOIN virtual dollar card (live details when the card service is
// reachable, saved record otherwise) and their most recent payments, in one
// clean view. Full history lives on the Payments page.
export default function CrixDashboardMoneyCard({ user }) {
  const [wallet, setWallet] = React.useState(undefined);
  const [cards, setCards] = React.useState(null);
  const [bills, setBills] = React.useState(null);

  React.useEffect(() => {
    if (!user?.id) return;
    const loadWallet = () => base44.entities.CrixWallet.filter({ user_id: user.id, currency: "NGN" })
      .then((w) => setWallet((w || [])[0] || null))
      .catch(() => setWallet(null));
    loadWallet();
    const unsub = base44.entities.CrixWallet.subscribe(loadWallet);
    base44.entities.CrixDollarCard.filter({ user_id: user.id }, "-created_date", 5)
      .then(setCards)
      .catch(() => setCards([]));
    base44.entities.CrixBillPayment.filter({ user_id: user.id }, "-created_date", 3)
      .then(setBills)
      .catch(() => setBills([]));
    // Live card details (balance, number, expiry) come from the card service
    // when it is reachable; the saved card record is the honest fallback.
    invokeCrixFunction("crix-dollar-card", { action: "list" })
      .then((d) => setCards((prev) => (d?.cards && d.cards.length ? d.cards : prev)))
      .catch(() => {});
    return unsub;
  }, [user?.id]);

  if (!user?.id) return null;
  const card = cards && cards.length ? cards[0] : null;
  const loading = cards === null || bills === null || wallet === undefined;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Coins className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Your CRIXCOIN money</h3>
        <Link to="/payments" className="ml-auto text-xs font-semibold text-primary">View all →</Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-secondary/50 border border-border p-4 flex flex-col justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Naira wallet balance</p>
              <p className="text-2xl font-extrabold mt-1">{ngn(wallet?.balance_crxs)}</p>
            </div>
            <Link to="/crix" className="mt-3 text-xs font-semibold text-primary">Fund wallet · Pay bills →</Link>
          </div>

          <div className="rounded-2xl bg-secondary/50 border border-border p-4">
            {card ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Dollar card</p>
                  <span className="text-xs font-semibold">{card.status === "active" || card.status === "issued" ? "Active" : card.status}</span>
                </div>
                <CrixCoinCardVisual
                  pan={card.masked_pan}
                  expiry={card.expiry}
                  cvv={card.cvv}
                  cardholder={card.cardholder_name || user?.full_name}
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Funded {money(card.funding_usd || 0, "USD")}
                </p>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-6">
                <CreditCard className="w-6 h-6 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold">CRIXCOIN dollar card</p>
                <p className="text-xs text-muted-foreground mt-0.5">Dollar cards are moving to crypto funding — new cards are paused. Manage existing cards here.</p>
                <Link to="/crix?tab=dollar-card" className="mt-3 text-xs font-semibold text-primary">View your dollar card →</Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent payments</p>
        </div>
        {!bills || !bills.length ? (
          <p className="text-sm text-muted-foreground">No payments yet — utility, data and betting payments will appear here.</p>
        ) : (
          <div className="space-y-2">
            {bills.map((b) => {
              const st = STATUS_LABEL[b.status] || { label: b.status, cls: "text-muted-foreground" };
              return (
                <Link key={b.id} to="/payments" className="flex items-center justify-between gap-2 rounded-xl bg-secondary/40 border border-border px-3 py-2.5 hover:border-primary/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{b.biller_name}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(b.created_date).toLocaleDateString("en-NG", { dateStyle: "medium" })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{ngn(b.amount_ngn)}</p>
                    <p className={"text-[11px] font-semibold " + st.cls}>{st.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}