import React from "react";
import { Loader2, Banknote } from "lucide-react";
import {
  crxsStringToRaw, fmtCrxs, fmtEth, quoteSellLive, pad32, padAddress, SEL, CURVE, CRXS_TOKEN,
  readTokenBalance, readTokenAllowance, waitForReceipt,
} from "@/lib/buyCurveClient";
import { ActionButtons, ConnectedLine, Messages } from "@/components/buy/BuyPanel";

// SELL panel — CRXS back to the curve, ETH out from the real reserve. The curve
// requires an ERC-20 approve before the sell, so both signatures happen here.
// While the ETH reserve is 0 (before the first buy) selling is honestly closed.
export default function SellPanel({ stats, wallet, onDone }) {
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState(null);
  const [quoting, setQuoting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [txHashes, setTxHashes] = React.useState([]);
  const [balance, setBalance] = React.useState(null);
  const errRef = React.useRef(null);

  React.useEffect(() => {
    if (error && errRef.current) errRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const reserveOpen = !!(stats && stats.eth > 0n);
  const graduated = !!(stats && stats.graduated);

  // Load the wallet's live CRXS balance once a wallet is connected on Base.
  React.useEffect(() => {
    setBalance(null);
    if (!wallet.account || !wallet.onBase) return;
    let alive = true;
    readTokenBalance(wallet.account)
      .then((b) => { if (alive) setBalance(b); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wallet.account, wallet.onBase, txHashes]);

  React.useEffect(() => {
    setError("");
    setQuote(null);
    const raw = crxsStringToRaw(amount);
    if (raw === null || raw <= 0n || !reserveOpen || graduated) return;
    let alive = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteSellLive(raw);
        if (alive) setQuote({ ...q, tokenIn: raw });
      } catch (e) { if (alive) setError(e.message || String(e)); }
      finally { if (alive) setQuoting(false); }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [amount, reserveOpen, graduated]);

  const sell = async () => {
    setError(""); setStatus(""); setTxHashes([]);
    if (!quote || !wallet.account || !wallet.onBase || busy) return;
    const raw = crxsStringToRaw(amount);
    if (raw === null || raw <= 0n) { setError("Enter a valid CRXS amount first."); return; }
    setBusy(true);
    try {
      const owned = await readTokenBalance(wallet.account);
      if (owned < raw) throw new Error("Your wallet holds " + fmtCrxs(owned) + " — less than the amount you entered.");

      const allowed = await readTokenAllowance(wallet.account, CURVE);
      const hashes = [];
      if (allowed < raw) {
        setStatus("Step 1 of 2 — approve the curve to receive your CRXS…");
        const approveHash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from: wallet.account, to: CRXS_TOKEN, data: SEL.approve + padAddress(CURVE) + pad32(raw), gas: "0x493e0" }],
        });
        hashes.push(approveHash);
        setTxHashes([...hashes]);
        const approveReceipt = await waitForReceipt(approveHash);
        if (!approveReceipt) { setStatus("Still confirming the approval — check BaseScan below, then tap Sell again."); return; }
        if (approveReceipt.status !== "0x1") throw new Error("The approval transaction reverted — nothing was sold. Try again.");
      }

      // Re-quote and sign the sell with a 2% minimum-ETH-out guard.
      const q = await quoteSellLive(raw);
      if (q.ethOut <= 0n) throw new Error("The curve could not quote this sell — the reserve may have moved. Refresh and try again.");
      const minEthOut = q.ethOut * 98n / 100n;
      setStatus("Step 2 of 2 — confirm the sell and receive your ETH…");
      const sellHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet.account, to: CURVE, data: SEL.sell + pad32(raw) + pad32(minEthOut), gas: "0x493e0" }],
      });
      hashes.push(sellHash);
      setTxHashes([...hashes]);
      setStatus("Confirming on Base Mainnet…");
      const receipt = await waitForReceipt(sellHash);
      if (!receipt) { setStatus("Still confirming — it can take a minute on Base. Track the transaction on BaseScan below."); return; }
      if (receipt.status === "0x1") {
        setStatus("Confirmed — " + fmtEth(q.ethOut) + " ETH is back in your wallet.");
        onDone && onDone();
      } else {
        setStatus("");
        setError("The sell reverted on chain — your CRXS and approval are safe (only a small gas fee was spent). The reserve may have moved; refresh and try again.");
      }
    } catch (e) {
      if (e && e.code === 4001) setError("You cancelled the transaction in your wallet — nothing was sent.");
      else setError((e && e.message) || String(e));
    } finally {
      setBusy(false);
    }
  };

  const canSell = !!quote && !!wallet.account && wallet.onBase && !busy && reserveOpen && !graduated;

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-sm font-semibold">Amount of CRXS to sell</p>
      {balance !== null && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Your balance: <button className="text-primary font-semibold" onClick={() => setAmount((Number(balance) / 1e18).toString())}>{fmtCrxs(balance)}</button>
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-3 focus-within:border-primary/60">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="1000"
          className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-lg"
        />
        <span className="text-sm font-bold text-muted-foreground">CRXS</span>
      </div>

      {graduated ? (
        <p className="text-xs text-yellow-400 mt-3">The curve has graduated — trading has moved to the DEX pool. Selling here is closed.</p>
      ) : !reserveOpen ? (
        <p className="text-xs text-yellow-400 mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2.5">
          Selling opens with the first buy — the ETH deposited by buyers is the reserve that backs every sell. Until then there is no ETH in the curve to pay out.
        </p>
      ) : quote ? (
        <div className="mt-3 rounded-xl border border-primary/25 bg-primary/10 p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">You receive ≈</p>
          <p className="font-display font-extrabold text-xl gold-text mt-0.5">{fmtEth(quote.ethOut)} ETH</p>
          <p className="text-[11px] text-muted-foreground mt-1">Live quote from the curve · includes the 1% sell fee · protected against 2% slippage.</p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
          {quoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
          {quoting ? "Reading live quote from the curve…" : "Enter a CRXS amount to see your live ETH quote."}
        </p>
      )}

      <ActionButtons wallet={wallet} enabled={canSell} busy={busy} label={quote ? "Sell CRXS" : "Enter a CRXS amount"} busyLabel="Confirm in your wallet…" onClick={sell} icon={Banknote} />
      <ConnectedLine wallet={wallet} />
      <Messages error={error || wallet.error} status={status} txHash={txHashes.length ? txHashes[txHashes.length - 1] : ""} errRef={errRef} />
      {txHashes.length > 1 && (
        <div className="mt-2 rounded-lg border border-border bg-secondary/50 p-2.5 text-[11px] break-all">
          Approval: <span className="font-mono">{txHashes[0].slice(0, 14)}…{txHashes[0].slice(-6)}</span>
          <a href={"https://basescan.org/tx/" + txHashes[0]} target="_blank" rel="noopener" className="text-primary ml-1">BaseScan</a>
        </div>
      )}
    </div>
  );
}