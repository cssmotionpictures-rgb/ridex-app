import React from "react";
import { BadgeCheck, AlertTriangle, ShieldAlert, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { MASTER_PRESETS } from "@/lib/aiMastering";

const STATUS_ICON = { ok: BadgeCheck, caution: AlertTriangle, risk: ShieldAlert };
const STATUS_COLOR = { ok: "text-emerald-400", caution: "text-amber-300", risk: "text-rose-400" };

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-background/60 border border-border/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function MonsterSummary({ report }) {
  if (!report?.after) return null;
  const a = report.after;
  const score = report.scoreBreakdown || { total: 0 };
  const persona = MASTER_PRESETS[report.personality]?.label || "Signature";
  const subs = [
    ["Tonal", score.tonal], ["Dynamics", score.dynamics], ["Loudness safety", score.loudness],
    ["Stereo", score.stereo], ["Integrity", score.integrity],
  ];

  return (
    <div className="rounded-3xl border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Master complete</p>
          <p className="text-sm text-muted-foreground mt-1">
            {persona} personality · detected family: {report.family?.family} ({Math.round((report.family?.confidence || 0) * 100)}% confidence — a clue, not a verdict)
          </p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-3xl font-extrabold gold-text">{score.total ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quality</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {subs.map(([label, v]) => (
          <span key={label} className="text-[10px] px-2 py-1 rounded-full border border-border/60 bg-background/50">
            {label} <span className="font-bold">{v ?? "—"}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Integrated" value={`${(a.integratedLufs ?? -70).toFixed(1)} LUFS`} hint={`target ${(report.target ?? -10).toFixed(1)}`} />
        <Metric label="True peak" value={`${(a.truePeakDb ?? -1).toFixed(1)} dBTP`} />
        <Metric label="Range (LRA)" value={`${(a.lra ?? 0).toFixed(1)} LU`} />
        <Metric label="Stereo" value={a.mono ? "Mono" : (a.correlation ?? 0).toFixed(2)} hint="correlation" />
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Source diagnosis</p>
        <div className="flex flex-wrap gap-1.5">
          {(report.conditions || []).map((c) => (
            <span key={c.key} className="text-[11px] px-2.5 py-1 rounded-full bg-secondary border border-border/60">{c.label}</span>
          ))}
        </div>
      </div>

      {(report.before?.warnings || []).length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Problems detected in the source</p>
          <ul className="space-y-1">
            {report.before.warnings.map((w) => (
              <li key={w.code} className="text-xs text-muted-foreground">• {w.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Engine decisions</p>
        <div className="space-y-2">
          {(report.decisions || []).map((d) => (
            <div key={d.stage} className="rounded-2xl bg-background/50 border border-border/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  {d.action === "applied" ? <Sparkles className="w-3.5 h-3.5 text-primary" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                  {d.stage}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${d.action === "applied" ? "border-primary/50 text-primary" : "border-border/60 text-muted-foreground"}`}>
                  {d.action === "applied" ? "applied" : "bypassed"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{d.reason}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="h-1 flex-1 rounded-full bg-border/60 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${d.confidence}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{d.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Worldwide translation check</p>
        <div className="space-y-1.5">
          {(report.translation || []).map((t) => {
            const Icon = STATUS_ICON[t.status] || BadgeCheck;
            return (
              <div key={t.system} className="flex items-start gap-2 text-xs">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${STATUS_COLOR[t.status] || ""}`} />
                <p className="text-muted-foreground"><span className="text-foreground font-medium">{t.system}:</span> {t.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-background/50 border border-border/50 p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          {report.passes === 1
            ? "First render passed its own quality check — no corrections were needed."
            : `${report.passes} mastering passes — the engine re-measured and corrected itself before delivery.`}
          {(report.corrections || []).length > 0 && ` Corrections: ${report.corrections.join("; ")}.`}
          {" "}Final verdict: delivered — the master passed the final quality gate with a measured score of {score.total ?? 0}/100{score.total >= 85 ? " — strong measurements across the board" : score.total >= 70 ? "" : " — review the cautions above before release"}.
          {" "}{report.exportTip}
        </p>
      </div>
    </div>
  );
}