import React from "react";
import { Loader2, RefreshCw, Activity, Target, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { settleMonsterPicks } from "@/lib/monsterLedger";
import { getBankuHistory } from "@/lib/bankuLedger";

// MONSTER 6-DAY ROLLOVER · SUCCESS TRACKER — built ONLY from the settlement
// ledger: every leg the engine deals is recorded and graded here against the
// REAL final score from the same verified feeds (never self-reported). The
// dashboard keeps PREDICTION ACCURACY (settled legs' win rate) strictly
// separate from BANKROLL PERFORMANCE (the deterministic rollover chain), and
// widening the fixture pool never claims better accuracy — only settled
// results move these numbers.

const STAKE_KEY = "monster6_start_stake";

function fmt(n) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(1)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

// One day's ledger rows → the day's grade. A day ROLLED only when every
// settled leg won (voids count toward nothing); a single loss kills the
// day's stake exactly like the strategy plays. Open legs = still in play.
function dayGrade(rows) {
  const wins = rows.filter((r) => r.status === "win").length;
  const losses = rows.filter((r) => r.status === "loss").length;
  const open = rows.filter((r) => r.status === "open").length;
  const voids = rows.filter((r) => r.status === "void").length;
  const odds = rows
    .filter((r) => r.status !== "void" && Number(r.probability) > 0)
    .reduce((o, r) => o * (1 / Number(r.probability)), 1);
  const state = open > 0 ? "open" : losses > 0 ? "lost" : wins > 0 ? "won" : "none";
  return { date: rows[0].date_key, legs: rows.length, wins, losses, open, voids, odds, state };
}

export default function MonsterRolloverDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [stake, setStake] = React.useState(() => {
    const v = Number(localStorage.getItem(STAKE_KEY));
    return v > 0 ? v : 1000;
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Settle first — every past-day leg grades against its real final score
      await settleMonsterPicks().catch((err) => {
        console.error("[TRACKER] settlement failed:", err?.message || err);
      });
      setRows(await getBankuHistory(30, "monster").catch((err) => {
        console.error("[TRACKER] ledger read failed:", err?.message || err);
        return [];
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // A fresh scan above just recorded new legs → re-read the ledger so the
  // tracker picks them up without a manual refresh or page reload.
  React.useEffect(() => {
    const onDealt = () => load();
    window.addEventListener("ridex-monster-dealt", onDealt);
    return () => window.removeEventListener("ridex-monster-dealt", onDealt);
  }, [load]);

  const saveStake = (v) => {
    const n = Math.max(0, Number(v) || 0);
    setStake(n);
    localStorage.setItem(STAKE_KEY, String(n));
  };

  const byDay = {};
  rows.forEach((r) => { if (r.date_key) (byDay[r.date_key] ||= []).push(r); });
  const days = Object.keys(byDay).sort().map((d) => dayGrade(byDay[d]));

  // ---- PREDICTION ACCURACY — settled legs only, graded from real finals ----
  const wins = rows.filter((r) => r.status === "win").length;
  const losses = rows.filter((r) => r.status === "loss").length;
  const voids = rows.filter((r) => r.status === "void").length;
  const open = rows.filter((r) => r.status === "open").length;
  const settled = wins + losses;
  const winRate = settled ? wins / settled : null;

  // ---- DETERMINISTIC BANKROLL LEDGER — one transaction per settled day:
  // new bankroll = previous bankroll + actual profit/loss. A won day rolls
  // its full return into the next day's stake (the strategy's own
  // compounding); a lost day restarts from the base stake. Open days are
  // never projected forward. Every transaction is listed below so the total
  // reconciles by hand.
  let chainStake = stake;
  let bank = stake;
  let peak = stake;
  let maxDrawdown = 0;
  let totalStaked = 0;
  const txns = [];
  for (const d of days) {
    if (d.state !== "won" && d.state !== "lost") continue;
    const s = chainStake;
    const profit = d.state === "won" ? s * (d.odds - 1) : -s;
    totalStaked += s;
    bank += profit;
    peak = Math.max(peak, bank);
    maxDrawdown = Math.max(maxDrawdown, peak - bank);
    txns.push({ date: d.date, stake: s, odds: d.odds, result: d.state, profit, bank });
    chainStake = d.state === "won" ? bank : stake;
  }
  const profitLoss = bank - stake;
  const roi = totalStaked > 0 ? profitLoss / totalStaked : null;
  const chartData = [{ day: "start", bankroll: Math.round(stake) }, ...txns.map((t) => ({ day: t.date.slice(5), bankroll: Math.round(t.bank) }))];

  const daysWon = days.filter((d) => d.state === "won").length;
  const daysLost = days.filter((d) => d.state === "lost").length;
  const openDays = days.filter((d) => d.state === "open").length;

  const card = "rounded-xl bg-black/30 border border-border/40 px-3 py-2";

  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><Activity className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">MONSTER 6-DAY ROLLOVER · SUCCESS TRACKER</p>
          <p className="text-[10px] text-muted-foreground">Built only from the settlement ledger — every leg graded against the real final score from the verified feeds, never self-reported</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[10px] font-bold text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {loading ? "GRADING…" : "REFRESH"}
        </button>
      </div>

      {loading && !rows.length ? (
        <div className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Grading settled rollover legs against the real results…</p>
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-5 text-center">
          <p className="text-xs font-bold text-amber-400">NO ROLLOVER LEGS RECORDED YET</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            The tracker charts automatically — every leg the 6-day engine deals above is recorded and graded the moment its real final score lands.
          </p>
        </div>
      ) : (
        <>
          {/* ---- PREDICTION ACCURACY ---- */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground flex items-center gap-1 mb-1.5"><Target className="w-3 h-3" /> PREDICTION ACCURACY — settled legs only</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Total predictions</p>
                <p className="font-heading font-extrabold text-lg">{rows.length}</p>
                <p className="text-[9px] text-muted-foreground">{open} open</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Settled</p>
                <p className="font-heading font-extrabold text-lg">{settled}</p>
                <p className="text-[9px] text-muted-foreground">{voids} voided</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Wins / losses</p>
                <p className="font-heading font-extrabold text-lg"><span className="text-emerald-400">{wins}</span> / <span className="text-red-400">{losses}</span></p>
                <p className="text-[9px] text-muted-foreground">{daysWon} days rolled · {daysLost} restarted · {openDays} in play</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Leg win rate</p>
                <p className="font-heading font-extrabold text-lg text-primary">{winRate == null ? "—" : `${Math.round(winRate * 100)}%`}</p>
                <p className="text-[9px] text-muted-foreground">of decided legs only</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Base stake (₦)</p>
                <Input type="number" min="0" className="h-7 rounded-lg text-xs mt-0.5" value={stake} onChange={(e) => saveStake(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ---- BANKROLL PERFORMANCE ---- */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground flex items-center gap-1 mb-1.5"><Wallet className="w-3 h-3" /> BANKROLL PERFORMANCE — deterministic chain (new bankroll = previous + actual profit/loss)</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Starting bankroll</p>
                <p className="font-heading font-extrabold text-lg">{fmt(stake)}</p>
                <p className="text-[9px] text-muted-foreground">the base stake</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Current bankroll</p>
                <p className={`font-heading font-extrabold text-lg ${profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(bank)}</p>
                <p className="text-[9px] text-muted-foreground">{txns.length} settled day(s)</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Profit / loss</p>
                <p className={`font-heading font-extrabold text-lg ${profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>{profitLoss >= 0 ? "+" : ""}{fmt(profitLoss)}</p>
                <p className="text-[9px] text-muted-foreground">staked {fmt(totalStaked)} across settled days</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">ROI</p>
                <p className={`font-heading font-extrabold text-lg ${roi == null ? "" : roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>{roi == null ? "—" : `${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(1)}%`}</p>
                <p className="text-[9px] text-muted-foreground">P/L ÷ total staked</p>
              </div>
              <div className={card}>
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Max drawdown</p>
                <p className="font-heading font-extrabold text-lg text-amber-400">{txns.length ? fmt(maxDrawdown) : "—"}</p>
                <p className="text-[9px] text-muted-foreground">peak-to-trough of the chain</p>
              </div>
            </div>
          </div>

          {txns.length > 1 ? (
            <div className="rounded-xl bg-black/30 border border-border/40 p-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground px-1 mb-1">Bankroll over time — each point is the ledger total after that settled day</p>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#8b8b96", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#8b8b96", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#16161d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 11 }}
                    labelStyle={{ color: "#f7c948" }}
                    formatter={(v) => [fmt(v), "Bankroll"]}
                  />
                  <Line type="monotone" dataKey="bankroll" stroke="#f7c948" strokeWidth={2.5} dot={{ r: 3, fill: "#f7c948" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground text-center">The bankroll chart appears once two settled rollover days are on the ledger.</p>
          )}

          {/* ---- LEDGER TRANSACTIONS — the bankroll total reconciles by hand ---- */}
          {txns.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">LEDGER TRANSACTIONS — verify the total: start {fmt(stake)} + Σ profit = {fmt(bank)}</p>
              <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-36 overflow-y-auto noir-scrollbar">
                {txns.slice().reverse().map((t) => (
                  <div key={t.date} className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground w-16 shrink-0">{t.date}</span>
                    <span className="font-semibold shrink-0">stake {fmt(t.stake)}</span>
                    <span className="text-muted-foreground shrink-0">@ {t.odds.toFixed(2)}×</span>
                    <span className={`font-bold shrink-0 ${t.result === "won" ? "text-emerald-400" : "text-red-400"}`}>{t.result === "won" ? "ROLLED" : "RESTART"}</span>
                    <span className={`ml-auto font-bold shrink-0 ${t.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.profit >= 0 ? "+" : ""}{fmt(t.profit)}</span>
                    <span className="text-muted-foreground shrink-0 w-20 text-right">bank {fmt(t.bank)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- DAY GRADES ---- */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">DAY-BY-DAY GRADES</p>
            <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-44 overflow-y-auto noir-scrollbar">
              {days.slice().reverse().map((d) => (
                <div key={d.date} className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground w-16 shrink-0">{d.date}</span>
                  <span className="font-semibold">{d.legs} legs</span>
                  <span className="text-emerald-400 font-semibold">{d.wins}W</span>
                  {d.losses > 0 && <span className="text-red-400 font-semibold">{d.losses}L</span>}
                  {d.voids > 0 && <span className="text-muted-foreground">{d.voids} void</span>}
                  {d.open > 0 && <span className="text-amber-400 font-semibold">{d.open} open</span>}
                  <span className="ml-auto font-bold text-primary shrink-0">{d.odds.toFixed(2)}×</span>
                  <span className={`shrink-0 font-bold px-1.5 py-0.5 rounded-full ${
                    d.state === "won" ? "bg-emerald-500/15 text-emerald-400"
                    : d.state === "open" ? "bg-amber-500/15 text-amber-400"
                    : d.state === "lost" ? "bg-red-500/15 text-red-400"
                    : "bg-secondary text-muted-foreground"
                  }`}>{d.state === "open" ? "IN PLAY" : d.state === "won" ? "ROLLED" : d.state === "lost" ? "RESTART" : "—"}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
            Prediction accuracy (settled win rate) and bankroll performance are reported separately — a wider fixture pool adds games, it does not make the model more accurate. Grades come from the same verified ESPN feeds the engine scans; a leg with no result within 7 days voids toward nothing, and a leg is never marked won from the prediction itself. The bankroll chain is a deterministic simulation of the rollover strategy (won day rolls its full return, lost day restarts from the base stake) — a model view, not a wallet. Model probabilities, never guarantees.
          </p>
        </>
      )}
    </div>
  );
}