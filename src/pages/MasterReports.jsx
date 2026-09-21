import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { FileAudio, Loader2, ChevronDown } from "lucide-react";
import { MASTER_PRESETS } from "@/lib/aiMastering";

// MASTER REPORTS — the Song Master validation log: technical before/after
// measurements for every master the engine produced, so real-track sonic
// quality can be reviewed systematically. Engineering details live in the
// expandable raw measurements; the cards stay readable.

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const parseJson = (s) => {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
};

function CompareRow({ label, before, after, unit = "" }) {
  const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right">
        {fmt(before)} → {fmt(after)}{unit}
        {delta !== null && (
          <span className={`ml-1.5 ${delta >= 0 ? "text-emerald-400" : "text-sky-400"}`}>({delta >= 0 ? "+" : ""}{fmt(delta)})</span>
        )}
      </span>
    </div>
  );
}

function TrackCard({ r }) {
  const before = parseJson(r.before_json);
  const after = parseJson(r.after_json);
  const persona = MASTER_PRESETS[r.preset]?.label || r.preset || "—";
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{r.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(r.created_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {persona} personality
            {r.family ? ` · detected: ${r.family}` : ""}
          </p>
        </div>
        {Number.isFinite(r.quality_score) && (
          <span className="text-xs px-2.5 py-1 rounded-full border border-primary/50 text-primary font-bold shrink-0">
            Quality {r.quality_score}/100
          </span>
        )}
      </div>

      {r.conditions && (
        <div className="flex flex-wrap gap-1.5">
          {r.conditions.split(";").filter(Boolean).map((c) => (
            <span key={c} className="text-[11px] px-2.5 py-1 rounded-full bg-secondary border border-border/60">{c.trim()}</span>
          ))}
        </div>
      )}

      {before && after ? (
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Before → after measurements</p>
          <CompareRow label="Integrated LUFS" before={before.lufs} after={after.lufs} unit=" LUFS" />
          <CompareRow label="True peak" before={before.truePeakDb} after={after.truePeakDb} unit=" dBTP" />
          <CompareRow label="Sample peak" before={before.samplePeakDb} after={after.samplePeakDb} unit=" dB" />
          <CompareRow label="Crest factor" before={before.crestDb} after={after.crestDb} unit=" dB" />
          <CompareRow label="Loudness range (LRA)" before={before.lra} after={after.lra} unit=" LU" />
          <CompareRow label="RMS" before={before.rmsDb} after={after.rmsDb} unit=" dB" />
          <CompareRow label="Stereo correlation" before={before.correlation} after={after.correlation} />
          <CompareRow label="Clipping runs" before={before.clipRuns} after={after.clipRuns} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Older record — no measurement snapshot (produced before validation logging).</p>
      )}

      <p className="text-xs text-muted-foreground">
        Passes: {Number.isFinite(r.passes) ? r.passes : "—"}
        {r.corrections ? ` · Corrections: ${r.corrections}` : " · No corrections needed"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {r.file_url && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={r.file_url} target="_blank" rel="noreferrer">Master file</a>
          </Button>
        )}
        {(before || after) && (
          <details className="w-full">
            <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
              Full measurements (pro view) <ChevronDown className="w-3 h-3" />
            </summary>
            <pre className="mt-2 text-[10px] font-mono bg-secondary/60 rounded-xl p-3 overflow-x-auto">
              {JSON.stringify({ before, after }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default function MasterReports() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    base44.entities.MasteredTrack.list("-created_date", 100)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  if (!rows) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading reports…
      </div>
    );
  }

  const measured = rows.filter((r) => r.before_json || Number.isFinite(r.master_lufs));
  const scores = measured.map((r) => r.quality_score).filter(Number.isFinite);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const lufsValues = measured.map((r) => r.master_lufs).filter(Number.isFinite);
  const avgLufs = lufsValues.length ? (lufsValues.reduce((a, b) => a + b, 0) / lufsValues.length).toFixed(1) : null;
  const selfCorrected = measured.filter((r) => r.passes > 1).length;

  const stat = (label, value) => (
    <div className="rounded-2xl border border-border/60 bg-card p-4 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Song Master validation"
        title="Mastering reports"
        subtitle="Technical before-and-after measurements for every master the engine has produced — your validation log for real-track testing."
        action={
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/ai-master">Open Song Master</Link>
          </Button>
        }
      />

      {measured.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stat("Masters logged", measured.length)}
          {stat("Average quality", avgScore !== null ? `${avgScore}/100` : "—")}
          {stat("Average final LUFS", avgLufs !== null ? `${avgLufs} LUFS` : "—")}
          {stat("Self-corrected", selfCorrected)}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-border/60 bg-card p-10 text-center text-muted-foreground">
          <FileAudio className="w-8 h-8 mx-auto mb-3 text-primary" />
          <p className="text-sm">No masters logged yet — master a track in Song Master and its measurements will appear here.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {rows.map((r) => <TrackCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}