import React from "react";
import { base44 } from "@/api/base44Client";
import { connectMetaMask, walletRequest, ensureBaseMainnet, restoreSession } from "@/lib/metamaskConnect";
import {
  CRXS, WETH, AERODROME_ROUTER, AERODROME_FACTORY, CRXS_LAUNCH_WALLET, CHAIN_ID_HEX,
  MAX_OPERATION_BUDGET_WEI, ETH_RESERVE_GUARD_WEI, INITIAL_LIQUIDITY_ETH_WEI, MICRO_SWAP_CRXS_RAW,
  canSpend, baseRpc, estimateTxCost, encodeApprove, encodeAddLiquidityETH, encodeSwapExactTokensForTokens,
  encodeGetPool, encodeAllowance, encodeBalanceOf, readPoolState, quoteVolatileOut,
  dexscreenerSearch, geckoSearch, liveCurvePriceWei, matchCrxsForEth,
} from "@/lib/aerodromeMarket";
import { fmtCrxs } from "@/lib/buyCurveClient";
import { Coins, Droplets, Repeat, SearchCheck, ShieldCheck, Loader2, ExternalLink, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const fmtEth = (w) => (Number(BigInt(w || 0)) / 1e18).toFixed(6);
const crxsCount = (raw) => Number(BigInt(raw || 0) / 10n ** 18n).toLocaleString();

// OWNER-SIGNED AERODROME MARKET LAUNCH — fail-closed. The app builds, estimates
// and budget-guards every transaction; the owner signs each one in MetaMask.
// No key material ever touches this app. Once a pool exists it is never created again.
export default function CrxsDexLaunchPanel() {
  const [record, setRecord] = React.useState(null);
  const [account, setAccount] = React.useState("");
  const [preflight, setPreflight] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [pendingTx, setPendingTx] = React.useState(null);
  const [pendingSign, setPendingSign] = React.useState(null);
  const [committed, setCommitted] = React.useState(0n);
  const [poolState, setPoolState] = React.useState(null);
  const [indexers, setIndexers] = React.useState({ ds: null, gt: null, note: "Not checked yet." });
  const errRef = React.useRef(null);
  const committedRef = React.useRef(0n);

  React.useEffect(() => {
    if (error && errRef.current) errRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const setCommittedBoth = (v) => { committedRef.current = v; setCommitted(v); };

  async function saveRecord(patch, step, extra) {
    if (!record) return;
    let arr = [];
    try { arr = JSON.parse(record.evidence_json || "[]"); } catch (e) { /* fresh */ }
    arr.push(Object.assign({ step, at: new Date().toISOString() }, extra || {}));
    const updated = await base44.entities.CrxsDexMarketRecord.update(record.id, Object.assign({}, patch, { evidence_json: JSON.stringify(arr) }));
    setRecord(updated);
  }

  React.useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.CrxsDexMarketRecord.filter({ registry_key: "crxs-dex-market" });
        let rec = (rows || [])[0];
        if (!rec) rec = await base44.entities.CrxsDexMarketRecord.create({ registry_key: "crxs-dex-market", status: "PREPARATION", notes: "Preflight only — nothing signed yet." });
        setRecord(rec);
        setCommittedBoth(BigInt(rec.eth_spent_committed_wei || "0"));
      } catch (e) {
        setError("Could not load the market launch record: " + (e.message || e));
      }
    })();
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await restoreSession();
        if (s && s.account) setAccount(s.account);
      } catch (e) { /* user taps Connect */ }
    })();
  }, []);

  const runPreflight = React.useCallback(async (acc) => {
    setBusy("preflight"); setError("");
    const checks = [];
    const push = (label, pass, detail) => checks.push({ label, pass, detail: String(detail || "") });
    try {
      const chainId = String(await walletRequest("eth_chainId")).toLowerCase();
      push("Wallet on Base Mainnet (8453)", chainId === CHAIN_ID_HEX, chainId);
      const rightWallet = acc.toLowerCase() === CRXS_LAUNCH_WALLET.toLowerCase();
      push("Signer is the CRXS launch wallet", rightWallet, acc);
      let paused = false;
      try {
        const rows = await base44.entities.CrixEmergencyPause.filter({ registry_key: "crix-emergency-pause" });
        const p = (rows || [])[0];
        paused = !!(p && (p.pause_all || p.pause_base));
      } catch (e) { /* no pause row — nothing paused */ }
      push("Emergency pause respected", !paused, paused ? "PAUSE_BASE is ON — launch blocked" : "no pause active");
      const routerCode = await baseRpc("eth_getCode", [AERODROME_ROUTER, "latest"]);
      push("Aerodrome router code verified", (routerCode || "0x").length > 2, AERODROME_ROUTER);
      const factoryCode = await baseRpc("eth_getCode", [AERODROME_FACTORY, "latest"]);
      push("Aerodrome factory code verified", (factoryCode || "0x").length > 2, AERODROME_FACTORY);
      const crxsCode = await baseRpc("eth_getCode", [CRXS, "latest"]);
      push("CRXS contract code verified", (crxsCode || "0x").length > 2, CRXS);
      const poolRes = await baseRpc("eth_call", [{ to: AERODROME_FACTORY, data: encodeGetPool(CRXS, WETH, false) }, "latest"]);
      const poolAddr = poolRes && poolRes !== "0x" && !/^0x0{40}$/.test("0x" + poolRes.slice(-40)) ? "0x" + poolRes.slice(-40) : null;
      push("No second pool — on-chain search", !poolAddr || !!(record && record.pool_address), poolAddr || "no CRXS/WETH pool exists yet");
      const ethBal = BigInt((await baseRpc("eth_getBalance", [acc, "latest"])) || "0");
      const crxsRaw = BigInt((await baseRpc("eth_call", [{ to: CRXS, data: encodeBalanceOf(acc) }, "latest"])) || "0");
      const priceWei = await liveCurvePriceWei();
      const liqCrxs = priceWei > 0n ? matchCrxsForEth(INITIAL_LIQUIDITY_ETH_WEI, priceWei) : 0n;
      push("Wallet ETH supports the plan", ethBal >= ETH_RESERVE_GUARD_WEI, fmtEth(ethBal) + " ETH");
      push("CRXS covers liquidity + micro-swap", crxsRaw >= liqCrxs + MICRO_SWAP_CRXS_RAW, crxsCount(crxsRaw) + " CRXS available");
      const alw = BigInt((await baseRpc("eth_call", [{ to: CRXS, data: encodeAllowance(acc, AERODROME_ROUTER) }, "latest"])) || "0");
      const gasPrice = BigInt((await baseRpc("eth_gasPrice", [])) || "0");
      const worstGas = (3000000n * gasPrice * 130n) / 100n;
      // Once the pool exists, the only remaining spend is the micro-swap's gas
      // (~280k gas, 400k budgeted with margin) — the liquidity deposit is
      // already on-chain and reflected in the live balance, never projected again.
      const plannedSpend = poolAddr ? (400000n * gasPrice * 130n) / 100n : INITIAL_LIQUIDITY_ETH_WEI + worstGas;
      push("Projected total ≤ 0.000110 ETH budget", committedRef.current + plannedSpend <= MAX_OPERATION_BUDGET_WEI, fmtEth(committedRef.current + plannedSpend) + " ETH projected");
      push("Projected remainder ≥ 0.000200 ETH reserve", ethBal - plannedSpend >= ETH_RESERVE_GUARD_WEI, fmtEth(ethBal - plannedSpend) + " ETH would remain");
      const ds = await dexscreenerSearch();
      push("DEX Screener: no existing CRXS pool", !ds.found, ds.note || "0 pools");
      const gt = await geckoSearch();
      push("GeckoTerminal: no existing CRXS pool", !gt.found, gt.note || "0 pools");
      setPreflight({ checks, ethBal, crxsRaw, priceWei, liqCrxs, allowanceRaw: alw, existingPool: poolAddr, rightWallet, paused, chainOk: chainId === CHAIN_ID_HEX });
      if (poolAddr) setPoolState(await readPoolState(poolAddr));
    } catch (e) {
      setError("Preflight failed: " + (e.message || e));
    } finally { setBusy(""); }
    // eslint-disable-next-line
  }, [record]);

  React.useEffect(() => {
    if (account && preflight === null) runPreflight(account);
    // eslint-disable-next-line
  }, [account]);

  const connect = async () => {
    setError(""); setBusy("connect");
    try {
      const s = await connectMetaMask();
      await ensureBaseMainnet();
      setAccount(s.account);
      await runPreflight(s.account);
    } catch (e) { setError((e && e.message) || String(e)); }
    finally { setBusy(""); }
  };

  // Sign + wait + verify. NEVER resends — a lost receipt means reconcile, not repeat.
  // MetaMask can throw a transport timeout AFTER the transaction is already on
  // Base — a send error is therefore never reported as failure until the intended
  // on-chain effect has been checked and ruled out (verifyEffect per stage).
  async function signAndWait(tx, label, verifyEffect) {
    const cid = String(await walletRequest("eth_chainId")).toLowerCase();
    if (cid !== CHAIN_ID_HEX) throw new Error("Wallet is not on Base Mainnet — nothing was sent.");
    let hash = "";
    try {
      hash = await walletRequest("eth_sendTransaction", [{ from: account, to: tx.to, value: "0x" + (tx.value || 0n).toString(16), data: tx.data }]);
    } catch (sendErr) {
      // Not a failure yet — MetaMask may already have broadcast it.
    }
    setPendingTx({ label, hash });
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (hash) {
        const rc = await baseRpc("eth_getTransactionReceipt", [hash]);
        if (rc) {
          setPendingTx(null);
          if ((rc.status || "0x0") !== "0x1") throw new Error(label + " REVERTED on Base — tx " + hash + ". Nothing else was sent. Resolve on BaseScan before continuing.");
          const cost = BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice || "0") + BigInt(tx.value || 0n);
          setCommittedBoth(committedRef.current + cost);
          try { await saveRecord({ eth_spent_committed_wei: String(committedRef.current) }, "receipt_" + label, { hash, gasUsed: rc.gasUsed, costWei: String(cost) }); } catch (e) { /* evidence only */ }
          return { hash, blockNumber: parseInt(rc.blockNumber || "0", 16), cost };
        }
      }
      if (verifyEffect && (await verifyEffect())) {
        // The transaction landed on Base, but its hash/receipt was lost to a
        // transport timeout. The stage is genuinely complete — record it and
        // NEVER offer it for signing again.
        setPendingTx(null);
        return { hash: "", blockNumber: 0, cost: 0n, effectVerified: true };
      }
    }
    setPendingTx(null);
    throw new Error(label + " — confirmation could not be read from Base. DO NOT sign this stage again. Re-run the pre-flight: a stage that actually completed is detected automatically from the live chain state (allowance / pool existence) and is never offered twice.");
  }

  // Build + estimate + budget-guard. Shows the full pre-sign checklist; the
  // owner confirms explicitly. A failed guard blocks the sign button entirely.
  async function prepareTx(stage, tx) {
    setError(""); setPendingSign(null);
    try {
      const est = await estimateTxCost(account, tx.to, tx.data, tx.value || 0n);
      const balance = BigInt((await baseRpc("eth_getBalance", [account, "latest"])) || "0");
      const projected = committedRef.current + est.totalWei;
      // The live balance already reflects every committed (spent) stage — only
      // the NEW transaction's cost is held back for the reserve check, so
      // completed stages are never double-counted against the wallet.
      const ok = canSpend(projected, est.totalWei, balance);
      setPendingSign({
        stage, tx, est, ok,
        checklist: [
          ["Chain", "Base Mainnet (8453)"],
          ["Contract", tx.to],
          ["Function", stage.fn],
          ["Value", fmtEth(tx.value || 0n) + " ETH"],
          ["Gas limit", String(est.gas) + " (live estimate)"],
          ["Max fee", fmtEth(est.maxGasWei) + " ETH (live gas + 30% margin)"],
          ["Total max cost", fmtEth(est.totalWei) + " ETH"],
          ["Projected total spend", fmtEth(projected) + " ETH — budget 0.000110"],
          ["Projected remainder", fmtEth(balance - est.totalWei) + " ETH — reserve 0.000200"],
        ],
      });
      if (!ok) setError("ETH SAFETY LIMIT — TRANSACTION BLOCKED. The projected total exceeds the 0.000110 ETH budget or would drop the wallet below the 0.000200 ETH reserve. Nothing was signed.");
    } catch (e) { setError("Estimate failed — nothing was signed (fail closed): " + (e.message || e)); }
  }

  async function confirmSign() {
    const ps = pendingSign; setPendingSign(null); setBusy("sign");
    try {
      if (ps.stage.key === "approve") {
        const approveAmount = BigInt("0x" + ps.tx.data.slice(74, 138));
        const rc = await signAndWait(ps.tx, "CRXS approval", async () => {
          const a = BigInt((await baseRpc("eth_call", [{ to: CRXS, data: encodeAllowance(account, AERODROME_ROUTER) }, "latest"])) || "0");
          return a >= approveAmount;
        });
        await saveRecord(rc.hash ? { approve_tx: rc.hash } : {}, "approve_confirmed", { hash: rc.hash || "transport timeout — approval verified on-chain from the live allowance", spender: AERODROME_ROUTER });
      } else if (ps.stage.key === "liquidity") {
        const rc = await signAndWait(ps.tx, "Add liquidity (creates the pool)", async () => {
          const poolRes = await baseRpc("eth_call", [{ to: AERODROME_FACTORY, data: encodeGetPool(CRXS, WETH, false) }, "latest"]);
          return !!(poolRes && poolRes !== "0x" && !/^0x0{40}$/.test("0x" + poolRes.slice(-40)));
        });
        const poolRes = await baseRpc("eth_call", [{ to: AERODROME_FACTORY, data: encodeGetPool(CRXS, WETH, false) }, "latest"]);
        const poolAddr = poolRes && poolRes !== "0x" && !/^0x0{40}$/.test("0x" + poolRes.slice(-40)) ? "0x" + poolRes.slice(-40) : null;
        if (!poolAddr) throw new Error("Liquidity confirmed but the factory reports no pool — reconcile on BaseScan (tx " + rc.hash + ") before continuing. Fail closed.");
        const st = await readPoolState(poolAddr);
        setPoolState(st);
        await saveRecord({
          liquidity_tx: rc.hash, pool_address: poolAddr, pool_block_number: rc.blockNumber,
          router_address: AERODROME_ROUTER, factory_address: AERODROME_FACTORY, quote_address: WETH,
          liquidity_eth_wei: String(INITIAL_LIQUIDITY_ETH_WEI),
          liquidity_crxs_raw: String(ps.tx.amountTokenDesired),
          status: "LIQUIDITY_ADDED", launched_at: new Date().toISOString(), last_verified_at: new Date().toISOString(),
        }, "liquidity_confirmed", { hash: rc.hash, pool: poolAddr, token0: st.token0, reserve0: String(st.reserve0), reserve1: String(st.reserve1) });
      } else if (ps.stage.key === "swap") {
        const rc = await signAndWait(ps.tx, "First genuine micro-swap");
        const st = await readPoolState(record.pool_address);
        setPoolState(st);
        await saveRecord({
          first_swap_tx: rc.hash, first_swap_block_number: rc.blockNumber,
          swap_crxs_raw: String(MICRO_SWAP_CRXS_RAW),
          status: "MARKET_ACTIVE", last_verified_at: new Date().toISOString(),
        }, "swap_confirmed", { hash: rc.hash, reserve0_after: String(st.reserve0), reserve1_after: String(st.reserve1) });
        setTimeout(() => checkIndexers(), 10000);
      }
      await runPreflight(account);
    } catch (e) { setError((e && e.message) || String(e)); }
    finally { setBusy(""); }
  }

  async function checkIndexers() {
    const pool = (record && record.pool_address) || (preflight && preflight.existingPool);
    if (!pool) { setIndexers({ ds: null, gt: null, note: "No pool yet." }); return { dsHit: null, gtHit: null }; }
    const ds = await dexscreenerSearch();
    const dsHit = (ds.pairs || []).find((p) => String(p.pairAddress || "").toLowerCase() === pool.toLowerCase()) || null;
    const gt = await geckoSearch();
    const gtHit = (gt.pools || []).find((p) => String(p.address || "").toLowerCase() === pool.toLowerCase()) || null;
    setIndexers({ ds: dsHit, gt: gtHit, note: dsHit && gtHit ? "Both indexers report the pool." : (dsHit || gtHit ? "One indexer reports the pool — the other has not yet." : "Neither indexer reports the pool yet — indexing is independent and automatic; do not spend more to force it.") });
    const patch = {};
    if (dsHit && record && !record.dexscreener_indexed) { patch.dexscreener_indexed = true; patch.dexscreener_url = dsHit.url; }
    if (gtHit && record && !record.geckoterminal_indexed) { patch.geckoterminal_indexed = true; patch.geckoterminal_url = "https://www.geckoterminal.com/base/pools/" + pool; }
    if (Object.keys(patch).length && record) {
      patch.status = dsHit && gtHit ? "GECKOTERMINAL_INDEXED" : dsHit ? "DEXSCREENER_INDEXED" : record.status;
      patch.aerodrome_url = "https://aerodrome.finance/";
      try { await saveRecord(patch, "indexer_verified", { ds: !!dsHit, gt: !!gtHit, pool }); } catch (e) { /* evidence only */ }
    }
    return { dsHit, gtHit };
  }

  async function runIndexerPolling() {
    setBusy("indexers");
    try {
      for (const secs of [10, 30, 60, 120, 300]) {
        await new Promise((r) => setTimeout(r, secs * 1000));
        const hits = await checkIndexers();
        if (hits.dsHit && hits.gtHit) break;
      }
    } finally { setBusy(""); }
  }

  const poolCreated = !!(record && record.pool_address) || !!(preflight && preflight.existingPool);
  // Once the pool exists, the only CRXS the router still needs is the micro-swap
  // amount — the liquidity side is already spent, so the live allowance is
  // compared against exactly that, never against the full launch amount again.
  const approveNeeded = poolCreated ? MICRO_SWAP_CRXS_RAW : (preflight ? (preflight.liqCrxs || 0n) + MICRO_SWAP_CRXS_RAW : 0n);
  const approveDone = !!(record && record.approve_tx) || !!(preflight && preflight.allowanceRaw >= approveNeeded);
  const liquidityDone = !!(record && record.liquidity_tx);
  const swapDone = !!(record && record.first_swap_tx);
  const deadline = () => Math.floor(Date.now() / 1000) + 1200;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary">CRXS · Aerodrome market launch</p>
          <h1 className="text-xl font-bold">DEX market launch <span className="gold-text">control</span></h1>
        </div>
        <span className="text-[10px] rounded-full border border-border px-2.5 py-1 text-muted-foreground">Owner-signed · fail-closed</span>
      </div>

      {/* Hard money guard — always visible, never overridable */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-primary font-display font-bold text-sm"><ShieldCheck className="w-4 h-4" /> Hard ETH spending guard</div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-lg bg-card/70 p-2"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Max total ops</p><p className="font-bold text-sm">0.000110 ETH</p></div>
          <div className="rounded-lg bg-card/70 p-2"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Protected reserve</p><p className="font-bold text-sm">0.000200 ETH</p></div>
          <div className="rounded-lg bg-card/70 p-2"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Committed so far</p><p className="font-bold text-sm">{fmtEth(committed)} ETH</p></div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Every transaction is estimated live before signing and blocked automatically if the projection would exceed the budget or touch the reserve. This cannot be overridden from the UI.</p>
      </div>

      {error && (
        <div ref={errRef} className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {!account ? (
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold">Connect the CRXS launch wallet to begin</p>
          <p className="text-xs text-muted-foreground mt-1">Signing happens in MetaMask — this app never holds keys. Launch wallet: {CRXS_LAUNCH_WALLET.slice(0, 10)}…{CRXS_LAUNCH_WALLET.slice(-6)}</p>
          <button onClick={connect} disabled={busy === "connect"} className="mt-3 w-full rounded-lg bg-primary text-primary-foreground font-display font-bold py-2.5 text-sm disabled:opacity-50">
            {busy === "connect" ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</span> : "Connect MetaMask"}
          </button>
        </div>
      ) : (
        <>
          {/* Preflight */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <p className="font-display font-bold text-sm">Pre-flight checks</p>
              <button onClick={() => runPreflight(account)} disabled={busy === "preflight"} className="text-[11px] text-primary flex items-center gap-1 disabled:opacity-50">
                {busy === "preflight" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-run"}
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              {(!preflight ? [{ label: "Running live on-chain checks…", pass: null, detail: "" }] : preflight.checks).map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {c.pass === null ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary mt-0.5 shrink-0" /> : c.pass ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
                  <span className={c.pass === false ? "text-destructive" : ""}>{c.label}{c.detail ? <span className="text-muted-foreground"> — {c.detail}</span> : null}</span>
                </div>
              ))}
            </div>
          </div>

          {pendingTx && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
              <p className="font-semibold text-primary flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {pendingTx.label} — waiting for Base confirmation…</p>
              {pendingTx.hash ? (
                <a href={"https://basescan.org/tx/" + pendingTx.hash} target="_blank" rel="noopener" className="text-primary break-all mt-1 inline-flex items-center gap-1">View on BaseScan <ExternalLink className="w-3 h-3" /></a>
              ) : (
                <a href={"https://basescan.org/address/" + account} target="_blank" rel="noopener" className="text-primary break-all mt-1 inline-flex items-center gap-1">Track the wallet on BaseScan <ExternalLink className="w-3 h-3" /></a>
              )}
            </div>
          )}

          {pendingSign && (
            <div className="rounded-xl border border-primary/50 bg-card p-4">
              <p className="font-display font-bold text-sm">Review before signing — {pendingSign.stage.title}</p>
              <div className="mt-2 rounded-lg bg-secondary/60 p-3 space-y-1">
                {pendingSign.checklist.map(([k, v], i) => (
                  <div key={i} className="flex justify-between gap-3 text-[11px]"><span className="text-muted-foreground">{k}</span><span className="font-semibold text-right break-all">{v}</span></div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => setPendingSign(null)} className="rounded-lg border border-border py-2 text-xs font-semibold">Cancel</button>
                <button onClick={confirmSign} disabled={!pendingSign.ok || !!busy} className="rounded-lg bg-primary text-primary-foreground font-display font-bold py-2 text-xs disabled:opacity-40">
                  {pendingSign.ok ? "Sign in MetaMask" : "Blocked by safety limit"}
                </button>
              </div>
            </div>
          )}

          {/* Stage 1 — approve */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="font-display font-bold text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> 1 · Approve CRXS to the Aerodrome router</p>
            {approveDone ? (
              <p className="text-xs text-emerald-400 mt-2">Done — the router can spend the liquidity + micro-swap CRXS.</p>
            ) : poolCreated ? (
              <p className="text-xs text-emerald-400 mt-2">Pool already exists — approval only needed for the micro-swap.</p>
            ) : null}
            {!approveDone && preflight && (
              <>
                <p className="text-xs text-muted-foreground mt-2">One approval covers both the {crxsCount(preflight.liqCrxs)} CRXS liquidity side and the 100,000 CRXS micro-swap.</p>
                <button
                  onClick={() => prepareTx({ key: "approve", title: "CRXS approval", fn: poolCreated ? "approve(router, micro-swap CRXS)" : "approve(router, liquidity + swap CRXS)" }, { to: CRXS, data: encodeApprove(AERODROME_ROUTER, poolCreated ? MICRO_SWAP_CRXS_RAW : preflight.liqCrxs + MICRO_SWAP_CRXS_RAW), value: 0n })}
                  disabled={!!busy || !preflight.rightWallet || preflight.paused || !preflight.chainOk}
                  className="mt-3 w-full rounded-lg bg-primary text-primary-foreground font-display font-bold py-2.5 text-sm disabled:opacity-40"
                >
                  Prepare approval
                </button>
                {(!preflight.rightWallet || preflight.paused || !preflight.chainOk) && (
                  <p className="text-[10px] text-yellow-500 mt-2">Locked: {!preflight.chainOk ? "wallet must be on Base Mainnet" : !preflight.rightWallet ? "wrong wallet — connect the CRXS launch wallet" : "an emergency pause is active"}.</p>
                )}
              </>
            )}
          </div>

          {/* Stage 2 — liquidity (creates the pool) */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="font-display font-bold text-sm flex items-center gap-2"><Droplets className="w-4 h-4 text-primary" /> 2 · Initial liquidity — volatile CRXS/WETH pool</p>
            {poolCreated ? (
              <div className="text-xs text-emerald-400 mt-2 break-all">
                Pool exists{record && record.pool_address ? <> — {record.pool_address}</> : null}. A second pool is never created.
                {poolState && <span className="block text-muted-foreground mt-1">Live reserves: {(Number(poolState.reserve0) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} / {(Number(poolState.reserve1) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} — {poolState.stable === false ? "volatile pool ✓" : "pool kind read pending"}</span>}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-2">0.000050 ETH + {preflight ? crxsCount(preflight.liqCrxs) : "…"} CRXS (matched at the live curve price). Aerodrome creates the pool automatically with the first liquidity. Native ETH — no wrapping needed.</p>
                <button
                  onClick={() => {
                    const desired = preflight.liqCrxs;
                    prepareTx(
                      { key: "liquidity", title: "Add initial liquidity (creates the pool)", fn: "addLiquidityETH(CRXS, volatile)" },
                      {
                        to: AERODROME_ROUTER,
                        value: INITIAL_LIQUIDITY_ETH_WEI,
                        amountTokenDesired: desired,
                        data: encodeAddLiquidityETH(CRXS, false, desired, (desired * 97n) / 100n, (INITIAL_LIQUIDITY_ETH_WEI * 95n) / 100n, account, deadline()),
                      }
                    );
                  }}
                  disabled={!!busy || !approveDone || !preflight || !preflight.rightWallet || preflight.paused || !preflight.chainOk}
                  className="mt-3 w-full rounded-lg bg-primary text-primary-foreground font-display font-bold py-2.5 text-sm disabled:opacity-40"
                >
                  {liquidityDone ? "Liquidity confirmed ✓" : "Prepare liquidity deposit"}
                </button>
                {approveDone && preflight && (!preflight.rightWallet || preflight.paused) && (
                  <p className="text-[10px] text-yellow-500 mt-2">Locked: {!preflight.rightWallet ? "wrong wallet" : "emergency pause active"}.</p>
                )}
                {!approveDone && preflight && preflight.rightWallet && !preflight.paused && preflight.chainOk && (
                  <p className="text-[10px] text-yellow-500 mt-2">Locked: the CRXS approval is not detected in this pre-flight snapshot yet — tap Re-run (top right). A completed approval is read live from the chain and is never signed twice.</p>
                )}
              </>
            )}
          </div>

          {/* Stage 3 — micro-swap */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="font-display font-bold text-sm flex items-center gap-2"><Repeat className="w-4 h-4 text-primary" /> 3 · One genuine micro-swap (listing trigger)</p>
            {swapDone ? (
              <div className="text-xs text-emerald-400 mt-2 break-all">First market swap confirmed — <a className="text-primary" href={"https://basescan.org/tx/" + record.first_swap_tx} target="_blank" rel="noopener">{record.first_swap_tx.slice(0, 18)}…</a>. DEX Screener lists a token automatically once a pool + one transaction exist.</div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-2">100,000 CRXS → WETH through the pool. This is a real first market transaction — not manufactured volume, never repeated automatically.</p>
                <button
                  onClick={async () => {
                    let st = poolState;
                    if (!st && record && record.pool_address) { st = await readPoolState(record.pool_address); setPoolState(st); }
                    if (!st) { setError("Pool state not readable — nothing was prepared."); return; }
                    const crxsRes = st.token0 === CRXS.toLowerCase() ? st.reserve0 : st.reserve1;
                    const wethRes = st.token0 === CRXS.toLowerCase() ? st.reserve1 : st.reserve0;
                    const out = quoteVolatileOut(MICRO_SWAP_CRXS_RAW, crxsRes, wethRes);
                    if (out <= 0n) { setError("Could not quote the swap from live pool reserves — nothing was prepared."); return; }
                    prepareTx(
                      { key: "swap", title: "First genuine micro-swap", fn: "swapExactTokensForTokens(CRXS→WETH, volatile)" },
                      { to: AERODROME_ROUTER, value: 0n, data: encodeSwapExactTokensForTokens(MICRO_SWAP_CRXS_RAW, (out * 97n) / 100n, CRXS, false, WETH, account, deadline()) }
                    );
                  }}
                  disabled={!!busy || !poolCreated}
                  className="mt-3 w-full rounded-lg bg-primary text-primary-foreground font-display font-bold py-2.5 text-sm disabled:opacity-40"
                >
                  Prepare micro-swap
                </button>
                {liquidityDone && !poolCreated && <p className="text-[10px] text-yellow-500 mt-2">Locked: pool address not yet verified on-chain.</p>}
              </>
            )}
          </div>

          {/* Stage 4 — independent indexing */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="font-display font-bold text-sm flex items-center gap-2"><SearchCheck className="w-4 h-4 text-primary" /> 4 · Independent indexer discovery</p>
            <p className="text-xs text-muted-foreground mt-2">DEX Screener and GeckoTerminal index pools automatically and independently — indexing can never be bought or forced. Polling schedule: 10s, 30s, 60s, 2m, 5m.</p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className={"rounded-lg p-2.5 border " + (indexers.ds ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-card/70 text-muted-foreground")}>
                <p className="font-semibold">DEX Screener</p>
                <p className="mt-0.5">{indexers.ds ? "Pool reported ✓" : "Not reporting yet"}</p>
                {indexers.ds && <a href={indexers.ds.url} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 mt-1">View <ExternalLink className="w-3 h-3" /></a>}
              </div>
              <div className={"rounded-lg p-2.5 border " + (indexers.gt ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-card/70 text-muted-foreground")}>
                <p className="font-semibold">GeckoTerminal</p>
                <p className="mt-0.5">{indexers.gt ? "Pool reported ✓" : "Not reporting yet"}</p>
                {indexers.gt && <a href={indexers.gt.url || ((record && "https://www.geckoterminal.com/base/pools/" + (record.pool_address || "")) || "#")} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 mt-1">View <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </div>
            {indexers.note && <p className="text-[10px] text-muted-foreground mt-2">{indexers.note}</p>}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={checkIndexers} disabled={!!busy || !poolCreated} className="rounded-lg border border-border py-2 text-xs font-semibold disabled:opacity-40">Check now</button>
              <button onClick={runIndexerPolling} disabled={!!busy || !poolCreated} className="rounded-lg bg-primary text-primary-foreground font-display font-bold py-2 text-xs disabled:opacity-40">
                {busy === "indexers" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Polling…</span> : "Full poll (up to 5 min)"}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Every stage verifies on Base before the next unlocks; a missing receipt stops everything (never resend — reconcile on BaseScan). The Base44 ledger stays authoritative for internal Crix balances — pool reserves are never treated as customer balances. If a stage aborts, the real reason is kept and nothing is marked live until independently verified.
          </p>
        </>
      )}
    </div>
  );
}