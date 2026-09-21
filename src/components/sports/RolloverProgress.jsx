import React from "react";
import { TrendingUp, Target, RotateCcw, Bell, Mail, CalendarPlus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { openEmail, milestoneEmailBody, withdrawalCalendarLink } from "@/lib/milestoneDelivery";
import { logBetAudit } from "@/lib/betAuditLog";

// 7-day rollover, 4 games/day (2 morning + 2 evening) = 28 games per run.
// Each WON doubles the bankroll @ 2.0 odds. A LOST game ends the run, records
// it to history (wins + peak bankroll), and auto-starts a fresh 7-day roll
// from the same starting stake — previous results are always kept.
// Starting amount is fully custom (₦10 and up). Milestone delivery is 100%
// in-browser (Gmail compose + Google Calendar template link, no credits).

const TIERS = [
  { label: "₦100", value: 100 }, { label: "₦500", value: 500 },
  { label: "₦1k", value: 1000 }, { label: "₦5k", value: 5000 },
  { label: "₦10k", value: 10000 }, { label: "₦25k", value: 25000 },
  { label: "₦50k", value: 50000 }, { label: "₦100k", value: 100000 },
  { label: "₦200k", value: 200000 }, { label: "₦500k", value: 500000 },
  { label: "₦1m", value: 1000000 }, { label: "₦2m", value: 2000000 },
  { label: "₦5m", value: 5000000 },
];

const ODDS = 2.0;
const GAMES_PER_DAY = 4;
const RUN_LEN = 7 * GAMES_PER_DAY; // 28
const SLOTS = ["M1", "M2", "E1", "E2"];
const KEY = "ridex_rollover_v1";
const AUTODELIVER_KEY = "ridex_milestone_autodeliver";
const EMAIL_KEY = "ridex_milestone_email";

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }
function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}
function computeCurrent(results, start) {
  return results.reduce((bal, r) => (r === "W" ? bal * ODDS : bal), start || 0);
}

export default function RolloverProgress() {
  const { toast } = useToast();
  const [state, setState] = React.useState(() => load());
  const [autoDeliver, setAutoDeliver] = React.useState(() => localStorage.getItem(AUTODELIVER_KEY) === "1");
  const [userEmail, setUserEmail] = React.useState(() => localStorage.getItem(EMAIL_KEY) || "");
  const [lastMilestone, setLastMilestone] = React.useState(null);

  const didPrefill = React.useRef(false);
  React.useEffect(() => {
    if (didPrefill.current) return;
    didPrefill.current = true;
    if (localStorage.getItem(EMAIL_KEY)) return;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.email && !localStorage.getItem(EMAIL_KEY)) { setUserEmail(me.email); localStorage.setItem(EMAIL_KEY, me.email); }
      } catch {}
    })();
  }, []);

  const start = Number(state.start) || 0;
  const acked = Array.isArray(state.acked) ? state.acked : [];
  const results = Array.isArray(state.results) ? state.results : [];
  const history = Array.isArray(state.history) ? state.history : [];
  const current = computeCurrent(results, start);
  const gameIndex = results.length; // 0..28
  const dayIndex = Math.floor(gameIndex / GAMES_PER_DAY); // 0..7
  const growthPct = start > 0 ? Math.round(((current - start) / start) * 100) : 0;

  const totalWins = history.reduce((s, h) => s + (h.wins || 0), 0) + results.filter((r) => r === "W").length;
  const totalLosses = history.filter((h) => h.endedBy === "L").length;
  const runsPlayed = history.length + (results.length > 0 ? 1 : 0);

  const nextTier = TIERS.find((t) => t.value > current) || TIERS[TIERS.length - 1];
  const prevTierVal = TIERS.filter((t) => t.value <= current).pop()?.value || 0;
  const tierProgress = nextTier.value > prevTierVal ? clamp(((current - prevTierVal) / (nextTier.value - prevTierVal)) * 100, 0, 100) : 100;

  const setStart = (v) => {
    const n = Math.max(0, Math.round(Number(v) || 0));
    if (n !== start) {
      logBetAudit({
        type: "bankroll_adjustment",
        sport: "rollover",
        match: "7-day rollover",
        market: "starting bankroll set",
        bankrollBefore: start,
        bankrollAfter: n,
        notes: n > 0 ? "rollover starting bankroll set — results reset" : "rollover bankroll cleared",
      });
    }
    setState((s) => ({ ...s, start: n, results: n !== start ? [] : s.results, acked: n !== start ? [] : s.acked }));
  };

  const fireMilestone = (top, newCurrent, newResults) => {
    const profit = newCurrent - start;
    const withdraw15 = Math.round(profit * 0.15);
    const wins = newResults.filter((x) => x === "W").length;
    toast({ title: `Milestone reached · ${top.label}`, description: `Bankroll ${fmt(newCurrent)} — withdraw 15% profit (₦${withdraw15.toLocaleString()})` });
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification("Ride X · Rollover milestone", { body: `🎉 ${top.label} hit! Bankroll ${fmt(newCurrent)}. Withdraw 15% = ₦${withdraw15.toLocaleString()}.` }); } catch {}
    }
    setLastMilestone({ tier: top.label, bankroll: newCurrent, profit, withdraw15, start, wins, day: newResults.length });
    if (autoDeliver && userEmail) {
      openEmail(userEmail, `Ride X milestone reached · ${top.label}`, milestoneEmailBody({ tierLabel: top.label, bankroll: newCurrent, start, profit, withdraw15, wins, day: newResults.length }));
    }
  };

  const markWin = () => {
    if (gameIndex >= RUN_LEN || !start) return;
    const newResults = [...results, "W"];
    const newCurrent = computeCurrent(newResults, start);
    logBetAudit({
      type: "bet_result",
      sport: "rollover",
      match: `Game ${gameIndex + 1}/${RUN_LEN} · day ${dayIndex + 1}`,
      market: "rollover leg @ 2.00",
      odds: 2,
      stake: current,
      result: "W",
      bankrollBefore: current,
      bankrollAfter: newCurrent,
      notes: `${newResults.filter((x) => x === "W").length} wins this run`,
    });
    const crossed = TIERS.filter((t) => t.value > start && newCurrent >= t.value && !acked.includes(t.value));
    if (crossed.length) fireMilestone(crossed[crossed.length - 1], newCurrent, newResults);
    if (newResults.length === RUN_LEN) {
      const run = { games: newResults, wins: RUN_LEN, final: newCurrent, endedBy: "complete", endedAt: new Date().toISOString() };
      setState((s) => ({ ...s, results: [], history: [run, ...(s.history || [])], acked: [] }));
      toast({ title: "7-day roll complete! 🏆", description: `${RUN_LEN} wins · bankroll ${fmt(newCurrent)}. New run auto-started from ${fmt(start)}.` });
    } else {
      setState((s) => ({ ...s, results: newResults, acked: [...(s.acked || []), ...crossed.map((t) => t.value)] }));
    }
  };

  const markLoss = () => {
    if (!start) return;
    const wins = results.filter((r) => r === "W").length;
    const final = computeCurrent(results, start); // peak before the loss
    const run = { games: [...results], wins, final, endedBy: "L", endedAt: new Date().toISOString() };
    logBetAudit({
      type: "bet_result",
      sport: "rollover",
      match: `Game ${gameIndex + 1}/${RUN_LEN} · day ${dayIndex + 1}`,
      market: "rollover leg @ 2.00",
      odds: 2,
      stake: current,
      result: "L",
      bankrollBefore: current,
      bankrollAfter: start,
      notes: `run ended after ${wins} wins — fresh 7-day roll auto-started`,
    });
    setState((s) => ({ ...s, results: [], history: [run, ...(s.history || [])], acked: [] }));
    setLastMilestone(null);
    toast({ title: "Game lost — new roll auto-started", description: `${wins} wins · peaked at ${fmt(final)}. Fresh 7-day roll from ${fmt(start)}. History kept.` });
  };

  const reset = () => { setLastMilestone(null); setState({ start: 0, results: [], history: [], acked: [] }); };

  React.useEffect(() => {
    save(state);
    window.dispatchEvent(new CustomEvent("ridex-rollover-change", { detail: state }));
  }, [state]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") { toast({ title: "Notifications not supported on this device" }); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") toast({ title: "Milestone alerts on", description: "You'll be notified when your bankroll hits the next capital tier." });
    else toast({ title: "Notifications blocked", description: "Enable them in your browser settings to get milestone alerts.", variant: "destructive" });
  };

  const toggleAutoDeliver = () => {
    const next = !autoDeliver;
    setAutoDeliver(next);
    localStorage.setItem(AUTODELIVER_KEY, next ? "1" : "0");
    if (next && !userEmail) toast({ title: "Add your email", description: "Enter the email to auto-send milestone summaries to." });
  };

  const deliverEmail = () => {
    if (!lastMilestone) return;
    if (!userEmail) { toast({ title: "Add your email first", variant: "destructive" }); return; }
    openEmail(userEmail, `Ride X milestone reached · ${lastMilestone.tier}`, milestoneEmailBody({ tierLabel: lastMilestone.tier, bankroll: lastMilestone.bankroll, start: lastMilestone.start, profit: lastMilestone.profit, withdraw15: lastMilestone.withdraw15, wins: lastMilestone.wins, day: lastMilestone.day }));
  };

  const addReminder = () => {
    if (!lastMilestone) return;
    window.open(withdrawalCalendarLink({ tierLabel: lastMilestone.tier, bankroll: lastMilestone.bankroll, profit: lastMilestone.profit, withdraw15: lastMilestone.withdraw15 }), "_blank", "noopener,noreferrer");
  };

  const saveEmail = (v) => { setUserEmail(v); localStorage.setItem(EMAIL_KEY, v); };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><TrendingUp className="w-4 h-4" /></div>
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">7-Day Rollover · 4 games/day</p>
          <p className="text-[10px] text-muted-foreground">2 morning + 2 evening · 50/50, try your luck</p>
        </div>
      </div>

      {!start ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">Starting bankroll (₦) — any amount from ₦10</label>
            <Input type="number" inputMode="numeric" placeholder="e.g. 10, 100, 1000" onChange={(e) => setStart(e.target.value)} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Current bankroll</span>
            <button onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> reset all</button>
          </div>
          <p className="text-2xl font-heading font-extrabold text-primary leading-none">{fmt(current)}</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            {growthPct >= 0 ? `+${growthPct}%` : `${growthPct}%`} from {fmt(start)} · day {Math.min(dayIndex + 1, 7)}/7 · game {Math.min(gameIndex + 1, RUN_LEN)}/{RUN_LEN}
            {gameIndex < RUN_LEN && start > 0 ? ` · next stake ${fmt(current)} @ ${ODDS.toFixed(2)}` : ""}
          </p>

          {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
            <button onClick={enableNotifications} className="text-[10px] mb-2 inline-flex items-center gap-1 text-primary/80 hover:text-primary">
              <Bell className="w-3 h-3" /> Enable milestone alerts
            </button>
          )}

          {/* 7-day × 4-game grid */}
          <div className="space-y-1.5 mb-3">
            {Array.from({ length: 7 }).map((_, d) => {
              const dayGames = Array.from({ length: GAMES_PER_DAY }).map((_, s) => results[d * GAMES_PER_DAY + s]);
              return (
                <div key={d} className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground w-5 shrink-0">D{d + 1}</span>
                  {dayGames.map((g, s) => {
                    const gi = d * GAMES_PER_DAY + s;
                    const isNext = gi === gameIndex;
                    return (
                      <div key={s} className={`flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold border ${
                        g === "W" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                        isNext ? "bg-primary/15 text-primary border-primary/50 animate-pulse" :
                        "bg-secondary text-muted-foreground border-border/40"
                      }`}>{g === "W" ? "W" : isNext ? SLOTS[s] : "–"}</div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {gameIndex < RUN_LEN ? (
            <div className="flex gap-2 mb-3">
              <Button size="sm" className="rounded-full flex-1 bg-emerald-600 hover:bg-emerald-600/90 text-white" onClick={markWin}>
                <Target className="w-3.5 h-3.5 mr-1" /> Game {gameIndex + 1} WON
              </Button>
              <Button size="sm" variant="outline" className="rounded-full flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={markLoss}>
                Lost
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Run complete — new roll auto-started</p>
            </div>
          )}

          {/* Tier milestone bar */}
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Next milestone</span>
            <span className="font-semibold text-primary">{nextTier.label}</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/50 overflow-hidden border border-border/40 mb-1">
            <div className="h-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500" style={{ width: `${tierProgress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground/80">{fmt(current)} of {fmt(nextTier.value)} · {Math.round(tierProgress)}% to next tier</p>

          {/* Run history — previous wins/losses are always kept */}
          {history.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5"><History className="w-3 h-3" /> Run history ({runsPlayed} run{runsPlayed !== 1 ? "s" : ""} · {totalWins}W / {totalLosses}L)</p>
              <div className="space-y-1 max-h-28 overflow-y-auto noir-scrollbar">
                {history.slice(0, 8).map((h, i) => (
                  <div key={i} className="text-[10px] flex items-center gap-2">
                    <span className="text-muted-foreground">Run {history.length - i}</span>
                    <span className="font-semibold">{h.wins}W</span>
                    <span className="text-muted-foreground">→ {fmt(h.final || 0)}</span>
                    <span className={h.endedBy === "L" ? "text-red-400" : "text-emerald-400"}>{h.endedBy === "L" ? "lost" : "complete"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* In-browser milestone delivery — no credits, no backend */}
          <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3" /> Milestone delivery</span>
              <button onClick={toggleAutoDeliver} className={`text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${autoDeliver ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "bg-secondary text-muted-foreground"}`}>
                {autoDeliver ? "Auto on" : "Auto off"}
              </button>
            </div>
            <Input type="email" placeholder="your@email.com (for milestone alerts)" value={userEmail} onChange={(e) => saveEmail(e.target.value)} className="h-8 text-xs" />
            {userEmail && (
              <p className="text-[9px] text-muted-foreground/70 truncate">{autoDeliver ? `Auto-emails ${userEmail} on every milestone tap` : `Tap Email to send to ${userEmail}`}</p>
            )}
            {lastMilestone && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full flex-1 text-[11px] h-8" onClick={deliverEmail}><Mail className="w-3 h-3 mr-1" /> Email me</Button>
                <Button size="sm" variant="outline" className="rounded-full flex-1 text-[11px] h-8" onClick={addReminder}><CalendarPlus className="w-3 h-3 mr-1" /> Add to calendar</Button>
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-[9px] text-muted-foreground/60 mt-3">For fun only — not betting advice. A lost game ends the run and auto-starts a fresh 7-day roll; your full win/loss history is always kept. Email & calendar delivery run in-browser — no server needed.</p>
    </div>
  );
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }