import React from "react";
import { ClipboardPaste, Loader2, CircleCheck, CircleX, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { analyzeRideXResults } from "@/lib/globalLearning/importFlow";
import SportyBetReport from "@/components/intelligence/SportyBetReport";

const STEPS = ["READING", "RETRYING", "PARSING", "MATCHING", "VERIFYING", "SETTLING", "ANALYZING + LEARNING"];

export default function ImportSection({ batches, onDone }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [steps, setSteps] = React.useState([]);
  const [result, setResult] = React.useState(null);

  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setSteps([]);
    setResult(null);
    try {
      const res = await analyzeRideXResults(text, {
        onProgress: (s) => setSteps((x) => (x.includes(s) ? x : [...x, s])),
      });
      setResult(res);
      onDone?.(res.duplicate || res.paused ? null : res);
    } catch (e) {
      setResult({ error: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="PREDICTION RESULT IMPORT"
      icon={<ClipboardPaste className="w-4 h-4 text-primary" />}
      sub="Paste results from ANY RIDE X prediction section — WIN RABA slips, KALA picks, BIG HAMMER, 5-Day Rollover, morning/evening scans, accumulators or manual predictions — or paste FULL SportyBet ticket text, including multiple tickets and large accumulator slips (Ticket ID, Game ID, kickoff, FT Score, Pick, Odds, Market, Outcome — duplicates and pending legs all handled). Messy formatting is fine. Each leg is graded independently from its FT score, unmatched legs are kept as external historical evidence, user results never override a conflicting verified-provider result, and the same text pasted twice is refused."
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={`e.g.\nWIN RABA morning slip\nArsenal 2-1 Chelsea Over 2.5 @1.90 WON\nCF Estrela da Amadora 1-1 Sporting Braga DNB Home 2026-09-10\nKALA pick: Bayern Munich 3-0 Werder Bremen Home Win @1.45`}
        className="w-full rounded-2xl border border-border/60 bg-secondary/40 p-3 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-3">
        <Button onClick={analyze} disabled={busy || !text.trim()} className="rounded-full font-bold">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          {busy ? "ANALYZING…" : "ANALYZE RIDE X RESULTS"}
        </Button>
        {busy && (
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((s) => (
              <span
                key={s}
                className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                  steps.includes(s) ? "border-primary/60 text-primary" : "border-border text-muted-foreground opacity-40"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {result?.duplicate && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] font-bold text-amber-300">
          ALREADY IMPORTED — this exact result text was processed on {result.batch?.imported_at ? new Date(result.batch.imported_at).toLocaleString() : "an earlier date"}. Nothing was double-counted.
        </div>
      )}
      {result?.paused && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] font-bold text-amber-300">
          {result.customerMessage || "Import temporarily paused. Please retry shortly. No records were changed."}
        </div>
      )}
      {result?.partial && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11px] font-bold text-amber-300">
          PARTIAL — REVIEW REQUIRED — records were imported, but the learning queue could not be refreshed. Re-run the import or a section sync to refresh it.
        </div>
      )}
      {result?.error && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-[11px] font-bold text-rose-300">
          IMPORT FAILED — {result.error}
        </div>
      )}
      {result && !result.duplicate && !result.error && !result.paused && result.sportybet && <SportyBetReport result={result} />}
      {result && !result.duplicate && !result.error && !result.paused && !result.sportybet && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="PARSED" value={result.counts.parsed} hint={`${result.counts.unresolved} unresolved (shown, never guessed)`} />
            <Stat label="MATCHED" value={result.counts.exact + result.counts.high} hint={`${result.counts.possible} possible · ${result.counts.unmatched} no match · ${result.counts.alreadySettled} already settled`} />
            <Stat label="SETTLED" value={result.settledOutcomes} hint={`${result.counts.verified} verified · ${result.counts.userSupplied} user-supplied`} />
            <Stat label="CONFLICTS" value={result.counts.conflicts} hint="review required — never auto-settled" tone={result.counts.conflicts ? "text-amber-300" : ""} />
            <Stat label="WINS" value={result.counts.wins} tone="text-emerald-300" />
            <Stat label="LOSSES" value={result.counts.losses} tone="text-rose-300" />
            <Stat label="VOID / PUSH" value={result.counts.voids} hint="count toward nothing" />
            <Stat label="INSIGHTS" value={result.learning.created + result.learning.updated} hint="learning queue refreshed" tone="text-primary" />
          </div>
          {result.detail.length > 0 && (
            <div className="rounded-2xl border border-border/50 overflow-hidden">
              {result.detail.map((d, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px] border-b border-border/30 last:border-0">
                  {/SETTLED/.test(d.outcome) ? (
                    <CircleCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : /CONFLICT|POSSIBLE/.test(d.outcome) ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  ) : (
                    <CircleX className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{d.teams} <span className="text-muted-foreground">{d.score}</span></p>
                    <p className="text-muted-foreground">{d.outcome}{d.verifiedScore ? ` · user ${d.userScore} vs verified ${d.verifiedScore}` : ""}{d.reason ? ` · ${d.reason}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!result && !busy && (
        <EmptyState>Paste any RIDE X result list above and tap ANALYZE — results are matched to the predictions on record, verified where the provider covers the league, and settled under each market's official rule.</EmptyState>
      )}
      {(batches || []).length > 0 && (
        <div>
          <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">IMPORT HISTORY (duplicate-protected)</p>
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <div className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
              <span className="col-span-2">DATE</span><span>MATCHED</span><span>SETTLED</span><span>W/L</span><span>CONFLICTS</span>
            </div>
            {batches.slice(0, 12).map((b) => (
              <div key={b.id} className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30">
                <span className="col-span-2 truncate">{new Date(b.imported_at).toLocaleString()} {b.source_guess ? `· ${b.source_guess}` : ""}</span>
                <span>{(b.exact_matches || 0) + (b.high_matches || 0)}/{(b.parsed_count || 0)}</span>
                <span>{(b.verified_count || 0) + (b.user_supplied_count || 0)}</span>
                <span className="text-emerald-300">{b.wins || 0}<span className="text-muted-foreground">/</span><span className="text-rose-300">{b.losses || 0}</span></span>
                <span className={b.conflicts ? "text-amber-300 font-bold" : ""}>{b.conflicts || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}