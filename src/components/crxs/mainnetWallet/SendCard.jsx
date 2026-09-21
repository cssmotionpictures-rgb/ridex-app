import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { walletRequest, currentChainId } from "@/lib/metamaskConnect";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";
import { encodeTransferData, sendTransferTransaction, pollDeploymentReceipt } from "@/lib/crxsChain";
import { parseCrxsAmount, formatRawAmount } from "./amount";

// SEND CRXS — full honest lifecycle: SIGNING → SUBMITTED → PENDING →
// CONFIRMED / REVERTED / FAILED / UNKNOWN. "Confirmed" is ONLY ever shown
// after the real chain receipt confirms the transaction. Blocked until the
// verified production contract exists and the wallet is on Base MAINNET.
export default function SendCard({ account, onMainnet, contractAddress, onSent }) {
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [review, setReview] = React.useState(null); // {address, crixId, known, raw, gasCostEth}
  const [error, setError] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [tx, setTx] = React.useState(null); // {status, hash}

  const deployed = !!contractAddress;

  const resolveAndQuote = async () => {
    setError(""); setReview(null);
    if (!deployed) { setError("Sending is temporarily unavailable."); return; }
    const r = recipient.trim();
    const raw = parseCrxsAmount(amount);
    if (!raw || !(raw !== "0")) { setError("Enter a valid CRXS amount."); return; }
    let address = "", crixId = null;
    try {
      if (r.startsWith("@")) {
        const rows = await base44.entities.CrixWalletIdentity.filter({ crix_id: r.toLowerCase(), wallet_verified: true });
        const row = (rows || [])[0];
        if (!row) { setError("No verified Crix ID " + r.toLowerCase() + " — check the spelling."); return; }
        address = row.wallet_address; crixId = r.toLowerCase();
      } else if (/^0x[0-9a-fA-F]{40}$/.test(r)) {
        address = r.toLowerCase();
        const rows = await base44.entities.CrixWalletIdentity.filter({ wallet_address: address, wallet_verified: true });
        if ((rows || [])[0]) crixId = rows[0].crix_id;
      } else {
        setError("Enter a wallet address (0x…) or a Crix ID (@username).");
        return;
      }
      const data = encodeTransferData(address, raw);
      const gasLimit = BigInt(await walletRequest("eth_estimateGas", [{ from: account, to: contractAddress, data, value: "0x0" }]));
      const price = BigInt(await walletRequest("eth_gasPrice", []));
      setReview({
        address, crixId, known: !!crixId, raw,
        gasLimit: gasLimit.toLocaleString("en-US"),
        gasCostEth: Number(gasLimit * price) / 1e18,
      });
    } catch (e) {
      setError("Could not prepare the transfer: " + String((e && e.message) || e));
    }
  };

  const send = async () => {
    if (!review) return;
    setError(""); setWorking(true);
    setTx({ status: "SIGNING" });
    try {
      const cid = await currentChainId();
      if (cid !== BASE_MAINNET.chainIdHex) { setTx(null); setError("Your wallet is on the wrong network — switch it and try again."); return; }
      const data = encodeTransferData(review.address, review.raw);
      const hash = await sendTransferTransaction({ from: account, to: contractAddress, data });
      setTx({ status: "SUBMITTED", hash });
      const poll = await pollDeploymentReceipt(hash);
      setTx({
        status: poll.status === "confirmed" ? "CONFIRMED" : poll.status === "reverted" ? "REVERTED" : "UNKNOWN",
        hash,
      });
      if (onSent) onSent();
    } catch (e) {
      if (e && e.code === 4001) setTx({ status: "FAILED", reason: "Rejected in MetaMask — nothing was sent." });
      else setTx({ status: "FAILED", reason: String((e && e.message) || e) });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Send CRXS</p>

      {!deployed && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-[11px] text-yellow-500 space-y-1">
          <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> SENDING IS NOT ACTIVE YET</p>
          <p>Sending activates automatically when the CRIXCOIN network launches. You can connect your wallet and claim your Crix ID now.</p>
        </div>
      )}

      {deployed && (
        <>
          <div className="space-y-2">
            <Input placeholder="Recipient — 0x… or @crixid" value={recipient} onChange={(e) => { setRecipient(e.target.value); setReview(null); }} disabled={working} />
            <Input placeholder="Amount (CRXS)" value={amount} onChange={(e) => { setAmount(e.target.value); setReview(null); }} disabled={working} inputMode="decimal" />
          </div>

          {review && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-1 text-[11px]">
              <p className="font-bold text-primary mb-1">Review your transfer</p>
              <div className="grid gap-1">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Recipient</span><span className="font-mono break-all text-right">{review.crixId ? review.crixId + " · " : ""}{review.address}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Amount</span><span className="font-mono">{formatRawAmount(review.raw)} CRXS</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Estimated network cost</span><span className="font-mono">≈{review.gasCostEth.toFixed(6)} ETH</span></div>
              </div>
              {!review.known && (
                <p className="text-[10px] text-yellow-500 pt-1">This address has no verified Crix ID — an unknown destination. Double-check every character before approving in MetaMask.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={working || !account} onClick={resolveAndQuote}>Review transfer</Button>
            <Button disabled={working || !review || !onMainnet} onClick={send}>
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {review ? "Send (MetaMask asks)" : "Send"}
            </Button>
          </div>
          {!onMainnet && account && <p className="text-[10px] text-yellow-500">Sending is unavailable until your wallet is switched to the right network.</p>}

          {tx && (
            <div className={"rounded-xl border p-3 text-[11px] space-y-1 " + (tx.status === "CONFIRMED" ? "border-emerald-400/40 bg-emerald-400/10" : tx.status === "REVERTED" || tx.status === "FAILED" ? "border-destructive/40 bg-destructive/10" : "border-yellow-500/40 bg-yellow-500/10")}>
              <p className="font-bold">Transaction: {tx.status}</p>
              {tx.hash && <p className="font-mono break-all">{tx.hash}</p>}
              {tx.hash && <a href={BASE_MAINNET.explorer + "/tx/" + tx.hash} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">View on BaseScan <ExternalLink className="w-3 h-3" /></a>}
              {tx.status === "UNKNOWN" && <p className="text-[10px] text-muted-foreground">Your transfer was sent and is still processing — check it on BaseScan for the latest status.</p>}
              {tx.status === "FAILED" && <p className="text-[10px]">{tx.reason}</p>}
              {tx.status !== "CONFIRMED" && <p className="text-[10px] text-muted-foreground">Your transfer only shows as completed after the network confirms it.</p>}
            </div>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-destructive flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}
    </div>
  );
}