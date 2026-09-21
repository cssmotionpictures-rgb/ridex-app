import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  connectWallet, ensureBaseSepolia, encodeTransferData, sendTransferTransaction,
  pollDeploymentReceipt, extractTransferEvent, readAddressBalance,
} from "@/lib/crxsChain";

const ZERO = "0x0000000000000000000000000000000000000000";

// ON-CHAIN TRANSFER TEST — sends a small CRXS amount from the owner's wallet
// (MetaMask signs, never the app), waits for the real block confirmation,
// verifies balances + the Transfer event straight from the chain, then the
// server independently re-verifies and indexes the transfer. Nothing here is
// simulated or fabricated.
export default function CrxsTransferTest({ contractAddress }) {
  const [recipient, setRecipient] = React.useState("");
  const [amountWhole, setAmountWhole] = React.useState("1");
  const [phase, setPhase] = React.useState("idle");
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const [checks, setChecks] = React.useState(null);
  const busy = ["sending", "pending", "verifying", "indexing"].includes(phase);

  const run = async () => {
    setError(""); setChecks(null);
    const to = recipient.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return setError("Enter a valid recipient wallet address.");
    if (to.toLowerCase() === ZERO) return setError("The zero address is never a valid recipient.");
    if (!/^\d+$/.test(amountWhole.trim()) || BigInt(amountWhole.trim()) <= 0n) {
      return setError("Enter a small whole-number CRXS amount (e.g. 1).");
    }
    try {
      setPhase("sending");
      setStatus("Connecting your wallet…");
      const from = await connectWallet();
      await ensureBaseSepolia();
      const amountRaw = (BigInt(amountWhole.trim()) * 10n ** 18n).toString();

      setStatus("Reading both balances straight from the chain…");
      const senderBefore = await readAddressBalance(contractAddress, from);
      const toBefore = await readAddressBalance(contractAddress, to);

      setStatus("Opening the transfer in your wallet — review and sign in MetaMask.");
      const data = encodeTransferData(to, amountRaw);
      const txHash = await sendTransferTransaction({ from, to: contractAddress, data });

      setPhase("pending");
      setStatus("Transfer submitted — waiting for the real block confirmation (" + txHash.slice(0, 12) + "…).");
      const poll = await pollDeploymentReceipt(txHash);
      if (poll.status === "reverted") {
        throw new Error("The transfer REVERTED on-chain — nothing moved. TX: " + txHash);
      }
      if (poll.status === "unknown") {
        throw new Error("Transfer not confirmed within 5 minutes — check it on the explorer before retrying. TX: " + txHash);
      }

      setPhase("verifying");
      setStatus("Verifying balances and the Transfer event from the chain…");
      const event = extractTransferEvent(poll.receipt, contractAddress);
      const senderAfter = await readAddressBalance(contractAddress, from);
      const toAfter = await readAddressBalance(contractAddress, to);
      const results = {
        txHash,
        eventFound: !!event,
        senderIsSigner: event ? event.from === from.toLowerCase() : false,
        recipientMatches: event ? event.to === to.toLowerCase() : false,
        amountMatches: event ? event.amountRaw === amountRaw : false,
        senderDecreased: BigInt(senderAfter) === BigInt(senderBefore) - BigInt(amountRaw),
        recipientIncreased: BigInt(toAfter) === BigInt(toBefore) + BigInt(amountRaw),
      };
      setChecks(results);
      if (!results.eventFound || !results.senderDecreased || !results.recipientIncreased) {
        throw new Error("On-chain verification of the transfer failed — see the checklist. TX: " + txHash);
      }

      setPhase("indexing");
      setStatus("Indexing the transfer — the server now independently re-verifies it against the chain…");
      const raw = await base44.functions.invoke("crxs-transfer-verify", { tx_hash: txHash });
      const res = raw && raw.data !== undefined ? raw.data : raw;
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || "Server-side transfer verification failed — nothing was indexed.");
      }
      setChecks({ ...results, indexed: true, indexedTransfer: res.transfer });
      setStatus("");
      setPhase("done");
    } catch (e) {
      setStatus("");
      setPhase("failed");
      setError(String((e && e.message) || e));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="font-heading font-bold text-sm flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" /> ON-CHAIN TRANSFER TEST — MetaMask signs</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Send a small CRXS amount from your wallet to a second test wallet. Balances and the Transfer event are verified straight from Base Sepolia, then the server independently re-verifies and indexes the transfer. Your key is never requested.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs" htmlFor="crxs-test-recipient">Recipient test wallet address</Label>
          <Input id="crxs-test-recipient" className="rounded-xl mt-1 font-mono text-xs" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs" htmlFor="crxs-test-amount">Amount (whole CRXS)</Label>
          <Input id="crxs-test-amount" className="rounded-xl mt-1" value={amountWhole} onChange={(e) => setAmountWhole(e.target.value)} />
        </div>
      </div>

      <Button className="w-full" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {busy ? "Working — watch your wallet and the status below" : "Send test transfer"}
      </Button>

      {busy && status && <p className="text-[11px] text-primary">{status}</p>}

      {phase === "failed" && error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[11px] text-destructive">
          <p className="font-bold">TRANSFER TEST FAILED — nothing was indexed.</p>
          <p className="mt-1 break-all">{error}</p>
        </div>
      )}

      {checks && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3 text-[11px] space-y-1.5">
          <p className="font-bold uppercase tracking-wider text-muted-foreground">On-chain verification checklist</p>
          <Check ok={checks.eventFound} label="Transfer event emitted by the contract" />
          <Check ok={checks.senderIsSigner} label="Event sender is your signing wallet" />
          <Check ok={checks.recipientMatches} label="Event recipient matches the entered address" />
          <Check ok={checks.amountMatches} label="Event amount matches the sent amount" />
          <Check ok={checks.senderDecreased} label="Your balance decreased by the exact amount" />
          <Check ok={checks.recipientIncreased} label="Recipient balance increased by the exact amount" />
          {checks.indexed !== undefined && <Check ok={checks.indexed} label="Indexer recorded the transfer (server-verified)" />}
          {checks.indexed && checks.indexedTransfer && (
            <p className="text-[10px] text-muted-foreground pt-1 break-all">
              Indexed: {checks.indexedTransfer.amount_display} → {checks.indexedTransfer.to_address} · block {checks.indexedTransfer.block_number} · {checks.indexedTransfer.tx_hash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Check({ ok, label }) {
  return (
    <p className="flex items-start gap-1.5">
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />}
      <span className={ok ? "" : "text-destructive"}>{label}</span>
    </p>
  );
}