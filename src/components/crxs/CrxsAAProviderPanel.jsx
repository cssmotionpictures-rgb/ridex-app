import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Boxes, RefreshCw, ShieldCheck, AlertTriangle, Lock } from "lucide-react";

const STATE_STYLES = {
  NOT_CONFIGURED: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  CONFIGURED: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  OPERATIONAL: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  FAILED: "border-red-500/40 bg-red-500/10 text-red-400",
  PAUSED: "border-red-500/40 bg-red-500/10 text-red-400",
};

function CheckRow({ check }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {check.pass ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />}
      <span className="text-muted-foreground min-w-0">
        <span className="font-semibold text-foreground/80">{check.check}</span>
        <span className="break-all"> — {check.value}</span>
      </span>
    </div>
  );
}

function ProviderCard({ record }) {
  const checks = React.useMemo(() => {
    try { return JSON.parse(record?.verification_json || "[]"); } catch (e) { return []; }
  }, [record]);
  const missing = (record?.missing_credentials || "").split(", ").filter(Boolean);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-sm font-bold uppercase tracking-wider">{record?.provider === "system" ? "External on-chain transfers" : (record?.provider || "").toUpperCase()}</p>
        <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold border " + (STATE_STYLES[record?.state] || STATE_STYLES.NOT_CONFIGURED)}>{record?.state || "NOT_CONFIGURED"}</span>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-primary mb-2">{record?.role}</p>
      <p className="text-[11px] text-muted-foreground mb-3">{record?.notes}</p>
      {missing.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Still missing (names only — values live server-side)</p>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li key={m} className="text-[11px] text-yellow-300/90 flex gap-1.5"><span className="text-primary">•</span> {m}</li>
            ))}
          </ul>
        </div>
      )}
      {checks.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Live provider verification — real responses only</p>
          {checks.map((c, i) => <CheckRow key={c.check + i} check={c} />)}
          {record?.last_checked_at && <p className="text-[10px] text-muted-foreground pt-1">Last probed {new Date(record.last_checked_at).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}

export default function CrxsAAProviderPanel() {
  const [rows, setRows] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState("");

  const load = React.useCallback(() => {
    base44.entities.CrxsAAProviderStatus.list()
      .then((r) => setRows(r || []))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    load();
    return base44.entities.CrxsAAProviderStatus.subscribe(load);
  }, [load]);

  const run = async () => {
    setRunning(true);
    setError("");
    setResult("");
    try {
      const res = await base44.functions.invoke("crxs-aa-health-check", {});
      if (res.data?.error) setError(res.data.error);
      else setResult("Live check complete — Alchemy " + res.data.alchemy.state + " · CDP " + res.data.cdp.state + " · transfers " + res.data.transfer_gate);
      load();
    } catch (e) {
      setError(String(e?.response?.data?.error || e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const ordered = ["aa-provider|alchemy", "aa-provider|cdp", "crxs-aa-transfer-gate"].map((k) => rows.find((r) => r.registry_key === k)).filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5" /> ERC-4337 providers</p>
        <Button size="sm" onClick={run} disabled={running}>
          <RefreshCw className={"w-3.5 h-3.5 " + (running ? "animate-spin" : "")} />
          Run live infrastructure check
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Alchemy is the PRIMARY ERC-4337 candidate: smart account → UserOperation → Alchemy bundler → Gas Manager sponsorship → Base Mainnet, so ordinary sponsored CRIXCOIN transactions never require users to hold ETH. All provider keys are stored server-side only and every code path goes through the provider-independent interfaces — Alchemy can be replaced later without touching business logic.
      </p>
      {ordered.length === 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3 text-[11px] text-muted-foreground flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> No provider record yet — run the live check to probe Alchemy and CDP with the real server-side credentials.
        </div>
      )}
      <div className="space-y-3">
        {ordered.map((r) => <ProviderCard key={r.id} record={r} />)}
      </div>
      {result && <p className="text-[11px] text-emerald-400 mt-2 break-words">{result}</p>}
      {error && <p className="text-[11px] text-red-400 mt-2 break-words">{error}</p>}
    </div>
  );
}