import React from "react";
import { base44 } from "@/api/base44Client";
import { callCrxsEngine } from "@/lib/crxsEngine";
import { Coins, Copy, Check, Loader2, Fingerprint, AlertTriangle } from "lucide-react";

// MY CRIXCOIN ADDRESS — the user's permanent CRIXCOIN address, created once and
// kept forever. Works through the dual-path engine: the platform backend is
// tried first, and while its function is not deployed the safe external engine
// (idempotent address creation, no funds can move) handles it. The record is
// written to the user's own row only — evidence from real responses only.
export default function CrxsEngineAccountCard() {
  const [user, setUser] = React.useState(null);
  const [account, setAccount] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const loadAccount = React.useCallback((userId) => {
    if (!userId) { setLoading(false); return; }
    base44.entities.CrxsSmartAccount.filter({ user_id: userId })
      .then((rows) => setAccount((rows || [])[0] || null))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u && u.id) loadAccount(u.id); else setLoading(false);
    }).catch(() => setLoading(false));
  }, [loadAccount]);

  const createAccount = async () => {
    if (!user || !user.id || creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await callCrxsEngine("crxs-smart-account", { user_id: user.id });
      if (!result || !result.account_address) throw new Error("No address was returned");
      // Record the user's OWN row only (enforced by the security rule) —
      // with the server-side evidence from the real live response.
      const saved = await base44.entities.CrxsSmartAccount.create({
        user_id: user.id,
        owner_address: result.owner_address || "",
        account_name: result.account_name || "crixcoin-user-" + user.id,
        account_address: result.account_address,
        network: "base",
        chain_id: 8453,
        status: "CREATED",
        evidence_json: JSON.stringify(result.evidence || []),
        failure_reason: "",
      });
      setAccount(saved);
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setCreating(false);
    }
  };

  const copyAddress = async () => {
    if (!account || !account.account_address) return;
    try {
      await navigator.clipboard.writeText(account.account_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { /* clipboard unavailable */ }
  };

  const address = account && account.status === "CREATED" && account.account_address ? account.account_address : "";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Fingerprint className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="font-heading font-bold text-sm sm:text-base">My CRIXCOIN Address</p>
            <p className="text-[11px] text-muted-foreground">Permanent — created once, kept forever</p>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
      </div>

      {address ? (
        <div className="mt-4 space-y-2">
          <button
            onClick={copyAddress}
            className="w-full group rounded-xl border border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your CRIXCOIN address</p>
            <p className="font-mono text-[11px] sm:text-xs break-all leading-relaxed text-primary">{address}</p>
          </button>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Check className="w-3 h-3 text-emerald-400" /> Verified &amp; recorded{copied ? " — copied!" : ""}
            </p>
            <button onClick={copyAddress} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
              <Copy className="w-3 h-3" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your CRIXCOIN address is your permanent identity for the CRIXCOIN network — you use it to receive CRIXCOIN from anyone, forever. Creating it now means you are first in line when the network launches.
          </p>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive leading-relaxed">{error}</p>
            </div>
          )}
          <button
            onClick={createAccount}
            disabled={creating || !user}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {creating ? "Creating…" : "Get my CRIXCOIN address"}
          </button>
        </div>
      )}
    </div>
  );
}