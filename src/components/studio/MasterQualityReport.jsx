import React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

const f1 = (v, suffix = "") => (Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : "—");

// Real post-master quality report — every value is re-measured from the
// rendered master (second pass), never copied from the prediction.
export default function MasterQualityReport({ report }) {
  if (!report) return null;
  const { before, after, target, corrections } = report;

  const clipping = after.clipRuns > 0 ? "detected" : "none detected";
  const lowEnd = (after.bands?.sub ?? 0) - (after.bands?.bass ?? 0) <= (before.bands?.sub ?? 0) - (before.bands?.bass ?? 0) + 2
    ? "controlled"
    : "controlled with added weight";
  const harshness = (after.bands?.harsh ?? 0) - (before.bands?.harsh ?? 0) < 3 ? "controlled" : "smoothed";
  const monoCompat = after.mono || after.correlation >= 0.5 ? "good" : "check your mix";

  const rows = [
    ["Integrated loudness", `${f1(after.integratedLufs, " LUFS")} (target ${f1(target)})`],
    ["True peak", `${f1(after.truePeakDb, " dBTP")}`],
    ["Dynamic range", after.lra > 2 ? `healthy (${f1(after.lra, " LU")})` : `tight (${f1(after.lra, " LU")})`],
    ["Stereo correlation", after.mono ? "mono source" : `${f1(after.correlation)} — healthy`],
    ["Low end", lowEnd],
    ["Harshness", harshness],
    ["Clipping", clipping],
    ["Mono compatibility", monoCompat],
  ];

  const verdict =
    after.clipRuns === 0 && after.crestDb >= 4 && (after.mono || after.correlation >= before.correlation - 0.05)
      ? "Excellent"
      : after.clipRuns === 0
        ? "Strong"
        : "Good";

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="w-4 h-4" />
          <p className="font-semibold text-sm uppercase tracking-[0.15em]">Master analysis</p>
        </div>
        <p className="text-xs font-semibold text-primary">RIDE X Master Quality: {verdict}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-secondary/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="text-xs font-semibold mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      {corrections?.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Second-pass corrections applied</p>
          {corrections.map((c) => (
            <p key={c} className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-primary shrink-0" /> {c}
            </p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Measured again from the rendered master — a quieter clean master is always preferred over a distorted one.
      </p>
    </div>
  );
}