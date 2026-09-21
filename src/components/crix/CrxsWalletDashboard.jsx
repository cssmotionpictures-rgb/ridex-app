import React from "react";
import { base44 } from "@/api/base44Client";
import { Wallet, Loader2, ArrowDownRight, ArrowUpRight } from "lucide-react";

// CRIXCOIN overview for the user: balance and recent transfers only.
// Operational and chain detail lives on the admin screens, never here.
export default function CrxsWalletDashboard({ userId }) {
  const [wallet, setWallet] = React.useState(null);
  const [txs, setTxs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!userId) { setLoading(false); return; }
      try {
        const ws = await base44.entities.CrixWallet.filter({ user_id: userId, currency: "CRX" });
        if (alive) setWallet(ws[0] || null);
        const all = await base44.entities.CrixTransaction.list("-created_date", 30);
        if (alive) setTxs(all.filter((t) => t.type === "crix_to_crix").slice(0, 8));
      } catch {
        /* keep last state */
      }
      if (alive) setLoading(false);
    };
    load();
    const unsub = base44.entities.CrixWallet.subscribe(() => { if (alive) load(); });
    return () => { alive = false; unsub(); };
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const balance = wallet?.available || 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider"><Wallet className="w-4 h-4" /> Your CRIXCOIN balance</div>
        <p className="text-2xl font-extrabold mt-2 gold-text tabular-nums">{balance.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">CRX</span></p>
      </div>

      <div>
        <h2 className="font-heading font-bold text-lg mb-3">Recent transfers</h2>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CRIXCOIN transfers yet.</p>
        ) : (
          <div className="space-y-2">
            {txs.map((t) => {
              const incoming = t.recipient_id === userId;
              const Icon = incoming ? ArrowDownRight : ArrowUpRight;
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${incoming ? "text-emerald-400" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{t.type.replace(/_/g, " ")}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{new Date(t.created_date).toLocaleString()} · {t.crix_id}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`font-bold tabular-nums ${incoming ? "text-emerald-400" : "text-foreground"}`}>{incoming ? "+" : "−"}{t.amount}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{t.status.toLowerCase()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}