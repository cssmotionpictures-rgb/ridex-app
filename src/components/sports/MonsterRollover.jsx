import React from "react";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buildMonsterRollover, LEGS_PER_DAY, ROLLOVER_DAYS, ZONE_MAX_ODDS, ZONE_MIN_ODDS } from "@/lib/monsterRollover";
import { recordBankuDay } from "@/lib/bankuLedger";
import { resolveParticipantDisplay } from "@/lib/participantIdentity";

function fmt(n) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}m`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

const SPORT_ICONS = { Tennis: "🎾", Basketball: "🏀", Baseball: "⚾", "American football": "🏈", "Ice hockey": "🏒" };

function DayCard({ day, stake }) {
  const ret = stake * day.combined;
  return (
    <div className={`rounded-2xl border p-3 ${day.legs.length ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent" : "border-dashed border-border/60 bg-secondary/20"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-primary whitespace-nowrap">DAY {day.day} · {day.date}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${day.legs.length ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
          {day.legs.length ? `${day.combined.toFixed(2)} ODDS` : "NO QUALIFIERS"}
        </span>
      </div>
      {day.legs.length === 0 ? (
        <div className="py-2 space-y-1.5">
          <p className="text-[10px] font-bold text-center tracking-wider">
            {day.status === "API_ERROR" ? "DATA UNAVAILABLE — VERIFIED FEED ERROR"
              : day.status === "NO_FIXTURES" ? "NO FIXTURES — THE VERIFIED FEEDS CARRY NO ELIGIBLE GAME ON THIS DATE"
              : `${day.fixtureCount} FIXTURES FOUND — NONE CLEARED THE VERIFIED ELIGIBILITY (FORM ON BOTH SIDES + THE ${ZONE_MIN_ODDS}–${ZONE_MAX_ODDS} SWEET SPOT)`}
          </p>
          <p className="text-[9px] text-muted-foreground text-center">
            {day.status === "API_ERROR"
              ? "The scan could not reach the verified feeds — nothing is invented to fill the day. RESCAN to retry."
              : "Nothing is invented to fill an empty day — the next scan brings games the moment real fixtures qualify."}
            {day.feedErrors?.length ? ` · feed issue: ${day.feedErrors.join(", ")}` : ""}
          </p>
          <p className="text-[9px] text-muted-foreground/60 text-center">
            scanned: {Object.entries(day.fixtures || {}).map(([l, n]) => `${l} ${n}`).join(" · ") || "no feed data"}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 mb-2">
            {day.legs.map((l, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2">
                <span className="text-sm shrink-0">{SPORT_ICONS[l.sport] || "🎯"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold truncate">{resolveParticipantDisplay(l.home)} <span className="text-muted-foreground">vs</span> {resolveParticipantDisplay(l.away)}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{l.league} · {resolveParticipantDisplay(l.marketLabel)} · {Math.round(l.probability * 100)}% model{l.h2h ? ` · H2H ${l.h2h}` : ""}</p>
                </div>
                <span className="text-[11px] font-bold text-primary shrink-0">{l.fairOdds.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/70 text-right">{day.fixtureCount} fixtures scanned · {day.eligible} in the sweet spot · {day.legs.length} predictions</p>
          <p className="text-[10px] text-muted-foreground text-right">
            Stake <span className="font-bold text-foreground">{fmt(stake)}</span> → <span className="font-bold text-primary">{fmt(ret)}</span> · all {day.legs.length} legs must win
          </p>
        </>
      )}
    </div>
  );
}

export default function MonsterRollover() {
  const [plan, setPlan] = React.useState(null);
  const [scanning, setScanning] = React.useState(true);
  const [stake, setStake] = React.useState(() => {
    const bank = Number(localStorage.getItem("ridex_pro_bankroll"));
    return bank >= 1000 ? String(Math.round(bank * 0.02)) : "1000"; // 2% of the pro bankroll when set
  });

  const scan = React.useCallback(async (force = false) => {
    setScanning(true);
    try {
      const plan = await buildMonsterRollover(force);
      setPlan(plan);
      // LEDGER — every dealt leg is recorded (slip "monster") so the success
      // tracker below can grade it against the real final score. Idempotent;
      // a recording failure never breaks the scan.
      recordBankuDay(
        plan.days.flatMap((d) => d.legs.map((l) => ({ ...l, prob: l.probability, marketKey: l.side, dayIndex: d.day }))),
        "monster"
      )
        .then(() => window.dispatchEvent(new CustomEvent("ridex-monster-dealt")))
        .catch(() => {});
    } finally {
      setScanning(false);
    }
  }, []);

  React.useEffect(() => {
    scan();
  }, [scan]);

  const stakeAmt = Math.max(0, Number(stake) || 0);
  // Rollover chain: day N's stake is day N-1's full return
  let chain = stakeAmt;
  const stakes = (plan?.days || []).map((d) => {
    const s = chain;
    chain *= d.combined;
    return s;
  });
  const finalReturn = chain;
  const winProbPct = (plan?.winProb || 0) * 100;

  return (
    <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0"><TrendingUp className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">MONSTER {ROLLOVER_DAYS}-DAY ROLLOVER · {LEGS_PER_DAY} GAMES/DAY</p>
          <p className="text-[10px] text-muted-foreground">
            No-draw sports only — tennis, basketball, baseball, American football & ice hockey · every pick inside the {ZONE_MIN_ODDS}–{ZONE_MAX_ODDS} odds sweet spot (≈64%–80% model probability) · verified form on both sides, H2H checked · {ROLLOVER_DAYS} days is the pro limit — nothing longer
          </p>
        </div>
        <button onClick={() => scan(true)} disabled={scanning} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shrink-0 disabled:opacity-50">
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "SCANNING…" : "RESCAN"}
        </button>
      </div>

      {scanning && !plan ? (
        <div className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Scanning the verified no-draw pools for sweet-spot favorites…</p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className="space-y-1 w-32 shrink-0">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Day 1 stake (₦)</p>
              <Input type="number" min="0" className="h-8 rounded-lg text-xs" value={stake} onChange={(e) => setStake(e.target.value)} />
              <div className="flex gap-1">
                {[1000, 2000, 5000].map((v) => (
                  <button key={v} onClick={() => setStake(String(v))} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${Number(stake) === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                    {v / 1000}k
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-primary/10 border border-primary/25 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">If all 6 days roll over</p>
              <p className="text-2xl font-extrabold text-primary leading-none">{fmt(finalReturn)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{plan?.totalLegs || 0} legs · {plan ? plan.totalOdds.toFixed(1) : "—"} total odds · full chain</p>
            </div>
          </div>

          <div className="space-y-2">
            {(plan?.days || []).map((d, i) => (
              <DayCard key={d.date} day={d} stake={stakes[i]} />
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            Honest odds: chance ALL {plan?.totalLegs || 0} legs win across the {ROLLOVER_DAYS} days ≈{" "}
            <span className="text-amber-400 font-semibold">
              {winProbPct >= 0.01 ? `${winProbPct.toFixed(2)}%` : `1 in ${Math.max(1, Math.round(1 / Math.max(plan?.winProb || 1e-12, 1e-12))).toLocaleString()}`}
            </span>{" "}
            — even 4 solid favorites per day compound real risk. One lost leg kills that day's stake, so stake only 1–2% of your bankroll (the Pro Playbook rule) — money you can afford to lose. Odds shown are exact model fair odds (1 ÷ verified probability); day stakes roll the FULL previous day's return. Model probabilities, never guarantees.
          </p>
        </>
      )}
    </div>
  );
}