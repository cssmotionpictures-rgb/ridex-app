import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import MoneySummaryCards from "@/components/crix/admin/MoneySummaryCards";
import DepositsTable from "@/components/crix/admin/DepositsTable";
import TransactionsTable from "@/components/crix/admin/TransactionsTable";
import OnchainTransfersPanel from "@/components/crix/admin/OnchainTransfersPanel";
import LedgerFeed from "@/components/crix/admin/LedgerFeed";

export default function CrixMoneyAdmin() {
  const [me, setMe] = React.useState(null);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => setMe(null));
  }, []);

  React.useEffect(() => {
    if (!me || me.role !== "admin") return;
    base44.functions
      .invoke("crix-admin-ledger", { action: "overview" })
      .then((res) => setData(res.data))
      .catch((e) => setError(String(e.message || e)));
  }, [me]);

  const isAdmin = me && me.role === "admin";

  return (
    <div>
      <PageHeader
        eyebrow="CRIX NETWORK · ADMIN ONLY"
        title={<span className="gold-text">Money Movement</span>}
        subtitle="Every Crix transaction and deposit across both rails — the internal double-entry ledger and on-chain CRXS transfers. Read-only: money only ever moves through the verified settlement engine."
      />

      {!isAdmin ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {me === null ? "Checking access…" : "This view is restricted to admin accounts."}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-sm text-destructive">{error}</div>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <MoneySummaryCards data={data} />
          <DepositsTable rows={data.deposits} />
          <TransactionsTable rows={data.transactions} />
          <OnchainTransfersPanel sepolia={data.onchain_sepolia} sponsored={data.onchain_sponsored} />
          <LedgerFeed entries={data.ledger_entries} note={data.window_note} />
        </div>
      )}
    </div>
  );
}