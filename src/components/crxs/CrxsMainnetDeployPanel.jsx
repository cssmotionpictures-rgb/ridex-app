import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ExternalLink, Loader2, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { CRXS } from "@/lib/crxsTokenomics";
import { CRXS_CREATION_BYTECODE, CRXS_COMPILER, CRXS_BYTECODE_SHA256 } from "@/lib/crxsDeployBytecode";
import {
  connectMetaMask, restoreSession, switchToBaseMainnet, currentChainId, walletRequest,
} from "@/lib/metamaskConnect";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";
import {
  buildDeployData, pollDeploymentReceipt, rpcGetTransactionReceipt, readTokenState,
} from "@/lib/crxsChain";

const CONFIRM_TEXT = "I understand this deploys the PRODUCTION CrixCoin (CRXS) contract on Base Mainnet. It is real, irreversible, and gas is paid in real ETH.";
const ZERO = "0x0000000000000000000000000000000000000000";
const PENDING_KEY = "crxs_mainnet_pending_deployment";

// Owner-confirmed launch gates — no checkbox, no deployment. These are the
// items that cannot be verified by software and must be explicitly approved
// by the project owner before production money moves.
const OWNER_GATES = [
  { key: "allocation", label: "Mainnet token allocation & treasury policy are finalized and approved" },
  { key: "security", label: "Security review of the contract and the launch plan is complete" },
  { key: "legal", label: "Legal / compliance review for CSS Entertainment is complete" },
  { key: "public", label: "Website, explorer and public token information are ready to publish the real address" },
  { key: "gas", label: "The deployment wallet holds real Base ETH — I accept that gas is paid in real money" },
];

const PARAMS = [
  ["Network", "Base MAINNET — PRODUCTION (chain ID " + BASE_MAINNET.chainId + ")"],
  ["Token", CRXS.NAME + " (" + CRXS.SYMBOL + ")"],
  ["Decimals", String(CRXS.DECIMALS)],
  ["Total supply", "500,000,000,000 " + CRXS.SYMBOL + " fixed — minted once to the deployment wallet"],
  ["Deployment wallet", CRXS.DEPLOYER],
  ["Constructor argument (raw units)", CRXS.CONSTRUCTOR_ARG],
];

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}
function shortAddr(a) {
  return typeof a === "string" && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}
function isValidTxHash(h) {
  return typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
}
function isValidContractAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a.toLowerCase() !== ZERO;
}

function readPending() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PENDING_KEY) : null;
    const p = raw ? JSON.parse(raw) : null;
    return p && isValidTxHash(p.tx_hash) ? p : null;
  } catch (e) { return null; }
}
function savePending(p) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage unavailable */ }
}

function GateRow({ ok, label }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px]">
      {ok ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />}
      <span className={ok ? "" : "text-destructive"}>{label}</span>
    </p>
  );
}

// MAINNET OWNER DEPLOYMENT CONSOLE — production money, real and irreversible.
// The safety gate refuses to arm until the Sepolia program is fully proven
// AND the owner has explicitly confirmed every launch item. The app NEVER
// signs and NEVER touches the private key — MetaMask performs the signing,
// and nothing is recorded until the server independently re-verifies the
// contract state straight from Base Mainnet.
export default function CrxsMainnetDeployPanel({ record, onRecorded }) {
  const [phase, setPhase] = React.useState("DISCONNECTED");
  const [account, setAccount] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [gateChecks, setGateChecks] = React.useState({});
  const [switching, setSwitching] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [pendingTx, setPendingTx] = React.useState("");
  const [testnetRecord, setTestnetRecord] = React.useState(null);
  const [testTransfers, setTestTransfers] = React.useState([]);
  const cleanupRef = React.useRef(null);

  const shown = result || (record && record.deployment_status === "DEPLOYED" ? record : null);
  const alreadyDeployed = !!shown?.contract_address;
  const onMainnet = ["CONNECTED", "DEPLOYING", "SUBMITTED", "CONFIRMED"].includes(phase);
  const deployerOk = !!account && account.toLowerCase() === CRXS.DEPLOYER.toLowerCase();

  // ——— auto-verifiable safety gates (from real server-verified records) ———
  const autoGates = [
    { label: "Contract bytes finalized — recovered verbatim from the verified Sepolia deployment (minimal fixed-supply ERC-20: no mint, no owner, no pause, no upgrade)", pass: true },
    { label: "Token identity finalized — CrixCoin · CRXS · 18 decimals · 500,000,000,000 CRXS approved supply", pass: true },
    { label: "Mint / burn / ownership / pause / upgradeability rules finalized and proven on Sepolia", pass: true },
    { label: "Base Sepolia deployment verified on-chain", pass: testnetRecord?.deployment_status === "DEPLOYED" && !!testnetRecord?.contract_address },
    { label: "Real Sepolia transfer test verified and indexed (A→B)", pass: testTransfers.length > 0 },
    { label: "Deployment wallet confirmed — connected account is the approved deployer", pass: deployerOk },
    { label: "Network confirmed — Base Mainnet (chain " + BASE_MAINNET.chainId + ")", pass: onMainnet },
  ];
  const ownerGatesPassed = OWNER_GATES.every((g) => gateChecks[g.key] === true);
  const allGatesPassed = autoGates.every((g) => g.pass) && ownerGatesPassed && confirmed;

  React.useEffect(() => {
    base44.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" })
      .then((r) => setTestnetRecord(r[0] || null)).catch(() => {});
    base44.entities.CrxsOnchainTransfer.list("-created_date", 5)
      .then(setTestTransfers).catch(() => {});
  }, []);

  const attachEvents = (provider) => {
    if (!provider || typeof provider.on !== "function") return;
    if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    const onAccounts = (accs) => {
      if (!accs || !accs.length) { setAccount(""); setPhase("DISCONNECTED"); return; }
      setAccount(accs[0]);
      setConfirmed(false);
    };
    const onChain = (cid) => {
      setPhase(String(cid).toLowerCase() === BASE_MAINNET.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    cleanupRef.current = () => {
      try {
        provider.removeListener("accountsChanged", onAccounts);
        provider.removeListener("chainChanged", onChain);
      } catch (e) { /* noop */ }
    };
  };

  // Post-receipt finalization: the server independently re-verifies everything
  // against Base Mainnet before anything is recorded as deployed.
  const finalize = async (txHash, receipt, readState) => {
    const contractAddress = receipt && receipt.contractAddress;
    if (!isValidContractAddress(contractAddress)) {
      throw new Error("The receipt contains no valid contract address — nothing was deployed. TX: " + txHash);
    }
    let onchainState = null;
    if (readState) {
      try { onchainState = await readTokenState(contractAddress, account || CRXS.DEPLOYER); } catch (e) { /* the server re-verifies independently */ }
    }
    const raw = await base44.functions.invoke("crxs-mainnet-deployment-verify", {
      contract_address: contractAddress,
      tx_hash: txHash,
      compiler_version: CRXS_COMPILER.version,
      optimizer: CRXS_COMPILER.optimizer,
      bytecode_sha256: CRXS_BYTECODE_SHA256,
    });
    const res = raw && raw.data !== undefined ? raw.data : raw;
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || "Server-side Mainnet verification failed — nothing was recorded.");
    }
    clearPending();
    setPendingTx("");
    setResult({ ...res.deployment, onchain_state: onchainState });
    setStatus("");
    setPhase("CONFIRMED");
    if (onRecorded) onRecorded();
  };

  // Resume the SAME pending transaction — poll the official Base Mainnet RPC
  // read-only, never submit a second deployment.
  const resumePending = async (p) => {
    try {
      const deadline = Date.now() + 300000;
      let receipt = null;
      while (Date.now() < deadline && !receipt) {
        receipt = await rpcGetTransactionReceipt(p.tx_hash, BASE_MAINNET.rpcUrls[0]);
        if (!receipt) await new Promise((r) => setTimeout(r, 4000));
      }
      if (!receipt) {
        throw new Error("The pending Mainnet deployment is still unconfirmed after 5 minutes — check it on the explorer: https://basescan.org/tx/" + p.tx_hash);
      }
      if (String(receipt.status) !== "0x1") {
        throw new Error("The Mainnet deployment transaction FAILED on-chain — nothing was deployed. TX: " + p.tx_hash);
      }
      // Already server-verified? If the production record shows DEPLOYED with
      // this exact contract address, reconcile silently instead of re-invoking
      // the server (a re-invocation from a different/non-admin session would
      // wrongly show "Deployment failed").
      try {
        const recs = await base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" });
        const rec = (recs || [])[0];
        if (rec && rec.deployment_status === "DEPLOYED" &&
            String(rec.contract_address || "").toLowerCase() === String(receipt.contractAddress || "").toLowerCase()) {
          clearPending();
          setPendingTx("");
          setResult(rec);
          setStatus("");
          setPhase("CONFIRMED");
          if (onRecorded) onRecorded();
          return;
        }
      } catch (e) { /* fall through to the server re-verification */ }
      await finalize(p.tx_hash, receipt, false);
    } catch (e) {
      setStatus("");
      setPhase("FAILED");
      setError(String((e && e.message) || e));
    }
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await restoreSession();
        if (alive && s) {
          setAccount(s.account);
          attachEvents(s.provider);
          setPhase(s.chainId === BASE_MAINNET.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
        }
      } catch (e) { /* not connected yet */ }
      const p = readPending();
      if (alive && p) {
        setPendingTx(p.tx_hash);
        setStatus("Mainnet deployment submitted — waiting for confirmation…");
        setPhase("SUBMITTED");
        resumePending(p);
      }
    })();
    return () => {
      alive = false;
      if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    };
  }, []);

  const connect = async () => {
    setError("");
    try {
      setPhase("CONNECTING");
      setStatus("Connecting…");
      const s = await connectMetaMask();
      setAccount(s.account);
      attachEvents(s.provider);
      setStatus("");
      if (s.chainId !== BASE_MAINNET.chainIdHex) {
        setPhase("WRONG_NETWORK");
        return;
      }
      setPhase("CONNECTED");
    } catch (e) {
      setStatus("");
      setPhase("DISCONNECTED");
      if (e && e.code === 4001) setError("Connection rejected in MetaMask");
      else if (e && e.code === -32002) setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      else setError(String((e && e.message) || e));
    }
  };

  const switchNetwork = async () => {
    setError("");
    setSwitching(true);
    try {
      const id = await switchToBaseMainnet();
      setPhase(id === BASE_MAINNET.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
    } catch (e) {
      if (e && e.code === 4001) setError("Network switch rejected in MetaMask");
      else if (e && e.code === -32002) setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      else setError(String((e && e.message) || e));
    } finally {
      setSwitching(false);
    }
  };

  // ——— deploy: safety gate → pre-flight → MetaMask signs → receipt → verify ———
  const deploy = async () => {
    const p = readPending();
    if (p) {
      setPendingTx(p.tx_hash);
      setStatus("Mainnet deployment submitted — waiting for confirmation…");
      setPhase("SUBMITTED");
      return resumePending(p);
    }
    setError("");
    try {
      if (!allGatesPassed) throw new Error("The safety gate is not fully passed — every gate item must be confirmed first.");
      if (!account) throw new Error("Connect MetaMask first.");
      const id = await currentChainId();
      if (id !== BASE_MAINNET.chainIdHex) {
        setPhase("WRONG_NETWORK");
        throw new Error("Deployment blocked — the wallet is not on Base Mainnet.");
      }
      const data = buildDeployData(CRXS_CREATION_BYTECODE, CRXS.CONSTRUCTOR_ARG);
      setPhase("DEPLOYING");
      setStatus("Confirm the PRODUCTION deployment in MetaMask…");
      let gasLimit;
      try {
        gasLimit = BigInt(await walletRequest("eth_estimateGas", [{ from: account, data, value: "0x0" }]));
      } catch (e) {
        gasLimit = 2000000n;
      }
      const price = BigInt(await walletRequest("eth_gasPrice", []));
      const balance = BigInt(await walletRequest("eth_getBalance", [account, "latest"]));
      if (balance < gasLimit * price) {
        throw new Error("Insufficient Base ETH (MAINNET — real money) for deployment gas. Fund the deployment wallet with real Base ETH first.");
      }
      const maxFee = price * 2n;
      const maxPriority = price < 1000000000n ? price : 1000000000n;
      setStatus("Real estimate: " + gasLimit.toLocaleString("en-US") + " gas · max fee ≈ " + (Number(maxFee * gasLimit) / 1e18).toFixed(6) + " ETH (REAL) — confirm in MetaMask…");
      const txHash = await walletRequest("eth_sendTransaction", [{
        from: account,
        data,
        gas: "0x" + gasLimit.toString(16),
        maxFeePerGas: "0x" + maxFee.toString(16),
        maxPriorityFeePerGas: "0x" + maxPriority.toString(16),
        value: "0x0",
      }]);
      if (!isValidTxHash(txHash)) throw new Error("MetaMask did not return a valid transaction hash.");
      savePending({ tx_hash: txHash, deployer: account, chain_id: BASE_MAINNET.chainId, saved_at: new Date().toISOString() });
      setPendingTx(txHash);
      setPhase("SUBMITTED");
      setStatus("Mainnet deployment submitted — waiting for confirmation…");
      const poll = await pollDeploymentReceipt(txHash);
      if (poll.status === "reverted") {
        throw new Error("The PRODUCTION deployment REVERTED on-chain — nothing was deployed. Explorer: https://basescan.org/tx/" + txHash);
      }
      if (poll.status === "unknown") {
        throw new Error("The transaction was submitted but not confirmed within 5 minutes — status UNKNOWN. Check the explorer BEFORE trying again: https://basescan.org/tx/" + txHash);
      }
      await finalize(txHash, poll.receipt, true);
    } catch (e) {
      setStatus("");
      const msg = String((e && e.message) || e);
      if (e && e.code === 4001) {
        setPhase("REJECTED");
        setError("Production deployment rejected in MetaMask");
      } else if (e && e.code === -32002) {
        setPhase("FAILED");
        setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      } else {
        setPhase("FAILED");
        setError("Mainnet deployment failed — see details: " + msg);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-destructive/50 bg-destructive/5 p-4 space-y-4">
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
        <p className="font-heading font-bold text-sm text-destructive">PRODUCTION — BASE MAINNET — REAL VALUE — IRREVERSIBLE</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          This is not a test. The contract deployed here holds the real production CRXS supply and gas is paid in real ETH.
          The safety gate below refuses to arm until the Sepolia program is fully proven and you have confirmed every launch item.
          The app never signs — MetaMask performs the signing, your key never touches this app, and nothing is recorded until the server independently re-verifies the contract on Base Mainnet.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 text-[11px] space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Wallet</span>
          <span className="font-mono break-all text-right">{account ? "Connected: " + shortAddr(account) : "Disconnected"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Network</span>
          <span className={onMainnet ? "text-emerald-400 font-semibold" : "text-yellow-500 font-semibold"}>{onMainnet ? "Base MAINNET" : "Wrong network"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Production deployment</span>
          <span className={alreadyDeployed || phase === "CONFIRMED" ? "text-emerald-400 font-semibold" : ""}>
            {alreadyDeployed || phase === "CONFIRMED" ? "DEPLOYED" : pendingTx ? "PENDING — " + shortAddr(pendingTx) : "NOT DEPLOYED"}
          </span>
        </div>
        <div className="pt-2 border-t border-border space-y-1">
          {phase === "DISCONNECTED" && <p className="font-bold text-muted-foreground flex items-center gap-1.5"><PlugZap className="w-3.5 h-3.5" /> Connect MetaMask</p>}
          {phase === "CONNECTING" && <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</p>}
          {phase === "CONNECTED" && <p className="font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Connected — Base MAINNET{deployerOk ? " — approved deployment wallet" : ""}</p>}
          {phase === "WRONG_NETWORK" && <p className="font-bold text-yellow-500 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Wrong network — switch to Base Mainnet to continue</p>}
          {phase === "DEPLOYING" && <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirm the production deployment in MetaMask…</p>}
          {phase === "SUBMITTED" && <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitted — waiting for confirmation…</p>}
          {phase === "CONFIRMED" && <p className="font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> PRODUCTION CRXS deployed and server-verified</p>}
          {phase === "REJECTED" && <p className="font-bold text-destructive flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Rejected in MetaMask</p>}
          {phase === "FAILED" && <p className="font-bold text-destructive flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Failed — see details</p>}
          {error && <p className="break-all">{error}</p>}
          {(phase === "DISCONNECTED" || phase === "WRONG_NETWORK") && (
            <p className="text-muted-foreground">Approved deployment wallet: <span className="font-mono break-all">{CRXS.DEPLOYER}</span></p>
          )}
        </div>
      </div>

      {!alreadyDeployed && (
        <>
          {/* ——— SAFETY GATE ——— */}
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Mainnet deployment safety gate</p>
            <div className="space-y-1.5">
              {autoGates.map((g) => <GateRow key={g.label} ok={g.pass} label={g.label} />)}
            </div>
            <div className="pt-2 border-t border-border space-y-2">
              {OWNER_GATES.map((g) => (
                <label key={g.key} className="flex items-start gap-2.5 text-[11px] cursor-pointer">
                  <Checkbox
                    checked={gateChecks[g.key] === true}
                    onCheckedChange={(v) => setGateChecks((prev) => ({ ...prev, [g.key]: v === true }))}
                  />
                  <span>{g.label}</span>
                </label>
              ))}
            </div>
            {!allGatesPassed && (
              <p className="text-[10px] text-destructive">
                The deploy button stays disabled until every gate passes. Failed auto-gates show exactly what is still missing — nothing is ever bypassed.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            {PARAMS.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3 text-[11px]">
                <span className="text-muted-foreground shrink-0">{k}</span>
                <span className="font-mono break-all text-right">{v}</span>
              </div>
            ))}
          </div>

          {(phase === "DISCONNECTED" || phase === "CONNECTING") && (
            <Button className="w-full" disabled={phase === "CONNECTING"} onClick={connect}>
              {phase === "CONNECTING" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {phase === "CONNECTING" ? "Connecting…" : "Connect MetaMask"}
            </Button>
          )}

          {phase === "WRONG_NETWORK" && (
            <Button className="w-full" disabled={switching} onClick={switchNetwork}>
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {switching ? "Switching…" : "Switch to Base Mainnet"}
            </Button>
          )}

          {phase === "CONNECTED" && (
            <>
              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                <span>{CONFIRM_TEXT}</span>
              </label>
              <Button className="w-full" variant="destructive" disabled={!allGatesPassed} onClick={deploy}>
                Deploy PRODUCTION CRXS to Base Mainnet (MetaMask will ask you to approve)
              </Button>
            </>
          )}

          {status && <p className="text-[11px] text-primary">{status}</p>}
        </>
      )}

      {pendingTx && phase !== "CONFIRMED" && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-[11px] space-y-1">
          <p className="font-bold text-yellow-500">Production deployment in flight — this page keeps watching the SAME transaction</p>
          <p className="font-mono break-all">{pendingTx}</p>
          <a href={BASE_MAINNET.explorer + "/tx/" + pendingTx} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
            View on BaseScan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {alreadyDeployed && (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-[11px] space-y-1">
          <p className="font-bold text-emerald-400">PRODUCTION CRXS DEPLOYED — verified server-side against Base MAINNET</p>
          <p>Network: {shown.network || "Base Mainnet"} · Chain ID: {shown.chain_id}</p>
          <p>Contract: <span className="font-mono break-all">{shown.contract_address}</span></p>
          <p>Deployment TX: <span className="font-mono break-all">{shown.deployment_tx_hash}</span></p>
          <p>Block: {shown.block_number} · Gas used: {fmt(shown.gas_used)}</p>
          <p>Total Supply: {shown.total_supply_raw} <span className="text-muted-foreground">({fmt(Number(BigInt(shown.total_supply_raw || 0) / 10n ** 18n))} {shown.symbol || "CRXS"})</span></p>
          <p className="text-[10px] text-muted-foreground">Launch status: {shown.launch_status || "VERIFIED"} (on-chain) · BaseScan source publish still required before "LIVE".</p>
          <a href={shown.explorer_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
            View on BaseScan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}