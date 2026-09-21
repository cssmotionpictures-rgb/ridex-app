import React from "react";
import { Wallet, Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { SectionCard, EmptyState, RiskBadge, Stat } from "@/components/kala/Bits";
import { analyzeTicket, KALA_DEFAULTS } from "@/lib/kala";

const parseLegs = (t) => {
  try { return JSON.parse(t.legs_json || "[]"); } catch { return []; }
};

// CASHOUT INTELLIGENCE — pure analysis of imported slips. Labels are HOLD /
// REVIEW / HIGH RISK / CASHOUT-WORTHY-CONSIDERING with reasons; KALA never
// executes a cashout and never claims it is guaranteed better or worse.
export default function CashoutSection({ preds, settings }) {
  const [tickets, setTickets] = React.useState([]);
  const [form, setForm] = React.useState({ name: "", bookmaker: "", stake: "", ret: "", cashout: "" });
  const [legs, setLegs] = React.useState([{ home: "", away: "", market: "", odds: "", currentOdds: "" }]);
  const [busy, setBusy] = React.useState(false);
  const [analysis, setAnalysis] = React.useState({}); // ticketId -> analysis

  const load = async () => {
    const rows = await base44.entities.KalaTicket.filter({}, "-created_date", 50).catch(() => []);
    setTickets(rows || []);
  };
  React.useEffect(() => { load(); }, []);

  const saveTicket = async () => {
    const clean = legs
      .map((l) => ({
        home: l.home.trim(), away: l.away.trim(), market: l.market.trim(),
        odds: Number(l.odds) || 0, currentOdds: Number(l.currentOdds) || 0,
        status: "pending",
      }))
      .filter((l) => l.home && l.away && l.market);
    if (!form.name.trim() || !clean.length) return;
    setBusy(true);
    try {
      await base44.entities.KalaTicket.create({
        ticket_name: form.name.trim(),
        bookmaker: form.bookmaker.trim(),
        stake: Number(form.stake) || 0,
        potential_return: Number(form.ret) || 0,
        cashout_offered: Number(form.cashout) || 0,
        legs_json: JSON.stringify(clean),
        status: "open",
      });
      setForm({ name: "", bookmaker: "", stake: "", ret: "", cashout: "" });
      setLegs([{ home: "", away: "", market: "", odds: "", currentOdds: "" }]);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = (t) => {
    const prev = (() => {
      try { return JSON.parse(t.analysis_json || "[]"); } catch { return null; }
    })();
    const a = analyzeTicket(
      { legs: parseLegs(t), potential_return: t.potential_return, cashout_offered: t.cashout_offered },
      preds,
      settings || KALA_DEFAULTS,
      prev ? JSON.stringify(prev.map((l) => ({ estimate: l.estimate }))) : null
    );
    setAnalysis((prevMap) => ({ ...prevMap, [t.id]: a }));
    // Persist the snapshot so Rule C (probability drop) can compare next time.
    base44.entities.KalaTicket.update(t.id, { analysis_json: JSON.stringify(a.legs.map((l) => ({ estimate: l.estimate }))) }).catch(() => {});
  };

  const setLegStatus = async (t, idx, status) => {
    const ls = parseLegs(t).map((l, i) => (i === idx ? { ...l, status } : l));
    await base44.entities.KalaTicket.update(t.id, { legs_json: JSON.stringify(ls) }).catch(() => {});
    await load();
  };

  const removeTicket = async (id) => {
    await base44.entities.KalaTicket.delete(id).catch(() => {});
    await load();
  };

  const verdictTone = {
    HOLD: "text-emerald-300",
    REVIEW: "text-amber-300",
    "HIGH RISK": "text-rose-300",
    "CASHOUT-WORTHY-CONSIDERING": "text-sky-300",
  };

  const input = "rounded-xl bg-secondary border border-border px-2.5 py-1.5 text-xs w-full";

  return (
    <SectionCard
      title="CASHOUT INTELLIGENCE"
      icon={<Wallet className="w-4 h-4 text-primary" />}
      sub="Import an existing bet slip — KALA reconstructs each remaining leg, estimates probability from its immutable pre-kickoff records (or the current odds you enter) and labels the decision. Analysis only: KALA never executes a bookmaker cashout."
    >
      {/* --- Add ticket --- */}
      <div className="rounded-2xl border border-border/50 bg-secondary/30 p-3.5 space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input className={input} placeholder="Ticket name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="Bookmaker" value={form.bookmaker} onChange={(e) => setForm({ ...form, bookmaker: e.target.value })} />
          <input className={input} placeholder="Stake ₦" inputMode="decimal" value={form.stake} onChange={(e) => setForm({ ...form, stake: e.target.value })} />
          <input className={input} placeholder="Potential return ₦" inputMode="decimal" value={form.ret} onChange={(e) => setForm({ ...form, ret: e.target.value })} />
          <input className={input} placeholder="Cashout offered ₦ (0 if none)" inputMode="decimal" value={form.cashout} onChange={(e) => setForm({ ...form, cashout: e.target.value })} />
        </div>
        <div className="space-y-2">
          {legs.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
              <input className={input} placeholder="Home team" value={l.home} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, home: e.target.value } : x)))} />
              <input className={input} placeholder="Away team" value={l.away} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, away: e.target.value } : x)))} />
              <input className={input} placeholder="Market (e.g. Over 2.5)" value={l.market} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, market: e.target.value } : x)))} />
              <input className={input} placeholder="Leg odds" inputMode="decimal" value={l.odds} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, odds: e.target.value } : x)))} />
              <div className="flex gap-1.5">
                <input className={input} placeholder="Current odds" inputMode="decimal" value={l.currentOdds} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, currentOdds: e.target.value } : x)))} />
                {legs.length > 1 && (
                  <button type="button" className="text-muted-foreground shrink-0 px-1" onClick={() => setLegs(legs.filter((_, j) => j !== i))} aria-label="Remove leg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLegs([...legs, { home: "", away: "", market: "", odds: "", currentOdds: "" }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add leg
          </Button>
          <Button size="sm" className="rounded-full font-bold" disabled={busy || !form.name.trim()} onClick={saveTicket}>
            IMPORT SLIP
          </Button>
        </div>
      </div>

      {/* --- Tickets --- */}
      {tickets.length === 0 ? (
        <EmptyState>No imported slips yet — add one above to run the cashout analysis.</EmptyState>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const a = analysis[t.id];
            const ls = parseLegs(t);
            return (
              <div key={t.id} className="rounded-2xl border border-border/50 bg-secondary/30 p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{t.ticket_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.bookmaker || "bookmaker"} · stake ₦{(t.stake || 0).toLocaleString()} · return ₦{(t.potential_return || 0).toLocaleString()} · cashout offered ₦{(t.cashout_offered || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-[11px]" onClick={() => runAnalysis(t)}>
                      <RefreshCw className="w-3 h-3 mr-1" /> ANALYZE
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeTicket(t.id)} aria-label="Delete ticket">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {ls.map((l, i) => (
                    <div key={i} className="rounded-xl bg-background/50 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold min-w-0">
                          <span className="truncate block">{l.home} vs {l.away} — {l.market}</span>
                          <span className="text-[10px] text-muted-foreground">
                            odds {l.odds || "—"}
                            {l.currentOdds ? ` · current ${l.currentOdds}` : ""}
                            {a ? ` · ${a.legs[i]?.source || ""}` : ""}
                          </span>
                        </p>
                        <div className="flex gap-1 shrink-0">
                          {["pending", "won", "lost"].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setLegStatus(t, i, s)}
                              className={`text-[9px] px-2 py-0.5 rounded-full border ${
                                (l.status || "pending") === s
                                  ? s === "won" ? "bg-emerald-400/20 border-emerald-400/50 text-emerald-300"
                                  : s === "lost" ? "bg-rose-400/20 border-rose-400/50 text-rose-300"
                                  : "bg-secondary border-border text-foreground"
                                  : "border-border/50 text-muted-foreground"
                              }`}
                            >
                              {s.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      {a && a.legs[i]?.estimate != null && (
                        <p className="text-[10px] text-primary mt-0.5">
                          KALA estimate {Math.round(a.legs[i].estimate * 100)}%
                          {a.legs[i].dropPct ? ` · dropped ${a.legs[i].dropPct}pp vs last analysis` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {a && (
                  <div className="rounded-2xl bg-background/60 border border-border/50 p-3.5 space-y-2.5">
                    <p className="text-sm font-extrabold">
                      KALA VERDICT: <span className={verdictTone[a.verdict] || "text-foreground"}>{a.verdict}</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="REMAINING LEGS" value={a.pendingCount} />
                      <Stat label="REMAINING PROBABILITY" value={a.remainingProb != null ? `${a.remainingProb}%` : "—"} hint={a.pendingCount ? a.approxNote : ""} />
                      <Stat label="ESTIMATED VALUE" value={a.valueEstimate != null ? `₦${a.valueEstimate.toLocaleString()}` : "—"} />
                      <Stat label="CASHOUT / VALUE" value={a.cashoutRatio != null ? `${a.cashoutRatio}%` : "—"} />
                    </div>
                    {a.weakest && (
                      <p className="text-[11px] text-muted-foreground">
                        WEAKEST REMAINING LEG: {a.weakest.home} vs {a.weakest.away} — {a.weakest.market}
                        {a.weakest.estimate != null ? ` (${Math.round(a.weakest.estimate * 100)}%)` : " (no estimate)"} ·
                        BIGGEST RISK is the leg with the lowest model probability.
                      </p>
                    )}
                    <div className="space-y-1">
                      {a.reasons.map((r, i) => <p key={i} className="text-[11px] text-foreground/90">• {r}</p>)}
                    </div>
                    {a.alerts.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-extrabold text-amber-300">CASHOUT AUTO-RULES TRIGGERED</p>
                        {a.alerts.map((al, i) => <p key={i} className="text-[11px] text-muted-foreground">⚠ {al}</p>)}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <RiskBadge risk={a.pendingCount && a.remainingProb != null ? (a.remainingProb >= 55 ? "LOW" : a.remainingProb >= 30 ? "MEDIUM" : "HIGH") : "MEDIUM"} />
                      <p className="text-[10px] text-muted-foreground">
                        CASHOUT PRESSURE: {a.cashoutRatio != null ? `${a.cashoutRatio}% of estimated remaining value offered` : "no cashout offer entered"}. Analytical labels only — never financial advice, never executed.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}