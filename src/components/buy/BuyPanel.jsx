import React from "react";
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, TrendingUp } from "lucide-react";
import { ethStringToWei, fmtCrxs, quoteBuyLive, pad32, SEL, CURVE, waitForReceipt } from "@/lib/buyCurveClient";

const CHIPS = ["0.0002", "0.0003", "0.0005", "0.001", "0.01"];

// BUY panel — ETH in, CRXS out, straight from the bonding curve. The quote is
// read live from the contract and the buy is protected by a 2% minimum-out check.
export default function BuyPanel({ stats, wallet, onDone }) {
  const [amount, setAmount] = React.useState("0.0003");
  const [quote, setQuote] = React.useState(null);
  const [quoting, setQuoting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [txHash, setTxHash] = React.useState("");
  const errRef = React.useRef(null);

  React.useEffect(() => {
    if (error && errRef.current) errRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const graduated = !!(stats && stats.graduated);

  React.useEffect(() => {
    setError("");
    setQuote(null);
    const wei = ethStringToWei(amount);
    if (wei === null || wei <= 0n || graduated) return;
    let alive = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteBuyLive(wei);
        if (alive) setQuote({ ...q, ethIn: wei });
      } catch (e) { if (alive) setError(e.message || String(e)); }
      finally { if (alive) setQuoting(false); }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [amount, graduated]);

  const buy = async () => {
    setError(""); setStatus(""); setTxHash("");
    if (!quote || !wallet.account || !wallet.onBase || busy) return;
    const ethWei = ethStringToWei(amount);
    if (ethWei === null || ethWei <= 0n) { setError("Enter a valid ETH amount first."); return; }
    setBusy(true);
    try {
      // Re-quote right before signing so the minimum-out guard is tight.
      const q = await quoteBuyLive(ethWei);
      if (q.tokensOut <= 0n) throw new Error("The curve could not quote this amount — it may be too small. Try a slightly larger amount.");
      const minOut = q.tokensOut * 98n / 100n; // 2% slippage guard — the contract reverts below this
      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet.account, to: CURVE, value: "0x" + ethWei.toString(16), data: SEL.buy + pad32(minOut), gas: "0x493e0" }],
      });
      setTxHash(hash);
      setStatus("Confirming on Base Mainnet…");
      const receipt = await waitForReceipt(hash);
      if (!receipt) { setStatus("Still confirming — it can take a minute on Base. Track the transaction on BaseScan below."); return; }
      if (receipt.status === "0x1") {
        setStatus("Confirmed — your CRXS is in your wallet.");
        onDone && onDone();
      } else {
        setStatus("");
        setError("The transaction reverted on chain — nothing was spent except a small gas fee. The price may have moved past the slippage guard; try again.");
      }
    } catch (e) {
      if (e && e.code === 4001) setError("You cancelled the transaction in your wallet — nothing was sent.");
      else setError((e && e.message) || String(e));
    } finally {
      setBusy(false);
    }
  };

  const canBuy = !!quote && !!wallet.account && wallet.onBase && !busy && !graduated;
  const feePct = quote ? (Number(quote.fee) / Number(quote.ethIn) * 100).toFixed(2) : "1";

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-sm font-semibold">Amount of ETH to spend</p>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-3 focus-within:border-primary/60">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0005"
          className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-lg"
        />
        <span className="text-sm font-bold text-muted-foreground">ETH</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => setAmount(c)}
            className={"px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors " + (amount === c ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground")}>
            {c} ETH
          </button>
        ))}
      </div>

      {graduated ? (
        <p className="text-xs text-yellow-400 mt-3">The curve has graduated — trading has moved to the DEX pool. Buying here is closed.</p>
      ) : quote ? (
        <div className="mt-3 rounded-xl border border-primary/25 bg-primary/10 p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">You receive ≈</p>
          <p className="font-display font-extrabold text-xl gold-text mt-0.5">{fmtCrxs(quote.tokensOut)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Live quote from the curve · includes the {feePct}% buy fee · protected against 2% slippage.</p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
          {quoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
          {quoting ? "Reading live quote from the curve…" : "Enter an ETH amount to see your live quote."}
        </p>
      )}

      <ActionButtons wallet={wallet} enabled={canBuy} busy={busy} label={quote ? "Buy CRXS" : "Enter an ETH amount"} busyLabel="Confirm in your wallet…" onClick={buy} icon={ShieldCheck} />
      <ConnectedLine wallet={wallet} />
      <Messages error={error || wallet.error} status={status} txHash={txHash} errRef={errRef} />
    </div>
  );
}

// ——— Shared pieces used by both panels ———

export function ActionButtons({ wallet, enabled, busy, label, busyLabel, onClick, icon: Icon }) {
  if (!wallet.account || !wallet.onBase) {
    return (
      <button
        onClick={wallet.connect}
        disabled={wallet.connecting}
        className="w-full mt-3 rounded-xl border border-border bg-secondary/70 py-3 font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {wallet.connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {wallet.connecting ? "Connecting…" : !wallet.account ? "Connect wallet" : "Switch to Base network"}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="w-full mt-3 rounded-xl bg-primary text-primary-foreground py-3 font-display font-bold text-sm shadow-lg shadow-primary/30 disabled:opacity-45 flex items-center justify-center gap-2"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {busy ? busyLabel : label}
    </button>
  );
}

export function ConnectedLine({ wallet }) {
  if (!wallet.account || !wallet.onBase) return null;
  return <p className="text-[10px] text-muted-foreground mt-2 text-center">Connected · {wallet.account.slice(0, 6)}…{wallet.account.slice(-4)} · Base Mainnet</p>;
}

export function Messages({ error, status, txHash, errRef }) {
  return (
    <>
      {error && (
        <p ref={errRef} className="text-xs text-destructive mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}
      {status && (
        <p className="text-xs text-emerald-400 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {status}
        </p>
      )}
      {txHash && (
        <div className="mt-3 rounded-lg border border-border bg-secondary/50 p-2.5 text-[11px] break-all">
          Transaction: <span className="font-mono">{txHash.slice(0, 18)}…{txHash.slice(-8)}</span>
          <a href={"https://basescan.org/tx/" + txHash} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 ml-1">
            BaseScan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </>
  );
}