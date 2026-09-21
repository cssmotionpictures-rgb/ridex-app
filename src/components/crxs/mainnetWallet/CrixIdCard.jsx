import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, Loader2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { walletRequest } from "@/lib/metamaskConnect";

// CRIX ID — permanent human-readable payment identity, bound to a wallet the
// user PROVED control of with a signature the server verified. The wallet
// address can never be claimed by typing it.
export default function CrixIdCard({ account, identity, onVerified }) {
  const [input, setInput] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");

  const verifiedWallet = identity?.wallet_verified === true && identity?.wallet_address;
  const matchesConnected = !!account && verifiedWallet && account.toLowerCase() === verifiedWallet.toLowerCase();

  const claimOrChange = async () => {
    setError(""); setInfo("");
    const raw = input.trim();
    if (raw && !/^@?[a-z0-9_]{3,24}$/.test(raw.toLowerCase())) {
      setError("Crix ID must be 3-24 characters: lowercase letters, numbers, underscores.");
      return;
    }
    if (!account) { setError("Connect your wallet first."); return; }
    setWorking(true);
    try {
      // 1 — the server builds a single-use, expiring sign-in message
      const nonceRes = await base44.functions.invoke("crxs-wallet-verify", { action: "nonce", address: account });
      const d = nonceRes && nonceRes.data !== undefined ? nonceRes.data : nonceRes;
      if (!d || d.ok !== true) throw new Error((d && d.error) || "Could not start verification.");
      // 2 — the user signs it in their own wallet (it authorizes NOTHING)
      const signature = await walletRequest("personal_sign", [d.message, account]);
      // 3 — the server verifies the signature and binds the Crix ID
      const verifyRes = await base44.functions.invoke("crxs-wallet-verify", {
        address: account, signature, crix_id: raw || undefined,
      });
      const v = verifyRes && verifyRes.data !== undefined ? verifyRes.data : verifyRes;
      if (!v || v.ok !== true) throw new Error((v && v.error) || "Verification failed.");
      setInfo(v.identity.crix_id
        ? "Crix ID " + v.identity.crix_id + " is yours — bound to the wallet you just proved."
        : "Wallet verified.");
      setInput("");
      if (onVerified) onVerified();
    } catch (e) {
      if (e && e.code === 4001) setError("Signature rejected in MetaMask — nothing was claimed.");
      else setError(String((e && e.message) || e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Crix ID — your permanent payment identity</p>

      {verifiedWallet ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 space-y-1.5">
          <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
            <BadgeCheck className="w-4 h-4" /> {identity.crix_id || "Wallet verified — no Crix ID yet"}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono break-all">{identity.wallet_address}</p>
          {matchesConnected ? (
            <p className="text-[10px] text-muted-foreground">Verified against the connected wallet — senders can pay this Crix ID.</p>
          ) : (
            <p className="text-[10px] text-yellow-500">The connected wallet differs from your verified wallet — re-verify to use the Crix ID with this wallet.</p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Claim your @username (e.g. @bushbaby). MetaMask will ask you to sign a plain sign-in message — it only proves you control this wallet; it does NOT move funds or authorize any transaction. The server verifies the signature before the Crix ID is yours.
        </p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="@username"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={working || !account}
        />
        <Button disabled={working || !account} onClick={claimOrChange}>
          {working ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {verifiedWallet ? "Change" : "Verify & claim"}
        </Button>
      </div>

      {!account && <p className="text-[10px] text-muted-foreground">Connect your wallet to claim a Crix ID.</p>}
      {error && <p className="text-[11px] text-destructive flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}
      {info && <p className="text-[11px] text-emerald-400">{info}</p>}
    </div>
  );
}