import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Wallet, Users, ArrowLeftRight, CheckCircle2, AlertTriangle, FileClock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

// INTERNAL-LEDGER ANALYTICS — every figure on this screen comes from the real
// internal Crix ledger (server-side aggregation). None of it is blockchain
// data: CRXS is PRE-LAUNCH and no blockchain exists.

export default function CrxsAnalytics() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [digest, setDigest] = React.useState(null);
  const [digestBusy, setDigestBusy] = React.useState(false);

  React.useEffect(() => {
    base44.functions.invoke("crxs-analytics", {})
      .then((r) => setData(r.data))
      .catch((e) => setErr(e?.response?.data?.error || e.message || "failed to load analytics"));
  }, []);

  const previewDigest = async () => {
    setDigestBusy(true); setDigest(null);
    try {
      const r = await base44.functions.invoke("crxs-weekly-digest", { dryRun: true });
      setDigest(r.data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "digest preview failed");
    }
    setDigestBusy(false);
  };

  const t = data?.totals || {};

  return (
    <div>
      <PageHeader
        eyebrow="CRXS CONTROL CENTER"
        title="Internal Ledger Analytics"
        subtitle="Real-time platform activity from the internal CrixCoin ledger. Every figure below is internal ledger data — not blockchain data, not token supply, not circulating supply."
      />

      <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-yellow-400">INTERNAL LEDGER DATA — NOT BLOCKCHAIN DATA.</span>{" "}
          CRXS is PRE-LAUNCH: no blockchain, contract, supply or market exists yet. These are custodial
          in-app balances and internal transfers only.
        </p>
      </div>

      {err && <p className="text-sm text-destructive mb-4">{err}</p>}

      {!data ? (
        <div className="grid grid-cols-2 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Stat icon={<Wallet className="w-4 h-4" />} label="Wallets" value={t.wallets ?? 0} />
            <Stat icon={<Users className="w-4 h-4" />} label="Users with wallets" value={t.walletUsers ?? 0} />
            <Stat icon={<ArrowLeftRight className="w-4 h-4" />} label="Active transfers" value={t.activeTransfers ?? 0} sub="REQUESTED → PROCESSING" />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Completed transfers" value={t.completedTransfers ?? 0} />
            <Stat icon={<FileClock className="w-4 h-4" />} label="Ledger credits" value={t.credits ?? 0} />
            <Stat icon={<FileClock className="w-4 h-4" />} label="Ledger debits" value={t.debits ?? 0} />
          </div>

          <section className="mb-6">
            <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Total internal ledger balances</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(data.balances || []).map((b) => (
                <div key={b.currency} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="font-semibold text-sm">{b.currency} <span className="text-[10px] text-muted-foreground">· {b.wallets} wallet{b.wallets === 1 ? "" : "s"}</span></p>
                  <p className="text-lg font-extrabold tabular-nums mt-1">{b.available.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">available</span></p>
                  <p className="text-[11px] text-muted-foreground">{b.reserved.toLocaleString()} reserved</p>
                </div>
              ))}
              {(!data.balances || data.balances.length === 0) && (
                <p className="text-xs text-muted-foreground">No wallets on the internal ledger yet.</p>
              )}
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Daily volume — completed transfers (14 days)</h2>
            <div className="rounded-2xl border border-border bg-card p-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.dailySeries || []}>
                  <XAxis dataKey="day" stroke="#8888" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8888" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#131318", border: "1px solid #2a2a33", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="completed" fill="hsl(42 96% 58%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {(t.truncatedTransactions || t.truncatedEntries) && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Note: live reads are capped per request ({t.truncatedTransactions ? "transactions" : "entries"} hit the cap) — figures cover the most recent records.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Weekly Gmail digest</h2>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Each user with activity gets a weekly email (their CrixCoin balance changes + new Mingle matches) through
                the connected Gmail account. Sends at most once per 7 days automatically when an admin opens the app.
              </p>
              <button onClick={previewDigest} disabled={digestBusy} className="mt-3 rounded-full border border-primary/50 bg-secondary px-4 py-2 text-xs font-semibold hover:border-primary disabled:opacity-50">
                {digestBusy ? "Previewing…" : "Preview digest (no emails sent)"}
              </button>
              {digest && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <p>Users with activity this week: <span className="text-foreground font-semibold">{digest.digestCount}</span> · inactive (skipped): {digest.inactive}</p>
                  {(digest.digests || []).map((d, i) => (
                    <p key={i} className="truncate">→ {d.email}: {d.txCount} transfer{d.txCount === 1 ? "" : "s"}, {d.matchCount} new match{d.matchCount === 1 ? "" : "es"}</p>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider">{icon} {label}</div>
      <p className="text-2xl font-extrabold mt-1.5 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}