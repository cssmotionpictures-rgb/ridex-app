import React from "react";
import { base44 } from "@/api/base44Client";
import PaymentsHistory from "@/components/crix/PaymentsHistory";
import ActivityList from "@/components/crix/ActivityList";
import { Wallet, Zap, History, TrendingUp } from "lucide-react";

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export default function PaymentsDashboard({ user }) {
  const [wallet, setWallet] = React.useState(null);
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    if (!user?.id) return;
    const loadWallet = () => base44.entities.CrixWallet.filter({ user_id: user.id, currency: "NGN" })
      .then((w) => setWallet((w || [])[0] || null)).catch(() => setWallet(null));
    const loadStats = () => base44.entities.CrixBillPayment.filter({ user_id: user.id })
      .then((rows) => {
        const bills = rows || [];
        setStats({
          total: bills.length,
          paid: bills.filter((b) => b.status === "paid").length,
          pending: bills.filter((b) => b.status === "created" || b.status === "unknown").length,
          refunded: bills.filter((b) => b.status === "refunded").length,
          volumeNgn: bills.filter((b) => b.status === "paid").reduce((s, b) => s + (Number(b.amount_ngn) || 0), 0),
        });
      }).catch(() => setStats(null));
    loadWallet();
    loadStats();
    const u1 = base44.entities.CrixWallet.subscribe(loadWallet);
    const u2 = base44.entities.CrixBillPayment.subscribe(loadStats);
    return () => { u1(); u2(); };
  }, [user?.id]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Wallet balance</p>
          <p className="text-xl font-bold text-primary mt-1.5">{wallet ? ngn(wallet.balance_crxs) : "—"}</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Bills paid</p>
          <p className="text-xl font-bold mt-1.5">{stats ? stats.paid : "—"}</p>
          {stats ? <p className="text-[11px] text-muted-foreground mt-0.5">{ngn(stats.volumeNgn)} total</p> : null}
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Confirming</p>
          <p className="text-xl font-bold mt-1.5">{stats ? stats.pending : "—"}</p>
          {stats && stats.pending > 0 ? <p className="text-[11px] text-amber-400 mt-0.5">Being confirmed with the biller</p> : null}
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Refunded</p>
          <p className="text-xl font-bold mt-1.5">{stats ? stats.refunded : "—"}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <h3 className="font-semibold mb-3">Payment history</h3>
        <PaymentsHistory user={user} />
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <h3 className="font-semibold mb-3">CRIXCOIN transactions</h3>
        <ActivityList myId={user?.id} />
      </div>
    </div>
  );
}