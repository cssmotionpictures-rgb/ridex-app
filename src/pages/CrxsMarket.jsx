import React from "react";
import {
  CRXS, WETH, baseRpc, readPoolState, dexscreenerSearch, geckoSearch,
  encodeTotalSupply, liveCurvePriceWei,
} from "@/lib/aerodromeMarket";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Activity, Droplets, Layers, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import CrxsLogo from "@/components/crxs/CrxsLogo";

// PUBLIC CRXS MARKET PAGE — every statistic comes from real on-chain market
// data (DEX Screener API / live pool reserves), never fabricated. Before a
// pool exists the page says exactly that: preparation, not live.
export default function CrxsMarket() {
  const [pair, setPair] = React.useState(null);
  const [record, setRecord] = React.useState(null);
  const [pool, setPool] = React.useState(null);
  const [supply, setSupply] = React.useState(null);
  const [curvePrice, setCurvePrice] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [geckoUrl, setGeckoUrl] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const ds = await dexscreenerSearch();
        const hit = (ds.pairs || []).find((p) => (p.dex || "") === "aerodrome" && (p.quote || "").toLowerCase() === WETH.toLowerCase() && (p.base || "").toLowerCase() === CRXS.toLowerCase()) || (ds.pairs || [])[0] || null;
        setPair(hit);
        try {
          const gt = await geckoSearch();
          if (gt.found) setGeckoUrl("https://www.geckoterminal.com/base/pools/" + ((gt.pools[0] || {}).address || ""));
        } catch (e) { /* indexer optional */ }
        try {
          const rows = await base44.entities.CrxsDexMarketRecord.filter({ registry_key: "crxs-dex-market" });
          setRecord((rows || [])[0] || null);
        } catch (e) { /* public fallback: indexer + on-chain data only */ }
        const poolAddress = (record && record.pool_address) || (pair && pair.pairAddress);
        if (poolAddress) setPool(await readPoolState(poolAddress));
        const sup = await baseRpc("eth_call", [{ to: CRXS, data: encodeTotalSupply() }, "latest"]);
        if (sup && sup !== "0x") setSupply(Number(BigInt(sup) / 10n ** 18n).toLocaleString());
        const cp = await liveCurvePriceWei();
        if (cp > 0n) setCurvePrice(cp);
      } catch (e) { /* page still renders honest preparation state */ }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  const live = !!(pair && (pair.pairAddress || pool));
  const poolAddress = (record && record.pool_address) || (pair && pair.pairAddress) || "";
  const crxsRes = pool ? (pool.token0 === CRXS.toLowerCase() ? pool.reserve0 : pool.reserve1) : 0n;
  const wethRes = pool ? (pool.token0 === CRXS.toLowerCase() ? pool.reserve1 : pool.reserve0) : 0n;
  const poolPriceEth = crxsRes > 0n ? Number(wethRes) / Number(crxsRes) : null;

  return (
    <div className="app-bg-template min-h-screen">
      <main className="max-w-md mx-auto px-4 pt-6 pb-10">
        <div className="flex items-center gap-2.5">
          <CrxsLogo size={36} />
          <p className="font-display font-extrabold text-2xl tracking-tight"><span className="gold-text">CRIX</span>COIN</p>
        </div>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1">
          <span className={"w-1.5 h-1.5 rounded-full " + (live ? "bg-emerald-400 shadow-[0_0_8px_#00e676]" : "bg-yellow-400")} />
          <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-primary">{live ? "Live · Aerodrome · Base Mainnet" : "Market preparation"}</span>
        </div>
        <h1 className="text-2xl font-bold mt-4 leading-snug">CRXS market</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {live
            ? "Genuine on-chain market data for the CRXS/WETH volatile pool on Aerodrome. Read live from the pool and independent indexers — never simulated."
            : "The official Aerodrome CRXS/WETH pool is being prepared. Until a real pool with real liquidity and a real first transaction exists on Base, this page honestly reports preparation — not a live market."}
        </p>

        {loading && <p className="text-xs text-muted-foreground mt-6">Reading live Base market data…</p>}

        {/* On-chain market statistics — real data only */}
        {live ? (
          <div className="grid grid-cols-2 gap-2 mt-5">
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">DEX price</p>
              <p className="font-display font-bold text-sm mt-1">{pair && pair.priceUsd ? "$" + Number(pair.priceUsd).toLocaleString(undefined, { maximumSignificantDigits: 4 }) : poolPriceEth ? poolPriceEth.toExponential(3) + " ETH" : "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pool liquidity (USD)</p>
              <p className="font-display font-bold text-sm mt-1">{pair && pair.liquidityUsd ? "$" + Number(pair.liquidityUsd).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">24h volume</p>
              <p className="font-display font-bold text-sm mt-1">{pair && pair.volume24h ? "$" + Number(pair.volume24h).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">24h transactions</p>
              <p className="font-display font-bold text-sm mt-1">{pair && pair.txns24h != null ? pair.txns24h : "—"}</p>
            </div>
            {pool && (
              <div className="rounded-xl border border-border bg-card/60 p-3 col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live pool reserves (read from Base)</p>
                <p className="font-display font-bold text-xs mt-1">{(Number(crxsRes) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} CRXS · {(Number(wethRes) / 1e18).toFixed(6)} WETH</p>
              </div>
            )}
            {curvePrice && curvePrice > 0n && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Official bonding curve — token issuance</p>
                <p className="font-display font-bold text-xs mt-1">1 ETH ≈ {Number(10n ** 18n / curvePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })} CRXS</p>
                <Link className="text-primary text-[11px]" to="/buy">Buy from the curve →</Link>
              </div>
            )}
          </div>
        ) : !loading && (
          <div className="rounded-xl border border-border bg-card/60 p-4 mt-5">
            <p className="text-xs text-muted-foreground leading-relaxed">No CRXS pool is reported on Aerodrome yet. Listing is automatic and free once a liquidity pool exists and has at least one real transaction — no listing agent, no paid service, no fake volume.</p>
            {curvePrice && (
              <p className="text-[11px] text-muted-foreground mt-2">Meanwhile, the official bonding curve is live: 1 ETH ≈ {(Number(10n ** 36n / curvePrice) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })}B CRXS. <Link className="text-primary" to="/buy">Buy CRXS from the curve</Link>.</p>
            )}
          </div>
        )}

        {/* Contract + pool addresses */}
        <div className="rounded-xl border border-border bg-card/60 p-4 mt-4 text-xs space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Token</p>
          <a className="text-primary break-all" href={"https://basescan.org/token/" + CRXS} target="_blank" rel="noopener">CRXS · {CRXS} <ExternalLink className="w-3 h-3 inline" /></a>
          {supply && <p className="text-muted-foreground">Total supply (read live from the contract): {supply} CRXS</p>}
          {poolAddress && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">Aerodrome volatile pool</p>
              <a className="text-primary break-all" href={"https://basescan.org/address/" + poolAddress} target="_blank" rel="noopener">{poolAddress} <ExternalLink className="w-3 h-3 inline" /></a>
            </>
          )}
        </div>

        {/* Market status ladder — separate honest states, never premature */}
        {record && (
          <div className="rounded-xl border border-border bg-card/60 p-4 mt-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Launch status</p>
            <div className="mt-2 space-y-1 text-xs">
              {[
                ["Pool created on Base", !!record.pool_address],
                ["Initial liquidity verified", record.status !== "PREPARATION" && !!record.pool_address],
                ["First real market swap confirmed", !!record.first_swap_tx],
                ["DEX Screener indexed", !!record.dexscreener_indexed],
                ["GeckoTerminal indexed", !!record.geckoterminal_indexed],
              ].map(([label, done], i) => (
                <p key={i} className={done ? "text-emerald-400" : "text-muted-foreground"}>{done ? "✓" : "○"} {label}</p>
              ))}
            </div>
          </div>
        )}

        {/* Links — only to real, known destinations */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <a href={record && record.dexscreener_url ? record.dexscreener_url : "https://dexscreener.com/base/" + (poolAddress || CRXS)} target="_blank" rel="noopener" className="rounded-xl border border-border bg-card/60 p-3 text-xs font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> DEX Screener <ArrowUpRight className="w-3 h-3 ml-auto text-muted-foreground" /></a>
          <a href={geckoUrl || (record && record.geckoterminal_url) || "https://www.geckoterminal.com/?base=" + CRXS} target="_blank" rel="noopener" className="rounded-xl border border-border bg-card/60 p-3 text-xs font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> GeckoTerminal <ArrowUpRight className="w-3 h-3 ml-auto text-muted-foreground" /></a>
          <a href={"https://basescan.org/token/" + CRXS} target="_blank" rel="noopener" className="rounded-xl border border-border bg-card/60 p-3 text-xs font-semibold flex items-center gap-2"><ExternalLink className="w-4 h-4 text-primary" /> BaseScan <ArrowUpRight className="w-3 h-3 ml-auto text-muted-foreground" /></a>
          <a href={poolAddress ? "https://aerodrome.finance/swap?token0=" + CRXS + "&token1=" + WETH : "https://aerodrome.finance/"} target="_blank" rel="noopener" className="rounded-xl border border-border bg-card/60 p-3 text-xs font-semibold flex items-center gap-2"><Droplets className="w-4 h-4 text-primary" /> Trade on Aerodrome <ArrowUpRight className="w-3 h-3 ml-auto text-muted-foreground" /></a>
        </div>

        <p className="text-[10px] text-muted-foreground/70 mt-4 leading-relaxed">
          All market statistics on this page are on-chain market data from the Aerodrome pool and independent indexers. Internal CRIXCOIN balances are tracked separately by the platform's own ledger and are never derived from pool reserves or DEX prices. CRIXCOIN is a utility token — not an investment; do your own research and only spend what you can afford to lose.
        </p>
      </main>
    </div>
  );
}