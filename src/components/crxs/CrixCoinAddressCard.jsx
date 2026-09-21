import React from "react";
import { base44 } from "@/api/base44Client";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ExternalLink, Fingerprint, Loader2, Wallet, AlertTriangle, ShieldCheck } from "lucide-react";
import { prepareCrixCoinAddress } from "@/lib/crixAddress";

// MY CRIXCOIN ADDRESS — permanent, Coinbase-free, created in the user's own
// browser. The address is derived by the official Basescan-verified smart
// account factory on Base Mainnet; the owner key stays in the user's wallet,
// and every registration is independently re-verified on-chain by the server
// before it is recorded. Fail-closed: any failed check creates nothing.
export default function CrixCoinAddressCard() {
  const [user, setUser] = React.useState(null);
  const [account, setAccount] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [step, setStep] = React.useState("");
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const errorRef = React.useRef(null);

  // Auto-scroll an error into view when it lands off-screen (mobile reach).
  React.useEffect(() => {
    if (error && errorRef.current) errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (!u || !u.id) { setLoading(false); return; }
      base44.entities.CrxsSmartAccount.filter({ user_id: u.id })
        .then((rows) => setAccount((rows || [])[0] || null))
        .catch(() => setAccount(null))
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!user || !user.id || creating) return;
    setCreating(true);
    setError("");
    try {
      setStep("Connecting your wallet…");
      const prepared = await prepareCrixCoinAddress(user.id);
      setStep("Confirming ownership on Base…");
      let data = null;
      try {
        const res = await base44.functions.invoke("crix-address-register", {
          owner_address: prepared.owner,
          signature: prepared.signature,
        });
        data = res && typeof res === "object" && res.crixcoin_address ? res : (res && res.data && typeof res.data === "object" ? res.data : null);
      } catch (platformError) {
        // Deploy-pipeline outage fallback: the temporary crix-bridge Worker runs
        // the SAME server-side signature recovery + factory re-derivation, and
        // the app records the user's OWN verified row. Fail-closed: no verified
        // result, no record. The moment the platform function deploys, this
        // fallback stops being used automatically.
        const msg = String((platformError && platformError.message) || platformError);
        if (!/not found|404|does not exist|no such function|function is not|failed to fetch/i.test(msg)) throw platformError;
        const customCall = base44.integrations && base44.integrations.custom && typeof base44.integrations.custom.call === "function" ? base44.integrations.custom.call : null;
        if (!customCall) throw platformError;
        setStep("Confirming ownership (verification bridge)…");
        const response = await customCall("crix-bridge", "post:/wallet/address/verify", {
          payload: { user_id: user.id, owner_address: prepared.owner, signature: prepared.signature },
        });
        const bd = response && response.success ? response.data : null;
        if (!bd || !bd.crixcoin_address) {
          throw new Error(String((bd && bd.error) || "The address could not be verified right now. Nothing was created."));
        }
        await base44.entities.CrxsSmartAccount.create({
          user_id: user.id,
          owner_address: bd.owner_address,
          account_name: bd.account_name,
          account_address: bd.crixcoin_address,
          network: "base",
          chain_id: 8453,
          status: "CREATED",
          evidence_json: JSON.stringify(bd.evidence || []),
        });
        data = bd;
      }
      if (!data || !data.crixcoin_address) {
        throw new Error("The address could not be verified right now. Nothing was created.");
      }
      const rows = await base44.entities.CrxsSmartAccount.filter({ user_id: user.id });
      setAccount((rows || [])[0] || null);
      setStep("");
    } catch (e) {
      setError(String((e && e.message) || e));
      setStep("");
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
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <div className="shrink-0 rounded-xl bg-white p-2 self-start">
              <QRCodeSVG value={address} size={72} level="M" />
            </div>
            <button
              onClick={copyAddress}
              className="min-w-0 flex-1 group rounded-xl border border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
            >
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your CRIXCOIN address (Base)</p>
              <p className="font-mono text-[11px] sm:text-xs break-all leading-relaxed text-primary">{address}</p>
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Verified on-chain{copied ? " — copied!" : ""}
            </p>
            <div className="flex items-center gap-2.5">
              <button onClick={copyAddress} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={"https://basescan.org/address/" + address}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="w-3 h-3" /> Explorer
              </a>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Internal Crix transfers never touch the blockchain — no gas, no network fee. External blockchain transfers are paused until the CRXS rails open.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your CRIXCOIN address is your permanent identity on the CRIXCOIN network — it is derived right here in your browser from your own wallet by the official Base smart-account factory. Your keys never leave your wallet, and no third party holds your account.
          </p>
          {error && (
            <div ref={errorRef} className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive leading-relaxed">{error}</p>
            </div>
          )}
          <button
            onClick={create}
            disabled={creating || !user}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {creating ? (step || "Creating…") : "Connect wallet & get my address"}
          </button>
        </div>
      )}
    </div>
  );
}