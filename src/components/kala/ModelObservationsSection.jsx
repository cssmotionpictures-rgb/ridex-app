import React from "react";
import { Microscope } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { sampleLabel } from "@/lib/kala";
import ReliabilityCurve from "@/components/kala/ReliabilityCurve";
import {
  perModelDiagnostics, reliabilityBands, disagreementResearch, oddsRangePerformance,
  clvGroups, marketStatuses, leagueStatuses, lossClusters, errorClassification,
  evidenceLevel, closingSummary,
} from "@/lib/ensemble/diagnostics";

// MODEL OBSERVATIONS LAB (admin-only research view).
// MODEL OBSERVATIONS ARE RESEARCH RECORDS — NEVER BETS. This view exists so
// every voting model can be evaluated per-model against real outcomes, from
// the very first settled observation, without pretending any observation was
// a recommended selection. Only QUALIFIED predictions ever appear on betting
// boards; everything here is explicitly labeled research.

// Data-enrichment investigation status — disclosed honestly, never padded.
const ENRICHMENT_SOURCES = [
  {
    name: "xG (expected goals / against / shot quality)",
    status: "NOT CONNECTED",
    ok: false,
    note: "No verified xG provider available on the connected plans (API-Football does not expose xG; Sportmonks xG/lineups/injuries endpoints are plan-gated 404; Football-Data.org carries no injuries/lineups/xG at all; Sportradar xG is not in the active feed). Disclosed on every scan — the xG model never votes.",
  },
  {
    name: "Injuries / suspensions — API-Football (verified working key)",
    status: "CONNECTED — RX-2.1 CHALLENGER INPUT",
    ok: true,
    note: "Verified live through the app transport (3,168 Premier League injury records on probe). Feeds the RX-2.1 challenger ONLY — the RX-2.0 champion is untouched. The injury voter votes only on Home/Away Win; impact is a transparent absence-count proxy (no player-importance feed is connected), and missing injury data is UNKNOWN, never treated as zero absences. Plan limitation: the current API-Football plan covers injuries roughly from yesterday to the day after tomorrow — board dates outside that window are honestly recorded as UNAVAILABLE, never guessed.",
  },
  {
    name: "Confirmed lineups — API-Football",
    status: "CONNECTED — RX-2.1 CHALLENGER INPUT",
    ok: true,
    note: "Endpoint reachable on the current plan; lineups publish close to kickoff and are captured by the 10-minute heartbeat while KALA is open. A confirmation creates a NEW immutable RX-2.1 snapshot (:v2) — the original is never rewritten. Confirmed lineups reduce uncertainty; they never shift point estimates (no player-importance data exists for an honest probability shift). An unconfirmed lineup within 45 minutes of kickoff raises a WARN risk flag.",
  },
  {
    name: "Match context — rest / travel / fixture congestion / importance",
    status: "PARTIAL",
    ok: false,
    note: "Rest/fatigue is derived from the verified feed's real kickoff timestamps (already a model input). Travel and competition-importance have no verified provider and are disclosed as unavailable.",
  },
];

export default function ModelObservationsSection({ obs, promotionEligible, challenger }) {
  const ch = challenger || { summary: {}, comparison: { n: 0, verdict: "—" } };
  const chS = ch.summary || {};
  const chC = ch.comparison || { n: 0, verdict: "—" };
  const rows = obs || [];
  const settled = rows.filter((r) => ["won", "lost"].includes(r.status));
  const qualified = rows.filter((r) => r.qualified);

  const perModel = React.useMemo(() => perModelDiagnostics(rows), [rows]);
  const bands = React.useMemo(() => reliabilityBands(rows), [rows]);
  const disagree = React.useMemo(() => disagreementResearch(rows), [rows]);
  const oddsBands = React.useMemo(() => oddsRangePerformance(rows), [rows]);
  const clv = React.useMemo(() => clvGroups(rows), [rows]);
  const markets = React.useMemo(() => marketStatuses(rows), [rows]);
  const leagues = React.useMemo(() => leagueStatuses(rows), [rows]);
  const clusters = React.useMemo(() => lossClusters(rows), [rows]);
  const errors = React.useMemo(() => errorClassification(rows), [rows]);
  const evidence = React.useMemo(() => evidenceLevel(rows, promotionEligible), [rows, promotionEligible]);
  const closing = React.useMemo(() => closingSummary(rows), [rows]);

  return (
    <SectionCard
      title="MODEL OBSERVATIONS LAB — RESEARCH RECORDS, NOT BETS"
      icon={<Microscope className="w-4 h-4 text-primary" />}
      sub="Every analyzed candidate — qualified OR rejected — is tracked as a research observation and graded against the real result. This lets every model be measured independently, immediately, from the first settled row. Nothing here is a betting recommendation, and measurement starting now does NOT mean weights change now — that still needs 30+ settled rows."
    >
      {/* EVIDENCE LEVEL — the compact gold-standard metric */}
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
        <p className="text-[11px] font-extrabold text-primary">{evidence.label}</p>
        <p className="text-[10px] text-muted-foreground">{evidence.note}</p>
      </div>

      {/* CHALLENGER — RX-2.1: injury + lineup intelligence, in parallel, never replacing RX-2.0 */}
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-3">
        <p className="text-[11px] font-extrabold text-emerald-300">CHALLENGER — RX-2.1 · INJURY + LINEUP INTELLIGENCE</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Stat label="RX-2.1 ROWS" value={chS.rowsTotal ?? 0} hint={`${chS.latest ?? 0} latest · ${chS.versioned ?? 0} pre-kickoff lineup revisions`} />
          <Stat label="INJURY-INFORMED" value={chS.injuryInformed ?? 0} hint="matched absences on both sides" />
          <Stat label="LINEUPS CONFIRMED" value={chS.lineupConfirmed ?? 0} hint="confirmed pre-kickoff" />
          <Stat label="RX-2.1 QUALIFIED" value={chS.qualified ?? 0} hint="challenger gate — research only, never on boards" />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          RX-2.0 stays the champion on every betting board. HEAD-TO-HEAD: {chC.n
            ? `Brier ${chC.brier20} (RX-2.0) vs ${chC.brier21} (RX-2.1) on ${chC.n} common settled rows`
            : "no common settled rows yet — the comparison begins after the first verified results"} · PROMOTION: {chC.verdict}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="OBSERVATIONS RECORDED" value={rows.length} hint="research records — not bets" />
        <Stat label="QUALIFIED AMONG THEM" value={qualified.length} hint="passed the full betting gate" />
        <Stat label="SETTLED (WON/LOST)" value={settled.length} hint={settled.length ? sampleLabel(settled.length) : "grading starts after kickoff + verified result"} />
        <Stat label="OPEN AWAITING KICKOFF" value={closing.openWithKickoffAhead} hint={`${closing.rowsWithClosingPrice} rows already carry a closing price`} />
      </div>

      {/* PER-MODEL TRACKING */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">PER-MODEL TRACKING — every model measured independently</p>
        {perModel.length === 0 ? (
          <EmptyState>No settled observations yet — per-model Brier / log loss / accuracy tables populate after the first verified results arrive.</EmptyState>
        ) : (
          <div className="rounded-2xl border border-border/50 overflow-x-auto">
            <div className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60 min-w-[420px]">
              <span>MODEL</span><span>SAMPLE</span><span>BRIER</span><span>LOG LOSS</span><span>CAL ERR</span><span>DIRECTIONAL</span>
            </div>
            {perModel.map((m) => (
              <div key={m.key} className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 min-w-[420px]">
                <span className="font-bold">{m.key}</span>
                <span>{m.n}</span>
                <span>{m.brier ?? "—"}</span>
                <span>{m.logLoss ?? "—"}</span>
                <span>{m.calErrPct != null ? `${m.calErrPct > 0 ? "+" : ""}${m.calErrPct}pp` : "—"}</span>
                <span>{m.directionalPct != null ? `${m.directionalPct}%` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RELIABILITY CURVE */}
      <ReliabilityCurve bands={bands} />

      {/* DISAGREEMENT RESEARCH */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">MODEL DISAGREEMENT RESEARCH — does agreement actually predict success?</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-5 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
            <span>AGREEMENT</span><span>SAMPLE</span><span>WIN RATE</span><span>BRIER</span><span>CAL ERR</span>
          </div>
          {disagree.map((d) => (
            <div key={d.bucket} className="grid grid-cols-5 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30">
              <span className="font-bold">{d.bucket}</span>
              <span>{d.n}</span>
              <span>{d.winRatePct != null ? `${d.winRatePct}%` : "—"}</span>
              <span>{d.brier ?? "—"}</span>
              <span>{d.calErrPct != null ? `${d.calErrPct > 0 ? "+" : ""}${d.calErrPct}pp` : "—"}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Evidence decides: if LOW agreement consistently performs badly its penalty increases; if HIGH agreement is not predictive it gains no extra weight. Until samples form, no conclusion is drawn.
        </p>
      </div>

      {/* ODDS-RANGE PERFORMANCE */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">ODDS-RANGE PERFORMANCE — confidence vs odds, never confused</p>
        <div className="rounded-2xl border border-border/50 overflow-x-auto">
          <div className="grid grid-cols-7 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60 min-w-[520px]">
            <span>RANGE</span><span>SAMPLE</span><span>PREDICTED</span><span>ACTUAL</span><span>BRIER</span><span>CLV</span><span>PAPER ROI</span>
          </div>
          {oddsBands.map((b) => (
            <div key={b.band} className="grid grid-cols-7 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 min-w-[520px]">
              <span className="font-bold">{b.band}</span>
              <span>{b.n}</span>
              <span>{b.predictedPct != null ? `${b.predictedPct}%` : "—"}</span>
              <span>{b.actualPct != null ? `${b.actualPct}%` : "—"}</span>
              <span>{b.brier ?? "—"}</span>
              <span>{b.clvAvgPct != null ? `${b.clvAvgPct}%` : "—"}</span>
              <span>{b.paperRoiPct != null ? `${b.paperRoiPct}%` : "—"}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          The 3.00+ rows are BIG HAMMER RESEARCH MODE: the production gate stays 3.00+, and no claim that BIG HAMMER works is made until a sufficient settled sample exists.
        </p>
      </div>

      {/* CLV */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">CLOSING-LINE VALUE (CLV)</p>
        {clv.computable === 0 ? (
          <EmptyState>
            CLV = NOT AVAILABLE YET — it is computed only when both a real prediction-time price and a verified pre-kickoff closing price exist. Closing capture is running; the first computable rows appear after games settle.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="CLV-ELIGIBLE ROWS" value={clv.computable} hint={`of ${clv.totalSettled} settled`} />
            <Stat label="ALL OBSERVATIONS" value={`${clv.all ?? "—"}%`} hint="avg closing-line value" />
            <Stat label="QUALIFIED ONLY" value={clv.qualifiedOnly != null ? `${clv.qualifiedOnly}%` : "—"} />
            <Stat label="3.00+ (BIG HAMMER)" value={clv.bigHammer != null ? `${clv.bigHammer}%` : "—"} />
            <Stat label="BY MARKET" value={clv.byMarket.length} hint="groups below in the audit" />
            <Stat label="BY LEAGUE" value={clv.byLeague.length} />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          Closing price = the latest verified price captured strictly BEFORE kickoff. Post-kickoff prices are never used, and a missing closing price is recorded as NOT AVAILABLE, never backfilled.
        </p>
      </div>

      {/* MARKET / LEAGUE RESTRICTION ENGINES */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">MARKET RESTRICTION ENGINE</p>
          {markets.length === 0 ? (
            <EmptyState>No settled observations yet.</EmptyState>
          ) : (
            <div className="rounded-2xl border border-border/50 overflow-hidden">
              {markets.slice(0, 10).map((m) => (
                <div key={m.key} className="px-3 py-1.5 text-[11px] border-b border-border/30 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold truncate">{m.key}</span>
                    <span className="text-muted-foreground shrink-0">n={m.n}</span>
                  </div>
                  <p className={`text-[10px] ${m.status.startsWith("ACTIVE") ? "text-emerald-300" : m.status.startsWith("WATCH") ? "text-amber-300" : "text-rose-300"}`}>{m.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">LEAGUE RESTRICTION ENGINE</p>
          {leagues.length === 0 ? (
            <EmptyState>No settled observations yet.</EmptyState>
          ) : (
            <div className="rounded-2xl border border-border/50 overflow-hidden">
              {leagues.slice(0, 10).map((l) => (
                <div key={l.key} className="px-3 py-1.5 text-[11px] border-b border-border/30 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold truncate">{l.key}</span>
                    <span className="text-muted-foreground shrink-0">n={l.n}</span>
                  </div>
                  <p className={`text-[10px] ${l.status.startsWith("ACTIVE") ? "text-emerald-300" : l.status.startsWith("WATCH") ? "text-amber-300" : "text-rose-300"}`}>{l.status}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">No league is permanently trusted because it is popular — and nothing is restricted from a small sample.</p>
        </div>
      </div>

      {/* LOSS CLUSTERS + ERROR CLASSIFICATION */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">LOSS CLUSTER DETECTION</p>
          {clusters.length === 0 ? (
            <EmptyState>No repeated failure pattern detected yet — detection requires 20+ settled rows with a 10pp+ deviation. Patterns found are sent to challenger evaluation, never silently rewritten.</EmptyState>
          ) : (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
              {clusters.map((c, i) => (
                <div key={i} className="px-3 py-2 text-[11px] border-b border-border/30 last:border-0">
                  <p className="font-extrabold text-rose-300">{c.pattern}</p>
                  <p className="text-[10px] text-muted-foreground">{c.evidence}</p>
                  <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">ERROR CLASSIFICATION — losses are analyzed, not just counted</p>
          {errors.lostTotal === 0 ? (
            <EmptyState>No lost observations to classify yet.</EmptyState>
          ) : (
            <div className="rounded-2xl border border-border/50 overflow-hidden">
              {Object.entries(errors.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <div key={k} className="flex justify-between gap-2 px-3 py-1.5 text-[11px] border-b border-border/30 last:border-0">
                  <span className="min-w-0">{k}</span>
                  <b className="shrink-0">{n}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DATA ENRICHMENT — investigation status, disclosed */}
      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">DATA ENRICHMENT — provider investigation (accuracy · freshness · reliability · cost · rate limits · coverage · licensing)</p>
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          {ENRICHMENT_SOURCES.map((s) => (
            <div key={s.name} className="px-3 py-2 border-b border-border/30 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold">{s.name}</p>
                <span className={`text-[10px] font-extrabold shrink-0 ${s.ok ? "text-emerald-300" : s.status === "PARTIAL" ? "text-amber-300" : "text-rose-300"}`}>{s.status}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          A provider is added only after it passes accuracy/freshness/reliability/cost/coverage/licensing evaluation — never merely because it has a large amount of data.
        </p>
      </div>
    </SectionCard>
  );
}