import React from "react";
import { AlertTriangle, Activity, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MASTER_PRESETS } from "@/lib/aiMastering";

const BAND_META = [
  ["sub", "Sub 20–60 Hz"],
  ["bass", "Bass 60–140 Hz"],
  ["lowMid", "Low mids 140–400 Hz"],
  ["mid", "Mids 0.4–2 kHz"],
  ["presence", "Presence 2–5 kHz"],
  ["harsh", "Harsh 5–9 kHz"],
  ["air", "Air 9–18 kHz"],
];

const f1 = (v, suffix = "") => (Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : "—");

// Measured mix characteristics + pre-master warnings + the preset
// recommendation. Every number shown is measured from the uploaded audio.
export default function MixAnalysisPanel({ analysis, recommendation, currentPreset, onUseRecommendation }) {
  if (!analysis) return null;
  const b = analysis.bands || {};
  const vals = BAND_META.map(([k]) => b[k] ?? -120);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pct = (v) => Math.max(5, Math.round(((v - min) / Math.max(0.001, max - min)) * 100));

  const stats = [
    ["Integrated loudness", `${f1(analysis.integratedLufs, " LUFS")}`],
    ["True peak", `${f1(analysis.truePeakDb, " dBTP")}`],
    ["Crest factor", `${f1(analysis.crestDb, " dB")}`],
    ["Dynamic range (LRA)", `${f1(analysis.lra, " LU")}`],
    ["Stereo correlation", analysis.mono ? "mono source" : f1(analysis.correlation)],
    ["Stereo width", analysis.mono ? "—" : `${f1(analysis.widthDb, " dB side/mid")}`],
  ];

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-5">
      <div className="flex items-center gap-2 text-primary">
        <Activity className="w-4 h-4" />
        <p className="font-semibold text-sm uppercase tracking-[0.15em]">Mix analysis — measured from your track</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-secondary/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="text-sm font-bold mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Spectral balance</p>
        {BAND_META.map(([k, label]) => (
          <div key={k} className="flex items-center gap-3">
            <p className="text-[11px] text-muted-foreground w-[7.5rem] shrink-0">{label}</p>
            <div className="flex-1 h-1.5 rounded-full bg-background/70 overflow-hidden">
              <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct(b[k] ?? -120)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {analysis.warnings?.length > 0 && (
        <div className="space-y-2">
          {analysis.warnings.map((w) => (
            <div key={w.code} className="flex gap-2 items-start rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">{w.text}</p>
            </div>
          ))}
        </div>
      )}

      {recommendation && (
        <div className="rounded-2xl bg-primary/10 border border-primary/30 px-4 py-3 space-y-2">
          <p className="text-xs leading-relaxed">
            <span className="font-semibold text-primary">RIDE X recommends: {MASTER_PRESETS[recommendation.key]?.label || recommendation.key}</span>
            <span className="text-muted-foreground"> — {recommendation.reason}</span>
          </p>
          {recommendation.key !== currentPreset && onUseRecommendation && (
            <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={() => onUseRecommendation(recommendation.key)}>
              <Wand2 className="w-3 h-3 mr-1" /> Master with {MASTER_PRESETS[recommendation.key]?.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}