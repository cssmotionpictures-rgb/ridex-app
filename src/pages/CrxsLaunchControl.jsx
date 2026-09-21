import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import { base44 } from "@/api/base44Client";
import CrxsDeployPanel from "@/components/crxs/CrxsDeployPanel";
import CrxsDeploymentFacts from "@/components/crxs/CrxsDeploymentFacts";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Ban, ExternalLink, Lock } from "lucide-react";

// CRXS LAUNCH CONTROL — every field shows the REAL state. Nothing here is
// filled with placeholder success: anything not yet real is NOT AVAILABLE,
// UNVERIFIED, or WAITING FOR HUMAN ACTION / GAS / SIGNATURE.

const STATES = [
  { name: "INTERNAL LEDGER", note: "Live — custodial in-app ledger only (completely separate from blockchain CRXS)" },
  { name: "PRE-LAUNCH", note: "No blockchain exists yet" },
  { name: "TOKENOMICS APPROVED", note: "CURRENT STATE — 500,000,000,000 CRXS · 18 decimals approved · wallet funded · waiting for the owner's signature" },
  { name: "TESTNET DEPLOYED", note: "Reached only after the owner signs and Base Sepolia confirms the real deployment" },
  { name: "TESTNET VERIFIED", note: "On-chain checks + BaseScan source verification + real transfer test" },
  { name: "MAINNET READY", note: "Locked — needs explicit owner approval" },
  { name: "MAINNET DEPLOYED", note: "Locked" },
  { name: "DEX LIVE", note: "Locked" },
  { name: "MARKET LIVE", note: "Locked" },
  { name: "LISTING READY", note: "Locked" },
  { name: "COINGECKO LISTED", note: "Locked — only after CoinGecko approves" },
  { name: "COINMARKETCAP LISTED", note: "Locked — only after CMC approves" },
];

const CHIPS = {
  ok: { icon: CheckCircle2, cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10", label: "VERIFIED" },
  wait: { icon: AlertTriangle, cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", label: "WAITING FOR HUMAN ACTION" },
  gas: { icon: AlertTriangle, cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", label: "WAITING FOR GAS" },
  sign: { icon: AlertTriangle, cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", label: "WAITING FOR SIGNATURE" },
  none: { icon: XCircle, cls: "text-muted-foreground border-border bg-secondary", label: "NOT AVAILABLE" },
  unv: { icon: AlertTriangle, cls: "text-orange-400 border-orange-400/40 bg-orange-400/10", label: "UNVERIFIED" },
};

function Chip({ kind }) {
  const c = CHIPS[kind];
  const Icon = c.icon;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide shrink-0 " + c.cls}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

function Field({ label, value, chip }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 break-all">{value}</p>
      </div>
      {chip && <Chip kind={chip} />}
    </div>
  );
}

export default function CrxsLaunchControl() {
  const [record, setRecord] = React.useState(null);
  const loadRecord = React.useCallback(() => {
    base44.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" })
      .then((r) => setRecord(r[0] || null))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    loadRecord();
    return base44.entities.CrxsDeploymentRecord.subscribe(loadRecord);
  }, [loadRecord]);
  // The state machine position is derived ONLY from the verified on-chain
  // record — it can never advance by typing, only by a real deployment.
  const currentIdx =
    record?.deployment_status === "DEPLOYED"
      ? record.verification_status === "SOURCE_VERIFIED" ? 4 : 3
      : 2;

  return (
    <div>
      <PageHeader
        eyebrow="CRXS CONTROL CENTER"
        title="Launch Control"
        subtitle="Real status of the CrixCoin (CRXS) blockchain launch. No value on this page is simulated — if it isn't real yet, it says so."
      />

      <CrxsDeploymentFacts record={record} />

      <div className="rounded-2xl border border-border bg-card p-4 mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-3">Launch state machine — never skipped automatically</p>
        <div className="space-y-1.5">
          {STATES.map((s, i) => (
            <div key={s.name} className={"flex items-center gap-3 rounded-xl px-3 py-2 border " + (i === currentIdx ? "border-primary/50 bg-primary/10" : "border-transparent")}>
              <span className={"text-[10px] font-bold tabular-nums w-5 " + (i === currentIdx ? "text-primary" : "text-muted-foreground")}>{i + 1}</span>
              <div className="min-w-0">
                <p className={"text-sm font-semibold " + (i === currentIdx ? "text-primary" : i === 0 ? "text-foreground" : "text-muted-foreground")}>
                  {s.name} {i >= 5 && <Lock className="w-3 h-3 inline ml-1" />}
                </p>
                <p className="text-[10px] text-muted-foreground">{s.note}</p>
              </div>
              {i === currentIdx && <span className="ml-auto text-[10px] font-bold text-primary border border-primary/40 rounded-full px-2 py-0.5">CURRENT</span>}
            </div>
          ))}
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Identity</h2>
        <div className="space-y-2">
          <Field label="Token name" value="CrixCoin — fixed in the prepared contract source" chip="ok" />
          <Field label="Symbol" value="CRXS — fixed in the prepared contract source. Registered nowhere yet. Collision searches (CMC, CoinGecko, web) found no major asset using CRXS; a final live check must be re-run immediately before deployment." chip="ok" />
          <Field label="Decimals" value="18 (OpenZeppelin default) — APPROVED by owner 2026-09-11" chip="ok" />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Target network (planned — real public testnet facts)</h2>
        <div className="space-y-2">
          <Field label="Network" value="Base Sepolia (Coinbase public testnet)" chip="ok" />
          <Field label="Chain ID" value="84532" chip="ok" />
          <Field label="RPC" value="https://sepolia.base.org" chip="ok" />
          <Field label="Explorer" value="https://sepolia.basescan.org" chip="ok" />
          <Field label="Gas token" value="Testnet ETH — wallet funded: the on-chain balance reads exactly 0.01 test ETH (verified live against Base Sepolia at preparation time). Your wallet re-checks the real balance at signing." chip="ok" />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Corporate structure</h2>
        <div className="space-y-2">
          <Field label="Parent company" value="CSS ENTERTAINMENT (RC 7573127) — incorporated June 11, 2024 · CAC status: ACTIVE. The only corporate entity used for RIDE X Terms, Privacy, payment-provider KYB, corporate banking, provider applications and regulatory/legal documentation." chip="ok" />
          <Field label="CAC compliance" value="Company is ACTIVE — but annual-return/compliance obligations since the June 2024 incorporation must be checked with CAC and brought up to date before provider/regulatory applications begin. Human action required." chip="wait" />
          <Field label="Product / platform" value="RIDE X — public branding: RIDE X by CSS Entertainment. RIDE X is a product/platform of CSS Entertainment." chip="ok" />
          <Field label="Cryptocurrency" value="CrixCoin (CRXS) — PRE-LAUNCH. CRXS blockchain: Base Network ERC-20, deployed only after explicit human MetaMask authorization." chip="wait" />
          <Field label="Internal ledger" value="RIDE X internal CRXS ledger is SEPARATE from blockchain CRXS — never mixed, never displayed as token supply." chip="ok" />
          <Field label="Regulated financial functions" value="Must operate only through properly approved/licensed providers, and only after CSS Entertainment/RIDE X completes all required regulatory and provider onboarding." chip="wait" />
          <Field label="Licensing status" value="NOT LICENSED / NOT REGULATED / NOT LISTED / NOT EXCHANGE-TRADED — no license, registration, banking relationship, card program, liquidity, price or provider approval is claimed until it actually exists." chip="none" />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Deployment</h2>
        <div className="space-y-2">
          <Field label="Deployer (public address only — key never touches this app)" value="0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1" chip="unv" />
          <Field label="Contract prepared" value="OpenZeppelin ERC-20, fixed supply minted once in the constructor. No mint function, no owner, no tax, no blacklist, no backdoor. Source: contracts/CrixCoin.sol · Guide: contracts/DEPLOYMENT.md" chip="ok" />
          <Field label="Approved tokenomics" value="APPROVED by owner 2026-09-11 — 500,000,000,000 CRXS (five hundred billion) fixed total supply · 18 decimals · 100% minted once to the deployment wallet (INITIAL DEPLOYMENT ALLOCATION — not the final economic distribution unless separately approved later) · no future minting · no tax · no blacklist · no hidden owner controls · no backdoor." chip="ok" />
          <Field label="Exact deployment parameters (review BEFORE signing)" value="Contract creation · Base Sepolia (chain 84532) · from 0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1 · constructor argument 500000000000000000000000000000 (= 500,000,000,000 × 10^18). Verify every value in MetaMask before you sign. Nothing has been signed or broadcast yet." chip="sign" />
          <Field label="Deployment transaction" value={record?.deployment_tx_hash ? record.deployment_tx_hash : "No transaction has been signed or broadcast"} chip={record?.deployment_tx_hash ? "ok" : "sign"} />
          <Field label="Contract address" value={record?.contract_address ? record.contract_address : "No contract exists — nothing to show"} chip={record?.contract_address ? "ok" : "none"} />
          <Field label="Deployment TX hash / block" value={record?.deployment_tx_hash ? record.deployment_tx_hash + " · block " + record.block_number : "No deployment has occurred"} chip={record?.deployment_tx_hash ? "ok" : "none"} />
          <Field label="Contract verification" value={record?.deployment_status === "DEPLOYED" ? "Server-side on-chain verification PASSED (" + (record.verification_status || "ONCHAIN_VERIFIED") + "). BaseScan source verification: " + (record.verification_status === "SOURCE_VERIFIED" ? "done" : "pending — run Verify & Publish on sepolia.basescan.org after deployment") : "Not verifiable until a contract exists on-chain"} chip={record?.verification_status === "SOURCE_VERIFIED" ? "ok" : record?.deployment_status === "DEPLOYED" ? "unv" : "none"} />
          <Field label="Test transfers (A→B, B→A)" value="Pending — only possible after real deployment" chip="none" />
        </div>
        <div className="mt-3">
          <CrxsDeployPanel record={record} onRecorded={loadRecord} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">Market & listings</h2>
        <div className="space-y-2">
          <Field label="DEX / pair / pool / liquidity" value="No market exists. No liquidity may be claimed before a real pool with real tokens exists." chip="none" />
          <Field label="Price" value="NOT AVAILABLE — no market exists, so no price exists" chip="none" />
          <Field label="Supply (total / circulating / max)" value="No blockchain supply exists. Internal ledger balances are NOT token supply and will never be displayed as such." chip="none" />
          <Field label="CoinGecko / CoinMarketCap" value="NOT ELIGIBLE until a real contract, explorer, public trading and material volume exist. Do not submit." chip="none" />
        </div>
      </section>

      <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
        <Ban className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-destructive">MAINNET IS LOCKED.</span> After testnet succeeds, the system stops and waits for your explicit approval. No automated step can ever mark CRXS "LIVE" without a real contract, real transactions, real liquidity and real market data — verified on-chain, not typed in.
        </p>
      </div>

      <Link to="/admin/crxs-mainnet" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
        Open the gated Base Mainnet deployment console <ExternalLink className="w-4 h-4" />
      </Link>
    </div>
  );
}