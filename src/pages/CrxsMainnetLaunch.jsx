import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import { base44 } from "@/api/base44Client";
import CrxsMainnetDeployPanel from "@/components/crxs/CrxsMainnetDeployPanel";
import CrxsCurveLaunchPanel from "@/components/crxs/CrxsCurveLaunchPanel";
import CrxsGasTreasuryPanel from "@/components/crxs/CrxsGasTreasuryPanel";
import CrxsAAProviderPanel from "@/components/crxs/CrxsAAProviderPanel";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

// CRXS MAINNET LAUNCH — the production counterpart of Launch Control. Every
// value shown here is real: until a real owner-signed Base Mainnet deployment
// exists, the status is NOT_DEPLOYED and no address is ever displayed.
const POST_DEPLOY_STEPS = [
  "Verify & Publish the contract source on basescan.org (Base Mainnet)",
  "Perform the controlled real Mainnet transfer test (A→B) and index it",
  "Point the production wallet, indexer and explorer at the real contract",
  "Establish legitimate liquidity and a real trading pair — never fabricated",
  "Prepare CoinGecko / CoinMarketCap packages with truthful data only",
  "Only then mark CRXS LIVE — never before",
];

function Field({ label, value, state }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "wait" ? AlertTriangle : XCircle;
  const cls = state === "ok" ? "text-emerald-400" : state === "wait" ? "text-yellow-400" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 break-all">{value}</p>
      </div>
      <Icon className={"w-4 h-4 shrink-0 " + cls} />
    </div>
  );
}

export default function CrxsMainnetLaunch() {
  const [record, setRecord] = React.useState(null);
  const load = React.useCallback(() => {
    base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" })
      .then((r) => setRecord(r[0] || null))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    load();
    return base44.entities.CrxsMainnetDeploymentRecord.subscribe(load);
  }, [load]);

  const deployed = record?.deployment_status === "DEPLOYED" && !!record?.contract_address;

  return (
    <div>
      <PageHeader
        eyebrow="CRXS PRODUCTION"
        title="Base Mainnet Launch"
        subtitle="The gated production deployment of CrixCoin (CRXS) on Base Mainnet. No address, hash or status on this page is ever invented — until you sign a real deployment, it stays NOT DEPLOYED."
      />

      <div className="rounded-2xl border border-border bg-card p-4 mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-3">Production status</p>
        <div className="space-y-2">
          <Field
            label="MAINNET STATUS"
            value={!deployed
              ? "NOT_DEPLOYED — no production CRXS contract exists. Nothing on this page is live."
              : (record.launch_status || "VERIFIED") + " — server-verified on Base Mainnet. LIVE requires the full launch checklist below."}
            state={!deployed ? "none" : "wait"}
          />
          <Field label="Network / Chain ID" value="Base Mainnet · 8453 (0x2105) · RPC https://mainnet.base.org" state="ok" />
          <Field
            label="Production contract"
            value={deployed ? record.contract_address : "No contract exists — no address will be shown until a real deployment is confirmed and verified"}
            state={deployed ? "ok" : "none"}
          />
          <Field
            label="Deployment transaction"
            value={deployed ? record.deployment_tx_hash + " · block " + record.block_number : "No transaction has been signed or broadcast"}
            state={deployed ? "ok" : "none"}
          />
          <Field
            label="Total supply (on-chain)"
            value={deployed ? record.total_supply_raw + " raw units (" + record.human_total_supply + ")" : "Not available until the production contract exists"}
            state={deployed ? "ok" : "none"}
          />
          <Field
            label="Testnet program"
            value="Base Sepolia 0x593efbd536124de06ddfc129166df45021df9faa remains the TEST contract — it is never presented as the production asset and never copied into this configuration."
            state="ok"
          />
        </div>
      </div>

      <CrxsMainnetDeployPanel record={record} onRecorded={load} />

      <div className="mt-6">
        <CrxsCurveLaunchPanel />
      </div>

      <div className="mt-6">
        <CrxsGasTreasuryPanel />
      </div>

      <div className="mt-6">
        <CrxsAAProviderPanel />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 mt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-3">After deployment — in order, nothing skipped</p>
        <div className="space-y-2">
          {POST_DEPLOY_STEPS.map((s, i) => (
            <div key={s} className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <span className="text-[10px] font-bold tabular-nums text-primary mt-0.5">{i + 1}</span>
              <span>{s}</span>
              <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto mt-0.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}