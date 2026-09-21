import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ExternalLink, Loader2, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { CRXS } from "@/lib/crxsTokenomics";
import { CRXS_CREATION_BYTECODE, CRXS_COMPILER, CRXS_BYTECODE_SHA256 } from "@/lib/crxsDeployBytecode";
import {
  connectMetaMask, restoreSession, switchToBaseSepolia, currentChainId, walletRequest, DAPP_URL,
} from "@/lib/metamaskConnect";
import {
  BASE_SEPOLIA, buildDeployData, pollDeploymentReceipt, rpcGetTransactionReceipt, readTokenState,
} from "@/lib/crxsChain";
import CrxsTransferTest from "@/components/crxs/CrxsTransferTest";
import CrxsAddToMetaMask from "@/components/crxs/CrxsAddToMetaMask";

const CONFIRM_TEXT = "I understand this transaction deploys CrixCoin (CRXS) to Base Sepolia testnet.";
const ZERO = "0x0000000000000000000000000000000000000000";
const PENDING_KEY = "crxs_pending_deployment";
const HOST = DAPP_URL.replace(/^https?:\/\//, "");

const PARAMS = [
  ["Network", "Base Sepolia (TESTNET)"],
  ["Chain ID", String(CRXS.TESTNET_CHAIN_ID)],
  ["Token", CRXS.NAME + " (" + CRXS.SYMBOL + ")"],
  ["Decimals", String(CRXS.DECIMALS)],
  ["Initial supply", "500,000,000,000 " + CRXS.SYMBOL + " fixed — 100% minted once to the deployment wallet (INITIAL DEPLOYMENT ALLOCATION, not the final economic distribution)"],
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
// Zero-address protection: the zero address, missing or malformed values can
// never be treated as a deployed CRXS contract.
function isValidContractAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a.toLowerCase() !== ZERO;
}

// Durable pending-deployment state — survives reloads and the round-trip into
// MetaMask Mobile. The transaction hash is the idempotency key.
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

// OWNER DEPLOYMENT CONSOLE — explicit state machine:
// DISCONNECTED → CONNECTING → CONNECTED | WRONG_NETWORK → DEPLOYING → SUBMITTED
// → CONFIRMED | REJECTED | FAILED. The app NEVER signs, NEVER requests or
// stores the private key or seed phrase. Nothing is EVER shown as deployed
// until Base Sepolia confirms the receipt AND the server independently
// re-verifies name, symbol, decimals, total supply, bytecode and the deployer
// balance straight from the chain. The zero address stays strictly the
// NOT DEPLOYED placeholder.
export default function CrxsDeployPanel({ record, onRecorded }) {
  const [phase, setPhase] = React.useState("DISCONNECTED");
  const [account, setAccount] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [pendingTx, setPendingTx] = React.useState("");
  const cleanupRef = React.useRef(null);

  const shown = result || (record && record.deployment_status === "DEPLOYED" ? record : null);
  const alreadyDeployed = !!shown?.contract_address;
  const onBaseSepolia = ["CONNECTED", "DEPLOYING", "SUBMITTED", "CONFIRMED"].includes(phase);
  const deployerOk = !!account && account.toLowerCase() === CRXS.DEPLOYER.toLowerCase();

  // ——— wallet events (accountsChanged / chainChanged) with unmount cleanup ———
  const attachEvents = (provider) => {
    if (!provider || typeof provider.on !== "function") return;
    if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    const onAccounts = (accs) => {
      if (!accs || !accs.length) { setAccount(""); setPhase("DISCONNECTED"); return; }
      setAccount(accs[0]);
      setConfirmed(false); // deployment preparation is invalidated on account change
    };
    const onChain = (cid) => {
      setPhase(String(cid).toLowerCase() === BASE_SEPOLIA.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
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

  // Post-receipt finalization: real contract address only, server re-verifies
  // everything against Base Sepolia before anything is recorded as deployed.
  const finalize = async (txHash, receipt, readState) => {
    const contractAddress = receipt && receipt.contractAddress;
    if (!isValidContractAddress(contractAddress)) {
      throw new Error("The receipt contains no valid contract address — nothing was deployed. TX: " + txHash);
    }
    let onchainState = null;
    if (readState) {
      try { onchainState = await readTokenState(contractAddress, account || CRXS.DEPLOYER); } catch (e) { /* the server re-verifies independently */ }
    }
    const raw = await base44.functions.invoke("crxs-deployment-verify", {
      contract_address: contractAddress,
      tx_hash: txHash,
      compiler_version: CRXS_COMPILER.version,
      optimizer: CRXS_COMPILER.optimizer,
      bytecode_sha256: CRXS_BYTECODE_SHA256,
    });
    const res = raw && raw.data !== undefined ? raw.data : raw;
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || "Server-side chain verification failed — nothing was recorded.");
    }
    clearPending();
    setPendingTx("");
    setResult({ ...res.deployment, onchain_state: onchainState });
    setStatus("");
    setPhase("CONFIRMED");
    if (onRecorded) onRecorded();
  };

  // Resume the SAME pending transaction — poll the official Base Sepolia RPC
  // read-only, never submit a second deployment.
  const resumePending = async (p) => {
    try {
      const deadline = Date.now() + 300000;
      let receipt = null;
      while (Date.now() < deadline && !receipt) {
        receipt = await rpcGetTransactionReceipt(p.tx_hash);
        if (!receipt) await new Promise((r) => setTimeout(r, 4000));
      }
      if (!receipt) {
        throw new Error("The pending deployment is still unconfirmed after 5 minutes — check it on the explorer: https://sepolia.basescan.org/tx/" + p.tx_hash);
      }
      if (String(receipt.status) !== "0x1") {
        throw new Error("The deployment transaction FAILED on-chain — nothing was deployed. TX: " + p.tx_hash);
      }
      // Already server-verified? If the record shows DEPLOYED with this exact
      // contract address, the deployment is an established fact — reconcile
      // silently instead of re-invoking the server (a re-invocation from a
      // different/non-admin session would wrongly show "Deployment failed").
      try {
        const recs = await base44.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" });
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

  // ——— page load: silent session restore + pending-transaction resume ———
  React.useEffect(() => {
    let alive = true;
    (async () => {
      // Silent restore (eth_accounts only) — an already authorized wallet never
      // sees a second connection modal.
      try {
        const s = await restoreSession();
        if (alive && s) {
          setAccount(s.account);
          attachEvents(s.provider);
          setPhase(s.chainId === BASE_SEPOLIA.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
        }
      } catch (e) { /* not connected yet */ }
      // A reload or MetaMask round-trip never creates a duplicate deployment.
      const p = readPending();
      if (alive && p) {
        setPendingTx(p.tx_hash);
        setStatus("Deployment submitted — waiting for confirmation…");
        setPhase("SUBMITTED");
        resumePending(p);
      }
    })();
    return () => {
      alive = false;
      if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    };
  }, []);

  // ——— connect (injected provider first, MetaMask Connect second) ———
  const connect = async () => {
    setError(""); setNotice("");
    try {
      setPhase("CONNECTING");
      setStatus("Connecting…");
      const s = await connectMetaMask();
      setAccount(s.account);
      attachEvents(s.provider);
      setStatus("");
      if (s.chainId !== BASE_SEPOLIA.chainIdHex) {
        setPhase("WRONG_NETWORK");
        return;
      }
      setPhase("CONNECTED");
      if (s.account.toLowerCase() !== CRXS.DEPLOYER.toLowerCase()) {
        setNotice("Connected wallet " + shortAddr(s.account) + " is NOT the approved deployment wallet. Switch MetaMask to " + shortAddr(CRXS.DEPLOYER) + " — deployment stays blocked until then.");
      }
    } catch (e) {
      setStatus("");
      setPhase("DISCONNECTED");
      if (e && e.code === 4001) setError("Connection rejected in MetaMask");
      else if (e && e.code === -32002) setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      else setError(String((e && e.message) || e));
    }
  };

  // ——— wrong network → Switch to Base Sepolia ———
  const switchNetwork = async () => {
    setError("");
    setSwitching(true);
    try {
      const id = await switchToBaseSepolia();
      setPhase(id === BASE_SEPOLIA.chainIdHex ? "CONNECTED" : "WRONG_NETWORK");
    } catch (e) {
      if (e && e.code === 4001) setError("Network switch rejected in MetaMask");
      else if (e && e.code === -32002) setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      else setError(String((e && e.message) || e));
    } finally {
      setSwitching(false);
    }
  };

  // ——— deploy: pre-flight → MetaMask signs → hash persisted → receipt → verify ———
  const deploy = async () => {
    // Duplicate protection: a pending transaction is resumed, never re-sent.
    const p = readPending();
    if (p) {
      setPendingTx(p.tx_hash);
      setStatus("Deployment submitted — waiting for confirmation…");
      setPhase("SUBMITTED");
      return resumePending(p);
    }
    setError(""); setNotice("");
    try {
      if (!account) throw new Error("Connect MetaMask first.");
      const id = await currentChainId();
      if (id !== BASE_SEPOLIA.chainIdHex) {
        setPhase("WRONG_NETWORK");
        throw new Error("Deployment blocked — the wallet is not on Base Sepolia.");
      }
      const data = buildDeployData(CRXS_CREATION_BYTECODE, CRXS.CONSTRUCTOR_ARG);
      setPhase("DEPLOYING");
      setStatus("Confirm deployment in MetaMask…");
      // Pre-flight: REAL gas estimate and wallet balance from the wallet itself.
      // Some MetaMask Mobile builds cannot estimate contract-creation transactions
      // ("error loading your gas estimation") — never block on that: fall back to
      // a static safe deployment gas cap and send it explicitly so MetaMask
      // skips its own estimation entirely. Unused gas is refunded by the protocol.
      let gasLimit;
      try {
        gasLimit = BigInt(await walletRequest("eth_estimateGas", [{ from: account, data, value: "0x0" }]));
      } catch (e) {
        gasLimit = 2000000n;
      }
      const price = BigInt(await walletRequest("eth_gasPrice", []));
      const balance = BigInt(await walletRequest("eth_getBalance", [account, "latest"]));
      if (balance < gasLimit * price) {
        throw new Error("Insufficient Base Sepolia ETH for deployment — fund the deployment wallet with Base Sepolia ETH first.");
      }
      // Send the COMPLETE fee parameters explicitly: gas limit + EIP-1559
      // maxFeePerGas / maxPriorityFeePerGas, with 2x headroom on the REAL RPC
      // base fee so they stay valid while you review the confirmation. MetaMask
      // then has nothing left to estimate — its own estimator (which fails on
      // contract-creation transactions) is never invoked.
      const maxFee = price * 2n;
      const maxPriority = price < 1000000000n ? price : 1000000000n;
      setStatus("Real estimate: " + gasLimit.toLocaleString("en-US") + " gas · max fee ≈ " + (Number(maxFee * gasLimit) / 1e18).toFixed(6) + " ETH — confirm in MetaMask…");
      // Contract creation: 'to' is omitted. The contract address comes only
      // from the confirmed receipt's contractAddress — never the sender.
      const txHash = await walletRequest("eth_sendTransaction", [{
        from: account,
        data,
        gas: "0x" + gasLimit.toString(16),
        maxFeePerGas: "0x" + maxFee.toString(16),
        maxPriorityFeePerGas: "0x" + maxPriority.toString(16),
        value: "0x0",
      }]);
      if (!isValidTxHash(txHash)) throw new Error("MetaMask did not return a valid transaction hash.");
      // Persist BEFORE anything else — the transaction hash is the idempotency
      // key; a reload resumes THIS transaction instead of sending another.
      savePending({ tx_hash: txHash, deployer: account, chain_id: BASE_SEPOLIA.chainId, saved_at: new Date().toISOString() });
      setPendingTx(txHash);
      setPhase("SUBMITTED");
      setStatus("Deployment submitted — waiting for confirmation…");
      const poll = await pollDeploymentReceipt(txHash);
      if (poll.status === "reverted") {
        throw new Error("The deployment transaction REVERTED on-chain — nothing was deployed. Explorer: https://sepolia.basescan.org/tx/" + txHash);
      }
      if (poll.status === "unknown") {
        throw new Error("The transaction was submitted but not confirmed within 5 minutes — status UNKNOWN. Check the explorer BEFORE trying again: https://sepolia.basescan.org/tx/" + txHash);
      }
      await finalize(txHash, poll.receipt, true);
    } catch (e) {
      setStatus("");
      const msg = String((e && e.message) || e);
      if (e && e.code === 4001) {
        setPhase("REJECTED");
        setError("Transaction rejected in MetaMask");
      } else if (e && e.code === -32002) {
        setPhase("FAILED");
        setError("MetaMask request already pending. Open MetaMask and complete or cancel it.");
      } else {
        setPhase("FAILED");
        setError("Deployment failed — see details: " + msg);
      }
    }
  };

  const deployLabel = phase === "DISCONNECTED" ? "Connect MetaMask"
    : phase === "WRONG_NETWORK" ? "Switch to Base Sepolia"
    : "Deploy CRXS to Base Sepolia (MetaMask will ask you to approve)";

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-4">
      <div>
        <p className="font-heading font-bold text-sm">OWNER DEPLOYMENT CONSOLE — sign with your own wallet</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          The app prepares the REAL deployment and opens MetaMask for your approval — on every device MetaMask Connect handles the transport itself. The app never signs, and never requests or stores your private key or seed phrase. Nothing is marked deployed until Base Sepolia confirms AND the server independently re-verifies the contract state.
        </p>
      </div>

      {/* ——— CONNECTION STATE MACHINE ——— */}
      <div className="rounded-xl border border-border bg-card p-3 text-[11px] space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Wallet</span>
          <span className="font-mono break-all text-right">{account ? "Connected: " + shortAddr(account) : "Disconnected"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Network</span>
          <span className={onBaseSepolia ? "text-emerald-400 font-semibold" : "text-yellow-500 font-semibold"}>{onBaseSepolia ? "Base Sepolia" : "Wrong network"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Deployment</span>
          <span className={alreadyDeployed || phase === "CONFIRMED" ? "text-emerald-400 font-semibold" : ""}>
            {alreadyDeployed || phase === "CONFIRMED" ? "DEPLOYED" : pendingTx ? "PENDING — " + shortAddr(pendingTx) : "NOT DEPLOYED"}
          </span>
        </div>
        <div className="pt-2 border-t border-border space-y-1">
          {phase === "DISCONNECTED" && (
            <p className="font-bold text-muted-foreground flex items-center gap-1.5"><PlugZap className="w-3.5 h-3.5" /> Connect MetaMask</p>
          )}
          {phase === "CONNECTING" && (
            <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</p>
          )}
          {phase === "CONNECTED" && (
            <p className="font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Connected — Base Sepolia verified{deployerOk ? " — approved deployment wallet" : ""}</p>
          )}
          {phase === "WRONG_NETWORK" && (
            <p className="font-bold text-yellow-500 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Wrong network — switch to Base Sepolia to continue</p>
          )}
          {phase === "DEPLOYING" && (
            <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirm deployment in MetaMask…</p>
          )}
          {phase === "SUBMITTED" && (
            <p className="text-primary font-semibold flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deployment submitted — waiting for confirmation…</p>
          )}
          {phase === "CONFIRMED" && (
            <p className="font-bold text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> CRXS deployed successfully</p>
          )}
          {phase === "REJECTED" && (
            <p className="font-bold text-destructive flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Transaction rejected in MetaMask</p>
          )}
          {phase === "FAILED" && (
            <p className="font-bold text-destructive flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Deployment failed — see details</p>
          )}
          {error && <p className="break-all">{error}</p>}
          {notice && <p className="break-all text-yellow-500">{notice}</p>}
          {(phase === "DISCONNECTED" || phase === "WRONG_NETWORK") && (
            <p className="text-muted-foreground">Approved deployment wallet: <span className="font-mono break-all">{CRXS.DEPLOYER}</span></p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        {PARAMS.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 text-[11px]">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="font-mono break-all text-right">{v}</span>
          </div>
        ))}
      </div>

      {!alreadyDeployed && (
        <>
          {(phase === "DISCONNECTED" || phase === "CONNECTING") && (
            <Button className="w-full" disabled={phase === "CONNECTING"} onClick={connect}>
              {phase === "CONNECTING" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {phase === "CONNECTING" ? "Connecting…" : "Connect MetaMask"}
            </Button>
          )}

          {phase === "WRONG_NETWORK" && (
            <Button className="w-full" disabled={switching} onClick={switchNetwork}>
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {switching ? "Switching…" : "Switch to Base Sepolia"}
            </Button>
          )}

          {phase === "CONNECTED" && (
            <>
              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                <span>{CONFIRM_TEXT}</span>
              </label>
              <Button className="w-full" disabled={!deployerOk || !confirmed} onClick={deploy}>
                {deployLabel}
              </Button>
              {!deployerOk && (
                <p className="text-[10px] text-yellow-500">
                  Deployment blocked — the connected account is not the approved deployment wallet.
                </p>
              )}
            </>
          )}

          <p className="text-[10px] text-muted-foreground">
            On MetaMask Mobile: open Explore/browser and enter {HOST}. MetaMask Connect handles every other device path automatically.
          </p>

          {status && (
            <p className="text-[11px] text-primary">{status}</p>
          )}
        </>
      )}

      {pendingTx && phase !== "CONFIRMED" && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-[11px] space-y-1">
          <p className="font-bold text-yellow-500">Deployment in flight — this page keeps watching the SAME transaction</p>
          <p className="font-mono break-all">{pendingTx}</p>
          <a href={BASE_SEPOLIA.explorer + "/tx/" + pendingTx} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
            View on BaseScan <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-[10px] text-muted-foreground">
            Reloading the page or switching into the MetaMask app never creates a second deployment — the transaction hash is the idempotency key.
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Gas: the real estimate is checked before the wallet is asked to sign (a fixed-supply ERC-20 deployment is typically around 1.1–1.4M gas). The app does not sign — MetaMask performs the signing, and the deployment is only marked successful after the chain confirms the receipt.
      </p>

      {alreadyDeployed && (
        <>
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-[11px] space-y-1">
            <p className="font-bold text-emerald-400">DEPLOYMENT SUCCESSFUL — verified server-side against Base Sepolia</p>
            <p>Network: {shown.network || "Base Sepolia"}</p>
            <p>Chain ID: {shown.chain_id}</p>
            <p>Deployer: <span className="font-mono break-all">{shown.deployer}</span></p>
            <p>Contract Address: <span className="font-mono break-all">{shown.contract_address}</span></p>
            <p>Transaction Hash: <span className="font-mono break-all">{shown.deployment_tx_hash}</span></p>
            <p>Decimals: {shown.decimals}</p>
            <p>Total Supply: {shown.total_supply_raw} <span className="text-muted-foreground">({fmt(Number(BigInt(shown.total_supply_raw || 0) / 10n ** 18n))} {shown.symbol || "CRXS"})</span></p>
            <p className="text-[10px] text-muted-foreground">Block {shown.block_number}{shown.gas_used ? " · gas used " + fmt(shown.gas_used) : ""} · verification status {shown.verification_status || "ONCHAIN_VERIFIED"} · testnet tokens have no monetary value.</p>
            <a href={shown.explorer_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
              View on BaseScan <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <CrxsAddToMetaMask contractAddress={shown.contract_address} />
          <CrxsTransferTest contractAddress={shown.contract_address} />
        </>
      )}
    </div>
  );
}