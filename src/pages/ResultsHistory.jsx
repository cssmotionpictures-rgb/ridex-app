import React from "react";
import { History, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { base44 } from "@/api/base44Client";
import { canonicalizeRows } from "@/lib/globalLearning/canonicalProjection";
import { resolveParticipantDisplay } from "@/lib/participantIdentity";

// RESULTS & HISTORY — the customer-facing record of every finished RIDE X
// intelligent prediction, filterable by date and service. Customers see what
// was picked, when, at what confidence, and the real verified result —
// nothing about how the engine works.
const SETTLED = ["won", "lost", "void", "push", "cancelled"];
const SECTION_LABELS = {
  kala: "KALA",
  "win-raba": "WIN RABA",
  "run-o": "RUN O",
  "big-hammer": "BIG HAMMER",
  rollover: "5-DAY ROLLOVER",
  banku: "BANKU",
  monster: "MONSTER",
  "kala-drop": "KALA DROPS",
  manual: "MANUAL",
};
const RESULT_STYLES = {
  won: "text-emerald-300",
  lost: "text-rose-300",
  void: "text-muted-foreground",
  push: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};
const RESULT_LABELS = { won: "WON", lost: "LOST", void: "VOID", push: "VOID", cancelled: "CANCELLED" };

export default function ResultsHistory() {
  const [rows, setRows] = React.useState(null);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [section, setSection] = React.useState("all");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      // One bounded read per settled status — no page is ever fetched twice.
      // Rows are then projected to ONE CANONICAL ROW PER PREDICTION IDENTITY
      // (global_prediction_id): duplicate / re-ingestion copies on the immutable
      // ledger are never displayed or counted as separate finished predictions.
      // The ledger itself is untouched — raw copies stay available to audit.
      const out = [];
      for (const st of SETTLED) {
        if (out.length) await new Promise((r) => setTimeout(r, 350)); // pace reads
        const rows = await base44.entities.GlobalPredictionLedger
          .filter({ status: st }, "-settled_at", 1000).catch(() => []);
        out.push(...(rows || []));
      }
      if (alive) setRows(canonicalizeRows(out).filter((r) => SETTLED.includes(r?.status)));
    })();
    return () => { alive = false; };
  }, []);

  const sections = React.useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => {
      const key = r.source_section || "manual";
      if (!m.has(key)) m.set(key, SECTION_LABELS[key] || String(key).toUpperCase());
    });
    return [...m.entries()];
  }, [rows]);

  const filtered = React.useMemo(() => {
    return (rows || [])
      .filter((r) => section === "all" || (r.source_section || "manual") === section)
      .filter((r) => !from || String(r.lagos_date_key || "") >= from)
      .filter((r) => !to || String(r.lagos_date_key || "") <= to)
      .sort((a, b) => String(b.lagos_date_key || "").localeCompare(String(a.lagos_date_key || "")) || String(b.kickoff || "").localeCompare(String(a.kickoff || "")));
  }, [rows, section, from, to]);

  const won = filtered.filter((r) => r.status === "won").length;
  const lost = filtered.filter((r) => r.status === "lost").length;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X · RESULTS"
        title="Results & History"
        subtitle="Every finished intelligent prediction on record — filter by date and service. All results are graded from real final scores, never edited after the fact."
      />

      {/* FILTERS */}
      <div className="rounded-3xl border border-border/60 bg-card/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">From</p>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border border-input bg-secondary/60 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">To</p>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border border-input bg-secondary/60 px-3 py-2 text-xs"
            />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setSection("all")}
            className={`rounded-full px-3 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] ${
              section === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            ALL SERVICES
          </button>
          {sections.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`rounded-full px-3 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] ${
                section === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* SUMMARY */}
      {rows && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
          <span className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 font-bold">
            {filtered.length} FINISHED {filtered.length === 1 ? "PREDICTION" : "PREDICTIONS"}
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-bold text-emerald-300">{won} WON</span>
          <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 font-bold text-rose-300">{lost} LOST</span>
          <span className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-muted-foreground">
            {filtered.length - won - lost} VOID — COUNT TOWARD NOTHING
          </span>
        </div>
      )}

      {/* LIST */}
      <div className="mt-4 space-y-2">
        {rows === null ? (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-2">
            <Loader2 className="w-7 h-7 text-primary mx-auto animate-spin" />
            <p className="text-sm font-bold">LOADING RESULTS…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-2">
            <History className="w-7 h-7 text-muted-foreground mx-auto" />
            <p className="text-sm font-bold">
              {rows.length === 0
                ? "NO FINISHED PREDICTIONS YET"
                : "NO FINISHED PREDICTIONS MATCH THESE FILTERS"}
            </p>
            <p className="text-xs text-muted-foreground">
              Results appear here automatically once matches finish and the real final score is verified.
            </p>
          </div>
        ) : (
          filtered.slice(0, 300).map((r) => {
            const score =
              r.actual_home != null && r.actual_away != null ? `${r.actual_home}–${r.actual_away}` : "—";
            const priced = (r.market_odds || 0) > 1;
            return (
              <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[10px] font-extrabold text-primary shrink-0 w-[74px]">
                  {r.lagos_date_key || "—"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground shrink-0">
                  {SECTION_LABELS[r.source_section] || String(r.source_section || "—").toUpperCase()}
                </span>
                <span className="text-xs font-bold truncate min-w-0 flex-1">
                  {resolveParticipantDisplay(r.home)} vs {resolveParticipantDisplay(r.away)}
                </span>
                <span className="text-[11px] text-primary font-semibold truncate max-w-[45%]">
                  {resolveParticipantDisplay(r.market_label)}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {Math.round(r.confidence || 0)}% CONFIDENCE
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {priced ? `@${Number(r.market_odds).toFixed(2)}` : "UNPRICED"}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">FINAL {score}</span>
                <span className={`text-[10px] font-extrabold tracking-wide shrink-0 ${RESULT_STYLES[r.status] || ""}`}>
                  {RESULT_LABELS[r.status] || String(r.status).toUpperCase()}
                </span>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 300 && (
        <p className="text-[10px] text-muted-foreground mt-3">Showing the latest 300 — narrow the date range to see older results.</p>
      )}

      <p className="text-[10px] text-muted-foreground mt-6">
        The RIDE X Intelligent Engine continuously improves its service based on performance. Every record above was
        locked in before kickoff and graded from the real final score — history is never rewritten.
      </p>
    </div>
  );
}