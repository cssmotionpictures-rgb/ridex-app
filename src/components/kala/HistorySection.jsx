import React from "react";
import { History as HistoryIcon } from "lucide-react";
import { SectionCard, EmptyState, GradeBadge, ResultBadge } from "@/components/kala/Bits";

const norm = (s) => String(s || "").toLowerCase();
const GRADES = ["", "ULTRA ELITE", "ELITE", "STRONG", "QUALIFYING", "WATCH"];
const STATUSES = ["", "open", "won", "lost", "void", "superseded"];

// PREDICTION HISTORY — the permanent, immutable ledger. Filterable, never
// rewritten: superseded rows stay visible with their version numbers.
export default function HistorySection({ preds, throttled }) {
  const [status, setStatus] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [session, setSession] = React.useState("");
  const [bhOnly, setBhOnly] = React.useState(false);
  const [q, setQ] = React.useState("");

  const rows = (preds || [])
    .filter((r) => !status || r.status === status)
    .filter((r) => !grade || String(r.grade || "").toUpperCase() === grade)
    .filter((r) => !session || r.session === session)
    .filter((r) => !bhOnly || r.big_hammer)
    .filter((r) => !q || norm(r.home).includes(norm(q)) || norm(r.away).includes(norm(q)))
    .slice(0, 150);

  const sel = "rounded-full bg-secondary border border-border px-3 py-1.5 text-[11px] text-foreground";

  return (
    <SectionCard
      title="PREDICTION HISTORY"
      icon={<HistoryIcon className="w-4 h-4 text-primary" />}
      sub="Every prediction ever recorded — immutable, versioned. A pre-kickoff change created a new version; originals are never overwritten."
    >
      <div className="flex flex-wrap gap-1.5 items-center">
        <input className={sel + " min-w-[140px]"} placeholder="Search teams…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.toUpperCase() : "ALL RESULTS"}</option>)}
        </select>
        <select className={sel} value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADES.map((g) => <option key={g} value={g}>{g || "ALL GRADES"}</option>)}
        </select>
        <select className={sel} value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">ALL SESSIONS</option>
          <option value="morning">MORNING</option>
          <option value="evening">EVENING</option>
        </select>
        <button type="button" onClick={() => setBhOnly((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold border ${bhOnly ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
          BIG HAMMER
        </button>
      </div>

      {throttled && (preds || []).length > 0 && (
        <p className="text-[10px] text-amber-400 font-semibold mb-1">Refreshing…</p>
      )}
      {rows.length === 0 ? (
        <EmptyState>
          {throttled && !(preds || []).length
            ? "Temporarily unavailable — retrying."
            : "No predictions match these filters yet."}
        </EmptyState>
      ) : (
        <div className="space-y-1.5 max-h-[32rem] overflow-y-auto noir-scrollbar pr-1">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/50 bg-secondary/30 p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate">{r.home} vs {r.away} — {r.market_label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.league} · {new Date(r.kickoff).toLocaleString("en-NG")} · v{r.prediction_version || 1}
                    {(r.prediction_version || 1) > 1 ? " (pre-kickoff update — originals kept)" : ""}
                  </p>
                </div>
                <ResultBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <GradeBadge grade={r.grade} />
                <span className="text-muted-foreground">SCORE {Math.round(r.master_score ?? 0)}</span>
                <span className="text-muted-foreground">PROB {Math.round((r.calibrated_probability || 0) * 100)}%</span>
                <span className="text-muted-foreground">{(r.market_odds || 0) > 1 ? `${r.market_odds.toFixed(2)} (${r.bookmaker || "bookmaker"})` : "MODEL ONLY"}</span>
                {r.big_hammer && <span className="text-primary font-bold">🔨 BIG HAMMER</span>}
                {r.actual_home != null && (
                  <span className="text-muted-foreground">RESULT {r.actual_home}–{r.actual_away} · {r.result_source}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Showing {rows.length} of {(preds || []).length} records · {`grades/market/session filters + team search`} · history can never be rewritten.
      </p>
    </SectionCard>
  );
}