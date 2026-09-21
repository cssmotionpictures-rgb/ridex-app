import React from "react";
import { Wallet, TrendingUp, Coins } from "lucide-react";
import { loadCurveStats, fmtCrxs, CRXS_TOKEN, CURVE } from "@/lib/buyCurveClient";
import useCurveWallet from "@/hooks/useCurveWallet";
import BuyPanel from "@/components/buy/BuyPanel";
import SellPanel from "@/components/buy/SellPanel";
import CrxsLogo from "@/components/crxs/CrxsLogo";

// CRIXCOIN BUY PAGE — public (no login). Buy or sell CRXS directly with the
// owner-launched bonding curve on Base Mainnet. Every number shown is read LIVE
// from the curve contract; the user signs in their own wallet — this app never
// touches keys and holds no secrets.
export default function BuyCrxs() {
  const [stats, setStats] = React.useState(null);
  const [statsError, setStatsError] = React.useState("");
  const [tab, setTab] = React.useState("buy");
  const wallet = useCurveWallet();

  const loadStats = React.useCallback(async () => {
    try {
      setStats(await loadCurveStats());
      setStatsError("");
    } catch (e) {
      setStatsError("Could not read the live curve state from Base Mainnet — " + (e.message || e));
    }
  }, []);
  React.useEffect(() => { loadStats(); }, [loadStats]);

  const pct = stats && stats.threshold > 0n ? Math.min(100, Number(stats.eth) / Number(stats.threshold) * 100) : 0;

  return (
    <div className="app-bg-template min-h-screen">
      <main className="max-w-md mx-auto px-4 pt-6 pb-10">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <CrxsLogo size={36} />
          <p className="font-display font-extrabold text-2xl tracking-tight">
            <span className="gold-text">CRIX</span>COIN
          </p>
        </div>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#00e676]" />
          <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-primary">Live · Base Mainnet</span>
        </div>
        <h1 className="text-2xl font-bold mt-4 leading-snug">Buy CRIXCOIN from the official bonding curve</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          The price you see is read live from the curve contract on Base. You trade directly with the contract — self-custodial, no middleman, your CRXS lands straight in your wallet.
        </p>

        {/* Live market stats */}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live curve price</p>
            <p className="font-display font-bold text-sm mt-1">{stats && stats.price > 0n ? "1 ETH ≈ " + fmtCrxs(10n ** 36n / stats.price) : "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">ETH reserve (backs all sells)</p>
            <p className="font-display font-bold text-sm mt-1">{stats ? (Number(stats.eth) / 1e18).toFixed(4) + " ETH" : "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">CRXS still on the curve</p>
            <p className="font-display font-bold text-sm mt-1">{stats ? (Number(stats.tokens) / 1e27).toFixed(0) + "B" : "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3 col-span-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Graduation progress</p>
            <p className="font-display font-bold text-sm mt-1">{pct.toFixed(1)}% to DEX graduation</p>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: pct + "%" }} />
            </div>
          </div>
        </div>
        {statsError && (
          <p className="text-xs text-destructive mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">{statsError}</p>
        )}

        {/* Buy / Sell tabs */}
        <div className="grid grid-cols-2 gap-1.5 mt-5 rounded-xl border border-border bg-secondary/40 p-1.5">
          <button
            onClick={() => setTab("buy")}
            className={"rounded-lg py-2 text-sm font-display font-bold flex items-center justify-center gap-1.5 transition-colors " + (tab === "buy" ? "bg-primary text-primary-foreground shadow shadow-primary/30" : "text-muted-foreground")}
          >
            <TrendingUp className="w-4 h-4" /> Buy
          </button>
          <button
            onClick={() => setTab("sell")}
            className={"rounded-lg py-2 text-sm font-display font-bold flex items-center justify-center gap-1.5 transition-colors " + (tab === "sell" ? "bg-primary text-primary-foreground shadow shadow-primary/30" : "text-muted-foreground")}
          >
            <Coins className="w-4 h-4" /> Sell
          </button>
        </div>

        {tab === "buy"
          ? <BuyPanel stats={stats} wallet={wallet} onDone={loadStats} />
          : <SellPanel stats={stats} wallet={wallet} onDone={loadStats} />}

        {/* Contract links + honest footer */}
        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed break-all">
          Bonding curve <a className="text-primary" href={"https://basescan.org/address/" + CURVE} target="_blank" rel="noopener">0x593e…f9faa</a> · CRXS token <a className="text-primary" href={"https://basescan.org/token/" + CRXS_TOKEN} target="_blank" rel="noopener">0xb7a1…453f</a> · <a className="text-primary" href={"https://dexscreener.com/base?q=" + CRXS_TOKEN} target="_blank" rel="noopener">DexScreener</a> (aggregator listing appears at DEX graduation)
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-3 leading-relaxed">
          Quotes come live from the curve contract on Base Mainnet and include the 1% trading fee. Every trade is protected by a 2% minimum-out check, so a front-run can never overcharge you. CRIXCOIN is a utility token of the RIDE X platform — not an investment; do your own research and only spend what you can afford to lose.
        </p>
      </main>
    </div>
  );
}