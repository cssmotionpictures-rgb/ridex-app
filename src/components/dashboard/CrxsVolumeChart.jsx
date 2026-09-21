import React from "react";
import { base44 } from "@/api/base44Client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity } from "lucide-react";

// CRXS 30-DAY ON-CHAIN VOLUME — built ONLY from CrxsOnchainTransfer rows,
// which are written exclusively by the server-side indexer after it
// independently verified each real Transfer event against Base Sepolia.
// Nothing is fabricated: before the real deployment this stays honestly zero.
const DAY = 86400000;

function fmtAmount(rawString) {
  try {
    return Number(BigInt(String(rawString || "0")) / 10n ** 12n) / 1e6;
  } catch {
    return 0;
  }
}

export default function CrxsVolumeChart() {
  const [txs, setTxs] = React.useState(null);

  React.useEffect(() => {
    const load = () =>
      base44.entities.CrxsOnchainTransfer.list("-created_date", 300)
        .then(setTxs)
        .catch(() => setTxs([]));
    load();
    return base44.entities.CrxsOnchainTransfer.subscribe(load);
  }, []);

  const { days, totalCount, totalVolume } = React.useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const buckets = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY);
      buckets.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), volume: 0, count: 0 });
    }
    (txs || []).forEach((tx) => {
      const d = new Date(tx.created_date || tx.indexed_at);
      if (isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);
      const b = buckets.find((x) => x.t === d.getTime());
      if (b) { b.volume += fmtAmount(tx.amount_raw); b.count += 1; }
    });
    return {
      days: buckets,
      totalCount: buckets.reduce((s, b) => s + b.count, 0),
      totalVolume: buckets.reduce((s, b) => s + b.volume, 0),
    };
  }, [txs]);

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">CRXS activity — last 30 days</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Every transfer shown here is verified before it counts.</p>

      {txs === null ? (
        <p className="text-sm text-muted-foreground">Loading CRXS activity…</p>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm text-muted-foreground">
            No CRXS transfers yet — this chart fills with real activity as the CRIXCOIN network goes live.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verified transfers</p>
              <p className="text-xl font-extrabold tabular-nums">{totalCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume</p>
              <p className="text-xl font-extrabold tabular-nums gold-text">{totalVolume.toLocaleString(undefined, { maximumFractionDigits: 4 })} CRXS</p>
            </div>
          </div>
          <div className="h-44 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="crxsVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(42 96% 58%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(42 96% 58%)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} interval={6} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(240 6% 62%)" }} width={44} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(240 12% 8%)", border: "1px solid hsl(240 8% 17%)", borderRadius: 12, fontSize: 11 }}
                  formatter={(v, name) => [Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }) + (name === "volume" ? " CRXS" : ""), name === "volume" ? "Volume" : "Transfers"]}
                />
                <Area type="monotone" dataKey="volume" stroke="hsl(42 96% 58%)" strokeWidth={2} fill="url(#crxsVol)" />
                <Area type="monotone" dataKey="count" stroke="hsl(168 70% 45%)" strokeWidth={1.5} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}