import React from "react";
import { invokeCrixFunction } from "@/lib/crix";
import { Bitcoin, Eye, RefreshCw, WifiOff } from "lucide-react";

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG");
const prettyMarket = (m) => m.toUpperCase().replace(/NGN$/, "/NGN");

// Quidax crypto on-ramp — READ-ONLY panel. Live market rates only; buying is
// honestly disabled until Quidax sandbox testing and key permission checks pass.
export default function QuidaxOnrampPanel() {
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setBusy(true);
    try {
      const d = await invokeCrixFunction("quidax-onramp", { action: "markets" });
      setData(d);
    } catch (e) {
      setData({ reachable: false, feed_error: String(e.message || e) });
    }
    setBusy(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Bitcoin className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Crypto On-Ramp</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Bridge your Naira to crypto (BTC, ETH, USDT) — powered by Quidax. Settlement goes through your CRIXCOIN Naira wallet.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/60 border border-border px-3 py-2.5">
          <Eye className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            Read-only mode: you can watch live rates now. Buying unlocks after Quidax sandbox verification and key permission checks finish.
          </p>
        </div>
      </div>

      {busy && !data ? (
        <div className="h-24 rounded-2xl border border-border bg-card animate-pulse" />
      ) : data && data.reachable && (data.markets || []).length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Live rates</h4>
            <button onClick={load} disabled={busy} className="inline-flex items-center gap-1 text-xs text-muted-foreground disabled:opacity-50">
              <RefreshCw className={"w-3.5 h-3.5" + (busy ? " animate-spin" : "")} /> Refresh
            </button>
          </div>
          <div className="space-y-1.5">
            {data.markets.map((m) => (
              <div key={m.market} className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-xs">
                <span className="font-semibold">{prettyMarket(m.market)}</span>
                <span className="font-bold text-primary">{ngn(m.last)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">Rates read live from the Quidax market feed — not typed, not cached.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-card p-5 text-center">
          <WifiOff className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-semibold">Rates temporarily unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.feed_error || data?.reason || "The market feed did not answer."}
          </p>
          <button onClick={load} disabled={busy} className="mt-3 h-10 px-4 rounded-xl bg-secondary border border-border text-xs font-semibold disabled:opacity-50">
            {busy ? "Checking…" : "Try again"}
          </button>
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card p-5 opacity-70">
        <h4 className="text-sm font-semibold">Naira → Crypto</h4>
        <p className="text-[11px] text-muted-foreground mt-1 mb-3">Choose an amount from your wallet once buying unlocks.</p>
        <div className="flex gap-2">
          <input disabled placeholder="e.g. 5000" className="flex h-11 w-full rounded-xl bg-secondary border border-border px-3 text-sm opacity-60" />
          <button disabled className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold opacity-50 cursor-not-allowed">
            Buy
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Buying is disabled until Quidax sandbox testing passes — this protects your money.</p>
      </div>
    </div>
  );
}