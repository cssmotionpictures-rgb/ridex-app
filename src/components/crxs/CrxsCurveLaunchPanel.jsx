import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectMetaMask, switchToBaseMainnet } from "@/lib/metamaskConnect";
import { walletRequest, pollDeploymentReceipt } from "@/lib/crxsChain";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";
import {
  CRXS_TOKEN_ADDRESS,
  CRXS_CURVE_COMPILER,
  CRXS_CURVE_BYTECODE_SHA256,
  buildCurveDeployData,
  encodeApproveData,
  encodeFundData,
  billionToRaw,
  ethToWei,
  readCurveState,
  readTokenAllowance,
  formatEth,
  rawToBillion,
  formatPrice,
} from "@/lib/crxsCurve";
import { Rocket, ShieldCheck, AlertTriangle, CheckCircle2, Loader2, TrendingUp } from "lucide-react";

// OWNER DEPLOYMENT CONSOLE for the CRIXCOIN bonding curve. The curve sells the
// EXISTING verified CRXS — no third-party launchpad, no new token, no custodial
// wallet. Every transaction (deploy, approve, fund, migrate) is signed by the
// owner personally in MetaMask; the app never sees a private key.
const REGISTRY_KEY = "crxs-curve-deployment";
const APPROVED_DEPLOYER = "0xa6647b69af892b0f2894fc24fb58b2adcbedade1";
const PENDING_KEY = "crxs-curve-pending-deploy";
const PENDING_FUND_KEY = "crxs-curve-pending-fund";
const SPLIT_OPTIONS = [
  { label: "A · 500B (all)", billions: 500 },
  { label: "B · 250B (half)", billions: 250 },
  { label: "C · 100B", billions: 100 },
  { label: "D · 50B", billions: 50 },
];

function StepRow({ done, active, title, children }) {
  return (
    <div className={"rounded-xl border p-3.5 " + (done ? "border-emerald-500/40 bg-emerald-500/5" : active ? "border-primary/50 bg-primary/5" : "border-border bg-card")}>
      <p className="text-sm font-semibold flex items-center gap-2">
        {done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : active ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <span className="w-4 h-4 rounded-full border border-muted-foreground inline-block" />}
        {title}
      </p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function CrxsCurveLaunchPanel() {
  const [record, setRecord] = React.useState(null);
  const [account, setAccount] = React.useState("");
  const [chainId, setChainId] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [busy, setBusy] = React.useState(""); // "" | "deploy" | "approve" | "fund"
  const [error, setError] = React.useState("");
  const [log, setLog] = React.useState([]);
  const [live, setLive] = React.useState(null);
  const [params, setParams] = React.useState({ offsetEth: "1", thresholdEth: "5", buyFeeBps: "100", sellFeeBps: "100", fundBillion: "250" });

  const pushLog = (line) => setLog((l) => [...l, new Date().toLocaleTimeString() + " · " + line].slice(-6));
  const errorRef = React.useRef(null);
  // A failed pre-flight check used to render far below the fold — on mobile it
  // looked like the button "did nothing". Scroll the error into view instead.
  React.useEffect(() => {
    if (error && errorRef.current) errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const loadRecord = React.useCallback(() => {
    base44.entities.CrixLaunchCurveRecord.filter({ registry_key: REGISTRY_KEY })
      .then((r) => setRecord(r[0] || null))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    loadRecord();
    return base44.entities.CrixLaunchCurveRecord.subscribe(loadRecord);
  }, [loadRecord]);

  // Resume a pending deployment after a page reload — the SAME transaction is
  // polled, a second deployment is never submitted (idempotency by tx hash).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
        if (!saved || saved.status === "resolved") return;
        pushLog("Resuming pending deployment " + saved.txHash.slice(0, 18) + "…");
        const { status, receipt } = await pollDeploymentReceipt(saved.txHash, { intervalMs: 5000, timeoutMs: 120000, rpcUrl: BASE_MAINNET.rpcUrls[0] });
        if (cancelled) return;
        if (status === "confirmed" && receipt && receipt.contractAddress) {
          await upsertRecord({ status: "DEPLOYED", curve_address: receipt.contractAddress, deployer: saved.from, deployment_tx_hash: saved.txHash, block_number: Number(receipt.blockNumber), deployed_at: new Date().toISOString() });
          pushLog("Deployment confirmed on chain — curve " + receipt.contractAddress);
        } else if (status !== "unknown") {
          await upsertRecord({ status: "FAILED", failure_reason: "Deployment transaction reverted on Base Mainnet", deployment_tx_hash: saved.txHash });
          setError("The deployment transaction reverted on chain — nothing was lost except a tiny gas fee.");
        }
        localStorage.setItem(PENDING_KEY, JSON.stringify({ ...saved, status: "resolved" }));
      } catch (e) { /* restored later */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resume a pending FUND after a page reload or app switch — the SAME fund
  // transaction is polled on the public RPC (no wallet needed); a second fund
  // is never submitted.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(PENDING_FUND_KEY) || "null");
        if (!saved || saved.status === "resolved") return;
        pushLog("Resuming pending fund " + saved.fundHash.slice(0, 18) + "…");
        const fundRes = await pollDeploymentReceipt(saved.fundHash, { intervalMs: 5000, timeoutMs: 120000, rpcUrl: BASE_MAINNET.rpcUrls[0] });
        if (cancelled) return;
        await settleFund(fundRes, saved);
      } catch (e) { /* restored later */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const upsertRecord = async (patch) => {
    const existing = await base44.entities.CrixLaunchCurveRecord.filter({ registry_key: REGISTRY_KEY });
    if (existing[0]) {
      await base44.entities.CrixLaunchCurveRecord.update(existing[0].id, patch);
    } else {
      await base44.entities.CrixLaunchCurveRecord.create({ registry_key: REGISTRY_KEY, status: "NOT_DEPLOYED", ...patch });
    }
    loadRecord();
  };

  // React to wallet changes after connect — MetaMask fires these when the user
  // switches network or account inside the wallet, so the deploy gate updates
  // live instead of freezing on the chain the wallet had at connect time.
  const listenToWallet = (provider) => {
    if (!provider || !provider.on) return;
    provider.on("chainChanged", (cid) => setChainId(String(cid).toLowerCase()));
    provider.on("accountsChanged", (accs) => setAccount((accs && accs[0]) || ""));
  };

  const connect = async () => {
    setError("");
    setConnecting(true);
    try {
      const s = await connectMetaMask();
      setAccount(s.account);
      setChainId(String(s.chainId || "").toLowerCase());
      listenToWallet(s.provider);
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setConnecting(false);
    }
  };

  const onMainnet = chainId === BASE_MAINNET.chainIdHex;
  const isApprovedDeployer = account.toLowerCase() === APPROVED_DEPLOYER;
  const curveAddress = record?.curve_address || "";
  const deployed = !!curveAddress && ["DEPLOYED", "FUNDED", "GRADUATED", "MIGRATED"].includes(record?.status);
  const funded = ["FUNDED", "GRADUATED", "MIGRATED"].includes(record?.status);

  // Live chain state once the curve exists — real reads only.
  const refreshLive = React.useCallback(async () => {
    if (!curveAddress) return;
    try {
      setLive(await readCurveState(curveAddress));
    } catch (e) {
      setLive({ error: String((e && e.message) || e) });
    }
  }, [curveAddress]);
  React.useEffect(() => {
    refreshLive();
  }, [refreshLive, record?.status]);

  const deploy = async () => {
    setError("");
    setBusy("deploy");
    try {
      // Always send from the wallet's CURRENT selected account. A stale `from`
      // (the panel connected before the user switched accounts in MetaMask)
      // makes MetaMask reject the whole request with a generic "request failed".
      const liveAccounts = await walletRequest("eth_accounts");
      const from = (liveAccounts && liveAccounts[0]) || "";
      if (!from) throw new Error("MetaMask returned no account — tap Connect and try again.");
      if (from.toLowerCase() !== account.toLowerCase()) setAccount(from);
      if (from.toLowerCase() !== APPROVED_DEPLOYER) {
        throw new Error("MetaMask's selected account " + from + " is not the approved deployer — switch MetaMask to " + APPROVED_DEPLOYER + " and tap Deploy again.");
      }
      const offsetWei = ethToWei(params.offsetEth);
      const thresholdWei = ethToWei(params.thresholdEth);
      const buyBps = BigInt(params.buyFeeBps);
      const sellBps = BigInt(params.sellFeeBps);
      if (buyBps > 500n || sellBps > 500n) throw new Error("Fees are hard-capped at 5% (500 bps) by the contract.");
      const data = buildCurveDeployData({ token: CRXS_TOKEN_ADDRESS, virtualEthOffsetWei: offsetWei, graduationThresholdWei: thresholdWei, buyFeeBps: buyBps, sellFeeBps: sellBps });
      pushLog("Requesting your signature — review the contract creation in MetaMask.");
      // Explicit gas limit (1.3M, ~10% over the 1.18M estimate) — contract-creation
      // requests with an explicit gas skip MetaMask's eth_estimateGas step, which
      // is where mobile MetaMask fails with a generic "request failed".
      const txHash = await walletRequest("eth_sendTransaction", [{ from, data, value: "0x0", gas: "0x13d620" }]);
      localStorage.setItem(PENDING_KEY, JSON.stringify({ txHash, from: account, status: "pending" }));
      pushLog("Signed — confirming on Base Mainnet…");
      const { status, receipt } = await pollDeploymentReceipt(txHash, { intervalMs: 4000, rpcUrl: BASE_MAINNET.rpcUrls[0] });
      if (status === "confirmed" && receipt && receipt.contractAddress) {
        await upsertRecord({
          status: "DEPLOYED",
          curve_address: receipt.contractAddress,
          deployer: account,
          deployment_tx_hash: txHash,
          block_number: Number(receipt.blockNumber),
          deployed_at: new Date().toISOString(),
          virtual_eth_offset_wei: offsetWei.toString(),
          graduation_threshold_wei: thresholdWei.toString(),
          buy_fee_bps: Number(buyBps),
          sell_fee_bps: Number(sellBps),
          failure_reason: "",
        });
        localStorage.setItem(PENDING_KEY, JSON.stringify({ txHash, from: account, status: "resolved" }));
        pushLog("Curve deployed at " + receipt.contractAddress);
      } else if (status === "reverted") {
        await upsertRecord({ status: "FAILED", failure_reason: "Deployment transaction reverted on Base Mainnet", deployment_tx_hash: txHash });
        setError("The deployment transaction reverted — only a tiny gas fee was spent.");
      } else {
        setError("Confirmation timed out. The pending transaction is saved — reopen this page to resume polling it. Do NOT deploy again until it resolves.");
      }
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setBusy("");
    }
  };

  const approveAndFund = async () => {
    setError("");
    try {
      // Live selected account — the CRXS holder must sign both owner-only calls.
      const liveAccounts = await walletRequest("eth_accounts");
      const from = (liveAccounts && liveAccounts[0]) || "";
      if (!from) throw new Error("MetaMask returned no account — tap Connect and try again.");
      if (from.toLowerCase() !== account.toLowerCase()) setAccount(from);
      if (from.toLowerCase() !== APPROVED_DEPLOYER) {
        throw new Error("MetaMask's selected account " + from + " cannot fund the curve — switch MetaMask to " + APPROVED_DEPLOYER + " and try again.");
      }
      const amountRaw = billionToRaw(params.fundBillion);
      // 1. Approve — ONLY when the live chain allowance doesn't already cover the
      //    amount. An approve confirmed in an earlier attempt stays valid, so a
      //    retry must never force a second approve signature.
      let allowanceRaw = "0";
      try { allowanceRaw = await readTokenAllowance(CRXS_TOKEN_ADDRESS, from, curveAddress); } catch (e) { /* read failed — ask for the approve anyway */ }
      if (BigInt(allowanceRaw) < amountRaw) {
        setBusy("approve");
        pushLog("Requesting signature 1 of 2 — CRXS approve for the curve.");
        const approveHash = await walletRequest("eth_sendTransaction", [{ from, to: CRXS_TOKEN_ADDRESS, data: encodeApproveData(curveAddress, amountRaw), value: "0x0", gas: "0x186a0" }]);
        pushLog("Approve signed.");
      } else {
        pushLog("Approval already on-chain — only the fund signature is needed.");
      }
      // 2. Fund — requested IMMEDIATELY, without waiting for the approve receipt.
      //    On mobile, leaving the browser to confirm the approve suspends this
      //    page, which killed the fund request before the wallet ever showed it
      //    (the "I only ever see the approve popup" symptom). The chain runs the
      //    approve first (same wallet, ordered nonces); if the approve reverts,
      //    the fund reverts too and nothing is lost but gas.
      setBusy("fund");
      pushLog("Requesting signature 2 of 2 — fund the curve.");
      const fundHash = await walletRequest("eth_sendTransaction", [{ from, to: curveAddress, data: encodeFundData(amountRaw), value: "0x0", gas: "0x493e0" }]);
      const saved = { fundHash, amountRaw: amountRaw.toString(), from, status: "pending" };
      localStorage.setItem(PENDING_FUND_KEY, JSON.stringify(saved));
      pushLog("Both signed — confirming on Base Mainnet…");
      const fundRes = await pollDeploymentReceipt(fundHash, { intervalMs: 4000, rpcUrl: BASE_MAINNET.rpcUrls[0] });
      await settleFund(fundRes, saved);
    } catch (e) {
      setError(String((e && e.message) || e));
      setBusy("");
    }
  };

  const settleFund = async (fundRes, saved) => {
    if (fundRes.status === "confirmed") {
      await upsertRecord({ status: "FUNDED", funded_amount_raw: saved.amountRaw, fund_tx_hash: saved.fundHash, failure_reason: "", notes: "Curve funded with " + rawToBillion(saved.amountRaw) + "B CRXS by the owner. Trading is live on the curve." });
      localStorage.setItem(PENDING_FUND_KEY, JSON.stringify({ ...saved, status: "resolved" }));
      pushLog("Curve funded — the CRXS market is live on the bonding curve.");
    } else if (fundRes.status === "reverted") {
      localStorage.setItem(PENDING_FUND_KEY, JSON.stringify({ ...saved, status: "resolved" }));
      await upsertRecord({ status: "DEPLOYED", failure_reason: "The fund transaction reverted on Base Mainnet — the approval is still valid, retry is safe." });
      setError("The fund transaction reverted on chain — the approval is still valid, you can retry.");
    } else {
      setError("Fund confirmation timed out. The pending fund is saved — reopen this page to resume polling it. Do NOT send another fund until it resolves.");
    }
    setBusy("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Liquidity — zero capital</p>
          <h2 className="text-lg font-bold mt-1">CRXS Bonding Curve — Owner Launch Console</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Your own on-chain curve sells the EXISTING verified CRXS. No third-party launchpad, no new token, no custodial wallet. Price starts near zero, ETH from the first buyers becomes the reserve, and the owner can never touch that reserve until graduation.
          </p>
        </div>
        <TrendingUp className="w-5 h-5 text-primary shrink-0" />
      </div>

      {/* Review block — what exactly will be deployed */}
      <div className="mt-4 grid gap-2 text-xs">
        <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Pre-deployment review — verify before you sign</p>
          <p className="text-muted-foreground">Contract: <span className="font-mono">contracts/CrixLaunchCurve.sol</span> · {CRXS_CURVE_COMPILER.version} · optimizer 200 runs · SHA-256 <span className="font-mono break-all">{CRXS_CURVE_BYTECODE_SHA256.slice(0, 24)}…</span></p>
          <p className="text-muted-foreground">Deploy gas (live estimate): ≈1,185,000 gas · about 0.000007 ETH — your deployment wallet already holds enough for deploy + approve + fund. You only sign, you do not fund.</p>
          <p className="text-muted-foreground">Sells the verified token <span className="font-mono">{CRXS_TOKEN_ADDRESS}</span> — the address never changes.</p>
        </div>
      </div>

      {/* Wallet connection */}
      <div className="mt-4 rounded-xl border border-border p-3.5 flex flex-wrap items-center gap-2 justify-between">
        <p className="text-xs font-semibold">{account ? ("Connected: " + account) : "Connect the deployment wallet (MetaMask)"}</p>
        {!account ? (
          <Button size="sm" onClick={connect} disabled={connecting}>{connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Connect</Button>
        ) : !onMainnet ? (
          <Button size="sm" variant="outline" onClick={() => switchToBaseMainnet().then((cid) => setChainId(String(cid || "").toLowerCase())).catch((e) => setError(String(e.message || e)))}>Switch to Base Mainnet</Button>
        ) : (
          <span className={"text-xs " + (isApprovedDeployer ? "text-emerald-400" : "text-yellow-400")}>{isApprovedDeployer ? "Approved deployer ✓" : "⚠ Not the approved deployer wallet"}</span>
        )}
      </div>
      {account && onMainnet && !isApprovedDeployer && (
        <p className="text-[11px] text-yellow-400 mt-1">Only {APPROVED_DEPLOYER} should deploy — the deployer becomes the curve owner (fund, fees, migration).</p>
      )}

      {/* Steps */}
      <div className="mt-4 space-y-3">
        {/* STEP 1 — deploy */}
        <StepRow done={deployed} active={busy === "deploy"} title="1 · Deploy the curve contract (one signature)">
          {!deployed && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Virtual ETH offset (start price)</span>
                  <Input value={params.offsetEth} onChange={(e) => setParams({ ...params, offsetEth: e.target.value })} placeholder="1" inputMode="decimal" />
                </label>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Graduation threshold (ETH reserve)</span>
                  <Input value={params.thresholdEth} onChange={(e) => setParams({ ...params, thresholdEth: e.target.value })} placeholder="5" inputMode="decimal" />
                </label>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Buy fee (bps, max 500)</span>
                  <Input value={params.buyFeeBps} onChange={(e) => setParams({ ...params, buyFeeBps: e.target.value })} placeholder="100" inputMode="numeric" />
                </label>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Sell fee (bps, max 500)</span>
                  <Input value={params.sellFeeBps} onChange={(e) => setParams({ ...params, sellFeeBps: e.target.value })} placeholder="100" inputMode="numeric" />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">All four values are FIXED FOREVER inside the deployed contract — review them in MetaMask before signing. Fees are hard-capped at 5% by the contract itself.</p>
              {!account && <p className="text-[11px] text-yellow-400">Tap “Connect” above first — Deploy unlocks once the wallet is connected.</p>}
              {account && !onMainnet && <p className="text-[11px] text-yellow-400">Switch MetaMask to Base Mainnet (button above) — Deploy unlocks on the right network.</p>}
              <Button size="sm" onClick={deploy} disabled={!account || !onMainnet || busy === "deploy"}>{busy === "deploy" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Deploy curve</Button>
            </div>
          )}
          {deployed && <p className="text-xs text-muted-foreground break-all">Curve: <span className="font-mono">{curveAddress}</span> · tx <span className="font-mono">{record.deployment_tx_hash}</span></p>}
        </StepRow>

        {/* STEP 2 — fund */}
        <StepRow done={funded} active={busy === "approve" || busy === "fund"} title="2 · Approve & fund the curve with your existing CRXS (two signatures)">
          {deployed && !funded && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {SPLIT_OPTIONS.map((o) => (
                  <button key={o.label} onClick={() => setParams({ ...params, fundBillion: String(o.billions) })}
                    className={"px-2.5 py-1 rounded-full text-[11px] border " + (params.fundBillion === String(o.billions) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground")}>
                    {o.label}
                  </button>
                ))}
              </div>
              <label className="text-xs space-y-1 block">
                <span className="text-muted-foreground">CRXS to put on the curve (billions — you hold 500B)</span>
                <Input value={params.fundBillion} onChange={(e) => setParams({ ...params, fundBillion: e.target.value })} inputMode="numeric" />
              </label>
              <Button size="sm" onClick={approveAndFund} disabled={!account || !onMainnet || busy === "approve" || busy === "fund"}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Approve & fund
              </Button>
            </div>
          )}
          {funded && <p className="text-xs text-muted-foreground">Funded with <span className="font-mono">{rawToBillion(record.funded_amount_raw || "0")}B CRXS</span> · tx <span className="font-mono">{record.fund_tx_hash}</span></p>}
        </StepRow>

        {/* STEP 3 — live market */}
        <StepRow done={false} active={false} title="3 · Live curve market (real chain state)">
          {deployed && (
            live && !live.error ? (
              <div className="grid gap-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">CRXS price (curve)</p><p className="font-bold font-mono">{formatPrice(live.priceEthPerCrxs)} ETH</p></div>
                  <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">ETH reserve (backs all sells)</p><p className="font-bold font-mono">{formatEth(live.ethReserveWei)} ETH</p></div>
                  <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">CRXS still for sale</p><p className="font-bold font-mono">{rawToBillion(live.tokenReserveRaw)}B</p></div>
                  <div className="rounded-lg bg-secondary/40 p-2.5"><p className="text-muted-foreground">Graduation progress</p><p className="font-bold font-mono">{Math.min(100, (Number(live.ethReserveWei) / Number(live.graduationThresholdWei)) * 100).toFixed(1)}%</p></div>
                </div>
                <p className="text-[11px] text-muted-foreground">Fees: {live.buyFeeBps / 100}% buy / {live.sellFeeBps / 100}% sell, fixed forever. {live.graduated ? "GRADUATED — curve trading closed; migrate the reserve to a DEX pool with the migrate() call." : "At graduation the curve closes and the reserve migrates to a DEX — the owner signs that final step."}</p>
                <Button size="sm" variant="outline" onClick={refreshLive}>Refresh live state</Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{live && live.error ? "Live read failed: " + live.error : "Reading live state…"}</p>
            )
          )}
        </StepRow>
      </div>

      {error && <p ref={errorRef} className="text-xs text-destructive mt-3 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}
      {log.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-2.5">
          {log.map((l, i) => <p key={i} className="text-[11px] text-muted-foreground font-mono">{l}</p>)}
        </div>
      )}
    </div>
  );
}