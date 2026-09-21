import React from "react";
import { base44 } from "@/api/base44Client";
import { readCurveState, formatEth, rawToBillion, formatPrice } from "@/lib/crxsCurve";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2 } from "lucide-react";

// LIVE CRXS MARKET CARD — reads the real bonding-curve state (price, reserves,
// graduation) straight from Base Mainnet once the owner has deployed and
// funded the curve. Shows nothing until a real curve exists — the price is
// never simulated.
export default function CurveMarketCard() {
  const [record, setRecord] = React.useState(null);
  const [live, setLive] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const load = () => {
      base44.entities.CrixLaunchCurveRecord.filter({ registry_key: "crxs-curve-deployment" })
        .then((r) => setRecord(r[0] || null))
        .catch(() => {});
    };
    load();
    return base44.entities.CrixLaunchCurveRecord.subscribe(load);
  }, []);

  const curveAddress = record?.curve_address || "";
  const funded = ["FUNDED", "GRADUATED", "MIGRATED"].includes(record?.status);

  const refresh = React.useCallback(async () => {
    if (!curveAddress) return;
    try {
      setError("");
      setLive(await readCurveState(curveAddress));
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  }, [curveAddress]);

  React.useEffect(() => {
    refresh();
  }, [refresh, record?.status]);

  // No real curve yet → render nothing (honest empty state, no fake prices).
  if (!record || !curveAddress) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">CRXS market</p>
        <TrendingUp className="w-4 h-4 text-primary" />
      </div>
      {!funded ? (
        <p className="text-xs text-muted-foreground mt-2">Bonding curve deployed — the owner is funding it with CRXS. Live pricing appears the moment trading opens.</p>
      ) : live && !error ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Live curve price</p>
              <p className="text-xl font-bold font-mono">{formatPrice(live.priceEthPerCrxs)} <span className="text-xs text-muted-foreground">ETH / CRXS</span></p>
            </div>
            <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">ETH reserve</p><p className="font-bold font-mono">{formatEth(live.ethReserveWei)}</p></div>
            <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">CRXS on sale</p><p className="font-bold font-mono">{rawToBillion(live.tokenReserveRaw)}B</p></div>
          </div>
          {live.graduated && (
            <p className="text-[11px] text-yellow-400">The curve has graduated — trading has moved to the DEX pool.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Prices come live from the CRIXCOIN bonding curve on Base Mainnet — the real curve contract is the only price source.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading live market state…</p>
      )}
      {error && <p className="text-[11px] text-destructive mt-2">{error}</p>}
    </div>
  );
}