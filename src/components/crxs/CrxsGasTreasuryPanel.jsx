import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Fuel, RefreshCw, Route, ShieldCheck, AlertTriangle } from "lucide-react";

const STATUS_STYLES = {
  NOT_CONFIGURED: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  HEALTHY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  BELOW_TARGET: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  LOW: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  CRITICAL: "border-red-500/40 bg-red-500/10 text-red-400",
  SYNC_FAILED: "border-red-500/40 bg-red-500/10 text-red-400",
};

function CheckRow({ check }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {check.pass ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      <span className="text-muted-foreground">{check.check}</span>
      <span className="ml-auto font-mono text-[10px] truncate max-w-[52%] text-foreground/80">{check.value}</span>
    </div>
  );
}

export default function CrxsGasTreasuryPanel() {
  const [record, setRecord] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState("");
  const [syncResult, setSyncResult] = React.useState("");
  const [route, setRoute] = React.useState(null);
  const [routeLoading, setRouteLoading] = React.useState(false);

  const load = React.useCallback(() => {
    base44.entities.CrxsGasTreasury.filter({ registry_key: "crxs-gas-treasury" })
      .then((r) => setRecord(r[0] || null))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
    return base44.entities.CrxsGasTreasury.subscribe(load);
  }, [load]);

  const checks = React.useMemo(() => {
    try { return JSON.parse(record?.verification_json || "[]"); } catch (e) { return []; }
  }, [record]);

  const sync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult("");
    try {
      const res = await base44.functions.invoke("crxs-gas-treasury-sync", {});
      if (res.data?.error) {
        setSyncError(res.data.error);
      } else if (res.data) {
        setSyncResult("Verified " + res.data.crixcoin_gas_treasury_address + " on Base Mainnet — " + res.data.eth_balance + " ETH · status " + res.data.status);
      }
      load();
    } catch (e) {
      setSyncError(String(e?.response?.data?.error || e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const checkRoute = async () => {
    setRouteLoading(true);
    try {
      const res = await base44.functions.invoke("crxs-settlement-router", { action: "status" });
      setRoute(res.data);
    } catch (e) {
      setRoute({ status: "SETTLEMENT_UNAVAILABLE", adapter_status: "NOT_CONFIGURED", reason: String(e?.response?.data?.error || e?.message || e), requires_credentials: [] });
    } finally {
      setRouteLoading(false);
    }
  };

  const badge = (s) => (
    <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold border " + (STATUS_STYLES[s] || STATUS_STYLES.NOT_CONFIGURED)}>{s}</span>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5" /> ETH gas treasury</p>
          {badge(record?.status || "NOT_CONFIGURED")}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          CRIXCOIN_GAS_TREASURY_ADDRESS is the EXISTING CRIXCOIN deployment wallet, discovered from this project's own records and verified live on Base Mainnet — reused, never regenerated. Only the public address is shown; the private key never touches this app.
        </p>
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">CRIXCOIN_GAS_TREASURY_ADDRESS</p>
            <p className="font-mono text-xs break-all text-primary">{record?.wallet_address || "Not yet configured — run discovery & verify to locate the existing wallet"}</p>
            {record?.wallet_address_source && <p className="text-[10px] text-muted-foreground mt-1.5">Source: {record.wallet_address_source}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Real ETH balance</p>
              <p className="text-lg font-bold mt-0.5">{record ? record.eth_balance : "—"} ETH</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Available / target</p>
              <p className="text-sm font-bold mt-1">{record ? record.available_eth : "—"} / {record ? record.target_eth : 0.05}</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Min / critical</p>
              <p className="text-sm font-bold mt-1">{record ? record.minimum_eth : 0.02} / {record ? record.critical_eth : 0.01}</p>
            </div>
          </div>
          {record && record.eth_balance === 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-[11px] text-red-300">
              The treasury holds 0 ETH on Base Mainnet. Sponsored on-chain transactions cannot run until real ETH arrives through a real settlement route — this state is shown honestly, never simulated.
            </div>
          )}
          {record?.crxs_contract_address === "" && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-[11px] text-yellow-300/90">
              No production CRXS contract exists on Base Mainnet yet — the treasury is wired for gas, but there is nothing on-chain to power until the real Mainnet deployment happens.
            </div>
          )}
          {checks.length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Server verification — live Base Mainnet RPC</p>
              {checks.map((c) => <CheckRow key={c.check} check={c} />)}
              {record?.last_synced_at && <p className="text-[10px] text-muted-foreground pt-1">Last verified {new Date(record.last_synced_at).toLocaleString()}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={"w-3.5 h-3.5 " + (syncing ? "animate-spin" : "")} />
            {record ? "Re-verify on Base Mainnet" : "Discover & verify existing wallet"}
          </Button>
        </div>
        {syncResult && <p className="text-[11px] text-emerald-400 mt-2">{syncResult}</p>}
        {syncError && <p className="text-[11px] text-red-400 mt-2 break-words">{syncError}</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-1.5"><Route className="w-3.5 h-3.5" /> Settlement router</p>
          {badge(route ? (route.adapter_status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : route.status) : "NOT_CONFIGURED")}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          FIAT → real settlement → real ETH → treasury. Flutterwave is the fiat payment layer only — a verified Flutterwave payment never equals ETH received. The router quotes or executes nothing until a real liquidity route is configured.
        </p>
        <Button size="sm" variant="outline" onClick={checkRoute} disabled={routeLoading}>
          <RefreshCw className={"w-3.5 h-3.5 " + (routeLoading ? "animate-spin" : "")} />
          Check settlement route
        </Button>
        {route && (
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-[11px] text-yellow-300/90">
              <p className="font-bold mb-1">{route.status} — adapter {route.adapter_status}</p>
              <p>{route.reason}</p>
            </div>
            {(route.requires_credentials || []).length > 0 && (
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Required before settlement can ever run</p>
                <ul className="space-y-1">
                  {route.requires_credentials.map((r) => (
                    <li key={r} className="text-[11px] text-muted-foreground flex gap-1.5"><span className="text-primary">•</span> {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}