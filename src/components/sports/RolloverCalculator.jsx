import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Calculator } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Rollover calculator — the user's rollover plan, projected from the engine's
// OWN settled record (EnginePick): the real hit rate and the average odds of
// the engine's qualifying picks drive every number.
//
// Plan: the bankroll rolls through the 4 MORNING picks, the winnings roll
// through the 4 EVENING picks, the winnings roll into the next day, and so on.
// From day 3 onward 15% of the bankroll is withdrawn at the end of each day
// (morning + evening sessions done) and the remaining 85% keeps rolling.
//
// Model statistics, never guarantees — a full-bankroll rollover busts on the
// first losing roll.

const PICKS_PER_SESSION = 4; // 4 morning games, 4 evening games
const DAYS = 7;

function fmtNaira(n) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}m`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function RolloverCalculator() {
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [start, setStart] = React.useState("1000");
  const [wdPct, setWdPct] = React.useState("15");
  const [wdFromDay, setWdFromDay] = React.useState("3");

  // Settled engine record: hit rate + the real odds its picks carried.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await base44.entities.EnginePick.filter(
          { status: { $in: ["win", "loss"] } }, "-kickoff", 400
        );
        const decided = rows || [];
        const wins = decided.filter((r) => r.status === "win").length;
        const oddsList = decided.map((r) => Number(r.market_odds || r.fair_odds)).filter((o) => Number.isFinite(o) && o > 1);
        if (alive) {
          setStats({
            samples: decided.length,
            hitRate: decided.length ? wins / decided.length : null,
            avgOdds: oddsList.length ? oddsList.reduce((a, b) => a + b, 0) / oddsList.length : null,
          });
        }
      } catch {
        if (alive) setStats({ samples: 0, hitRate: null, avgOdds: null });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const startAmt = Math.max(0, Number(start) || 0);
  const pct = Math.min(90, Math.max(0, Number(wdPct) || 0));
  const fromDay = Math.min(DAYS, Math.max(1, Math.round(Number(wdFromDay) || 1)));

  // Defaults when the engine has no settled record yet: the engine's design
  // envelope (72%+ probability picks ⇒ fair odds ≈ 1.09–1.39).
  const p = stats?.hitRate != null ? stats.hitRate : 0.72;
  const odds = Math.max(1.01, stats?.avgOdds != null ? stats.avgOdds : 1.2);
  const sessionFactor = Math.pow(odds, PICKS_PER_SESSION); // one morning or evening session
  const dayFactor = sessionFactor * sessionFactor; // a full day of rolling

  // Day-by-day rollover: morning 4 picks → evening 4 picks → withdrawal (day 3+).
  const rows = [];
  let bank = startAmt;
  let totalOut = 0;
  for (let d = 1; d <= DAYS; d++) {
    const morning = bank * sessionFactor;
    const evening = morning * sessionFactor;
    bank = evening;
    let withdrawn = 0;
    if (d >= fromDay && pct > 0) {
      withdrawn = bank * (pct / 100);
      totalOut += withdrawn;
      bank -= withdrawn;
    }
    rows.push({
      day: `D${d}`,
      morning,
      evening,
      bankroll: bank,
      withdrawn,
      totalOut,
      // survive every roll so far: 8 picks per day
      chance: Math.pow(p, PICKS_PER_SESSION * 2 * d),
    });
  }

  const last = rows[rows.length - 1];
  const chartMax = Math.max(last.bankroll, last.totalOut, startAmt) * 1.05;
  const allWinChance = last.chance;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-primary shrink-0" />
        <p className="font-bold text-sm">ROLLOVER CALCULATOR</p>
        {stats?.samples > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            From {stats.samples} settled picks · hit rate {Math.round(p * 100)}% · avg odds {odds.toFixed(2)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading engine record…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Start (₦)</Label>
              <Input type="number" min="0" className="h-8 rounded-lg text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {[100, 500, 1000, 5000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStart(String(v))}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${Number(start) === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    ₦{v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Cash out %</Label>
              <Input type="number" min="0" max="90" className="h-8 rounded-lg text-xs" value={wdPct} onChange={(e) => setWdPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">From day</Label>
              <Input type="number" min="1" max={DAYS} className="h-8 rounded-lg text-xs" value={wdFromDay} onChange={(e) => setWdFromDay(e.target.value)} />
            </div>
          </div>

          {startAmt > 0 && (
            <>
              <div className="rounded-xl bg-secondary/50 px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
                Roll the full bankroll through the <span className="text-foreground font-semibold">4 morning picks</span>, roll the winnings through the
                {" "}<span className="text-foreground font-semibold">4 evening picks</span>, roll those winnings into the next day.
                From <span className="text-foreground font-semibold">day {fromDay}</span> cash out
                {" "}<span className="text-primary font-semibold">{pct}%</span> at the end of each day and keep rolling the remaining{" "}
                <span className="text-foreground font-semibold">{100 - pct}%</span>. At avg odds <span className="text-foreground font-semibold">{odds.toFixed(2)}</span>:
                {" "}<span className="text-primary font-semibold">{fmtNaira(startAmt)}</span> → bankroll
                {" "}<span className="text-primary font-semibold">{fmtNaira(last.bankroll)}</span> +
                {" "}<span className="text-emerald-400 font-semibold">{fmtNaira(last.totalOut)} cashed out</span> after day {DAYS}.
                {" "}Chance all {PICKS_PER_SESSION * 2 * DAYS} rolls win in a row at the {Math.round(p * 100)}% hit rate:{" "}
                <span className={allWinChance >= 0.02 ? "text-amber-400 font-semibold" : "text-red-400 font-semibold"}>
                  {allWinChance >= 0.01 ? `${(allWinChance * 100).toFixed(1)}%` : `${(allWinChance * 100).toFixed(3)}%`}
                </span>
              </div>

              <div style={{ width: "100%", height: 190 }}>
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={52} tickFormatter={fmtNaira} domain={[0, Math.round(chartMax)]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v, name, item) => {
                        const r = item?.payload || {};
                        return [
                          `${fmtNaira(v || 0)}${name === "Bankroll" ? ` · ${Math.round((r.chance || 0) * 1000) / 10}% still standing` : ""}`,
                          name === "Bankroll" ? "Bankroll in play" : "Total cashed out",
                        ];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="bankroll" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))" }} name="Bankroll" />
                    <Line type="monotone" dataKey="totalOut" stroke="hsl(168 70% 45%)" strokeWidth={2} dot={{ r: 2.5, fill: "hsl(168 70% 45%)" }} name="Cashed out" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="max-h-48 overflow-y-auto no-scrollbar rounded-xl border border-border/50 divide-y divide-border/40">
                <div className="grid grid-cols-5 gap-1 px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  <span>Day</span><span className="text-right">Morning</span><span className="text-right">Evening</span><span className="text-right">Cash out</span><span className="text-right">Standing</span>
                </div>
                {rows.map((r, i) => (
                  <div key={r.day} className={`grid grid-cols-5 gap-1 px-2.5 py-1.5 text-[10px] ${i === fromDay - 1 ? "bg-primary/5" : ""}`}>
                    <span className="text-muted-foreground font-semibold">{r.day}</span>
                    <span className="text-right text-foreground/80">{fmtNaira(r.morning)}</span>
                    <span className="text-right font-semibold text-foreground">{fmtNaira(r.evening)}</span>
                    <span className={`text-right ${r.withdrawn > 0 ? "text-emerald-400 font-semibold" : "text-muted-foreground/50"}`}>
                      {r.withdrawn > 0 ? fmtNaira(r.withdrawn) : "—"}
                    </span>
                    <span className="text-right text-muted-foreground/80">
                      {r.chance >= 0.01 ? `${(r.chance * 100).toFixed(1)}%` : `${(r.chance * 100).toFixed(2)}%`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Projection from the engine's real settled record — model statistics, not guarantees. A full-bankroll rollover
            busts on the first losing roll; the standing percentages are the honest odds of surviving every roll so far.
            Cash-outs are calculated at the end of each day (after the evening session) from day {fromDay} onward.
          </p>
        </>
      )}
    </div>
  );
}