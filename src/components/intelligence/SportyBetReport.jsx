import React from "react";
import { Stat } from "@/components/kala/Bits";

// SPORTYBET HISTORICAL IMPORT REPORT — live, reconcilable counters for a
// full-batch SportyBet ticket import. Aggregates shown are HISTORICAL CONTEXT,
// never validated learning: external results are research evidence and are
// never attributed to RIDE X. PRODUCTION PROMOTIONS from a single batch: 0.
const pct = (w, of) => (of > 0 ? `${Math.round((w / of) * 100)}%` : "—");

function MiniTable({ title, rows, emptyNote }) {
  const entries = Object.entries(rows || {}).filter(([, r]) => r.legs > 0);
  return (
    <div className="rounded-2xl border border-border/50 overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">{title}</div>
      {entries.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">{emptyNote}</p>
      ) : (
        entries.map(([k, r]) => (
          <div key={k} className="grid grid-cols-4 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30">
            <span className="truncate font-bold col-span-1">{k}</span>
            <span className="text-muted-foreground">{r.legs} legs</span>
            <span><span className="text-emerald-300">{r.wins}</span><span className="text-muted-foreground">/</span><span className="text-rose-300">{r.losses}</span>{r.pushes ? <span className="text-muted-foreground"> / {r.pushes}P</span> : null}</span>
            <span className="font-bold">{pct(r.wins, r.wins + r.losses)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function SportyBetReport({ result }) {
  const c = result.counts;
  const reconciliationOk = c.legsParsed === c.settled + c.pending + c.suppliedOnly + c.unresolved + c.conflicts;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="TICKETS DETECTED" value={c.ticketsDetected} hint={`${c.uniqueTickets} unique · ${c.duplicateTickets} duplicate cop${c.duplicateTickets === 1 ? "y" : "ies"} rejected`} />
        <Stat label="LEGS PARSED" value={c.legsParsed} hint={`unique historical observations after dedup`} />
        <Stat label="SETTLED FROM SCORE" value={c.settled} hint={`${c.suppliedOnly} supplied-only · ${c.pending} pending · ${c.unresolved} unresolved`} />
        <Stat label="CONFLICTS" value={c.conflicts} hint="supplied vs canonical — both preserved" tone={c.conflicts ? "text-amber-300" : ""} />
        <Stat label="WINS" value={c.wins} tone="text-emerald-300" hint="leg-level, independently graded" />
        <Stat label="LOSSES" value={c.losses} tone="text-rose-300" hint="leg-level, independently graded" />
        <Stat label="PUSHES" value={c.pushes} hint="count toward nothing" />
        <Stat label="DUPLICATES REJECTED" value={c.duplicatesRejected} hint="never double-counted" />
        <Stat label="RIDE X MATCHED" value={c.rideXMatched} hint={`${c.verified} verified · ${c.userSupplied} user-supplied settles`} />
        <Stat label="EXTERNAL HISTORICAL" value={c.externalHistorical} hint="retained research evidence — never a RIDE X result" />
        <Stat label="LEDGER OUTCOMES" value={result.settledOutcomes} hint={`${c.alreadySettled} already settled earlier`} />
        <Stat label="INSIGHTS" value={(result.learning?.created || 0) + (result.learning?.updated || 0)} hint="existing learning queue refreshed" tone="text-primary" />
      </div>

      <p className={`text-[10px] font-bold ${reconciliationOk ? "text-muted-foreground" : "text-rose-300"}`}>
        COUNTER RECONCILIATION: {c.legsParsed} LEGS = {c.settled} SETTLED + {c.suppliedOnly} SUPPLIED-ONLY + {c.pending} PENDING + {c.unresolved} UNRESOLVED + {c.conflicts} CONFLICTS
        {reconciliationOk ? " ✓" : " — MISMATCH, REVIEW REQUIRED"}
      </p>

      {(result.tickets || []).length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60">
            TICKET RECORDS — individual leg quality is analyzed SEPARATELY from accumulator structure risk
          </div>
          {result.tickets.map((t, i) => (
            <div key={i} className="grid grid-cols-6 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30">
              <span className="col-span-2 truncate font-bold">
                TICKET {String(t.ticketId).replace("sportybet|", "")}
                {t.duplicate ? <span className="text-muted-foreground font-normal"> · duplicate — nothing recounted</span> : ""}
              </span>
              <span className="text-muted-foreground">{t.legs} legs</span>
              <span><span className="text-emerald-300">{t.wins}</span><span className="text-muted-foreground">/</span><span className="text-rose-300">{t.losses}</span><span className="text-muted-foreground">/{t.pushes}P</span></span>
              <span className="text-muted-foreground">{t.pending} pending</span>
              <span className={`font-bold ${t.status === "lost" ? "text-rose-300" : t.status === "won" ? "text-emerald-300" : "text-muted-foreground"}`}>
                {t.status === "lost" && t.wins > 0 ? `LOST TICKET — ${t.wins} legs still WON` : String(t.status).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        <MiniTable title="MARKET PERFORMANCE — historical context, not validated learning" rows={result.marketReport} emptyNote="no independently settled legs in this batch" />
        <MiniTable title="ODDS-BAND PERFORMANCE — historical context, not validated learning" rows={result.oddsBands} emptyNote="no independently settled legs in this batch" />
      </div>

      <p className="text-[10px] text-muted-foreground">
        EVIDENCE ACCUMULATING — every valid leg was retained (matched legs settle the existing RIDE X ledger; unmatched legs are kept as external historical research evidence, never attributed to a RIDE X prediction). Ticket-level losses never mark their winning legs as bad. Learning from these observations enters the existing evidence-gated queue only: backtest → walk-forward → challenger → out-of-sample. PRODUCTION PROMOTIONS FROM THIS BATCH: 0.
      </p>
    </div>
  );
}