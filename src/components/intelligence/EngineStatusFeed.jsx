import React from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/kala/Bits";

// ENGINE STATUS FEED — internal intelligence surface: last successful sync time
// plus any active validation alerts, all derived from real page state. Nothing
// is fabricated: while a sync is in flight or a read has failed, that IS the
// alert shown.
const LAGOS = { timeZone: "Africa/Lagos" };
const fmt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      ...LAGOS, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) + " WAT";
  } catch { return String(iso); }
};

export default function EngineStatusFeed({ lastSyncAt, bgSync, ledgerError, insights, batches, changelog }) {
  const alerts = [];
  if (ledgerError) {
    alerts.push({ tone: "rose", text: "Ledger read currently failing — last retained data stays on screen; retry with SYNC ALL SECTIONS." });
  }
  if (bgSync === "syncing") {
    alerts.push({ tone: "sky", text: "Background sync in progress — sections ingest idempotently; nothing duplicates." });
  }
  if (bgSync === "failed") {
    alerts.push({ tone: "amber", text: "Last background sync failed before completion — the previous good sync is retained below." });
  }
  const proposed = (changelog || []).filter((c) => c?.decision === "PROPOSED");
  if (proposed.length) {
    alerts.push({ tone: "amber", text: `${proposed.length} proposed engine change${proposed.length > 1 ? "s" : ""} awaiting validation — nothing reaches production without out-of-sample evidence.` });
  }
  const queue = (insights || []).filter((i) => i?.status === "NEW" || i?.status === "UNDER_TEST");
  if (queue.length) {
    alerts.push({ tone: "sky", text: `${queue.length} pattern${queue.length > 1 ? "s" : ""} in the validation queue — hypothesis testing only, no production change yet.` });
  }
  const conflictBatches = (batches || []).filter((b) => (b?.conflicts || 0) > 0);
  if (conflictBatches.length) {
    alerts.push({ tone: "rose", text: `${conflictBatches.length} imported result batch${conflictBatches.length > 1 ? "es" : ""} with conflicting results awaiting review — never auto-settled.` });
  }

  return (
    <SectionCard
      title="ENGINE STATUS FEED"
      icon={<Activity className="w-4 h-4 text-primary" />}
      sub="Last successful sync and active validation alerts — live page state, never fabricated."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold">
          <RefreshCw className="w-3.5 h-3.5 text-primary" />
          LAST SUCCESSFUL SYNC: {fmt(lastSyncAt)}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
          alerts.length ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
        }`}>
          {alerts.length ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          {alerts.length} ACTIVE ALERT{alerts.length === 1 ? "" : "S"}
        </span>
      </div>
      {alerts.length ? (
        <ul className="space-y-1.5">
          {alerts.map((a, i) => (
            <li key={i} className={`text-[11px] rounded-xl border px-3 py-2 ${
              a.tone === "rose" ? "border-rose-400/30 bg-rose-400/5 text-rose-200"
              : a.tone === "amber" ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
              : "border-sky-400/30 bg-sky-400/5 text-sky-200"
            }`}>
              {a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-emerald-300">No active validation alerts — the engine is stable and learning from settled evidence only.</p>
      )}
    </SectionCard>
  );
}