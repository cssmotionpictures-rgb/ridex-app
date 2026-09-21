import React from "react";
import {
  Calendar,
  ShieldAlert,
  Percent,
  Activity,
  Crosshair,
  Plus,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Swords,
} from "lucide-react";

const FORM_COLOR = { W: "bg-emerald-600", D: "bg-amber-600", L: "bg-red-600" };

const STAT_LABELS = ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Fouls", "Yellow Cards", "Red Cards"];

function StatsTable({ stats }) {
  return (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal py-1">Stat</th>
            {stats.map((s) => (
              <th key={s.team} className="text-right font-normal py-1 px-2 truncate max-w-[90px]">{s.team}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAT_LABELS.map((label) => (
            <tr key={label} className="border-t border-border/40">
              <td className="py-1 text-muted-foreground">{label === "Corner Kicks" ? "Corners" : label}</td>
              {stats.map((s) => (
                <td key={s.team} className="py-1 px-2 text-right font-semibold">
                  {s.map[label] != null ? s.map[label] : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormPills({ str }) {
  if (!str) return <p className="text-[11px] text-muted-foreground/70">No completed matches yet</p>;
  return (
    <div className="flex gap-1 flex-wrap justify-center">
      {str.slice(0, 5).split("").map((r, i) => (
        <span key={i} className={`w-6 h-6 rounded text-white text-[11px] font-bold flex items-center justify-center ${FORM_COLOR[r] || "bg-muted"}`}>
          {r}
        </span>
      ))}
    </div>
  );
}

function TeamCard({ team, form, side }) {
  const logo = side === "home" ? null : null; // logos come from the analysis
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col items-center text-center gap-2">
      {team?.logo ? (
        <img src={team.logo} alt="" className="w-14 h-14 object-contain" loading="lazy" onError={(e) => (e.target.style.display = "none")} />
      ) : (
        <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-primary font-extrabold text-xl">
          {team?.name?.[0] || "?"}
        </div>
      )}
      <div>
        <p className="font-bold leading-tight">{team?.name}</p>
        <p className="text-[11px] text-muted-foreground">{team?.country}</p>
      </div>
      <FormPills str={form.string} />
      {form.matches > 0 && (
        <div className="w-full grid grid-cols-3 gap-1 text-[10px] text-muted-foreground pt-1">
          <div><span className="block text-foreground font-bold text-sm">{form.gfPg.toFixed(1)}</span>GF/game</div>
          <div><span className="block text-foreground font-bold text-sm">{form.gaPg.toFixed(1)}</span>GA/game</div>
          <div><span className="block text-foreground font-bold text-sm">{form.wins}-{form.draws}-{form.losses}</span>W-D-L</div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PickCard({ pick }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-primary">{pick.label}</p>
        <span className="font-heading font-extrabold text-lg">{pick.odds.toFixed(2)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {pick.bookmaker} · model {Math.round((pick.probability != null ? pick.probability : pick.modelProb) * 100)}% · edge{" "}
        {pick.edge >= 0 ? "+" : ""}
        {(pick.edge * 100).toFixed(1)}% vs implied {Math.round((pick.implied != null ? pick.implied : 1 / pick.odds) * 100)}%
      </p>
    </div>
  );
}

export default function AnalysisPanel({ analysis, onAdd }) {
  const { teamA, teamB, fixture, formA, formB, h2h, injuries, apiPrediction, lastMeet, xg, corners, candidates, picks, noFixture, noOdds, dataQuality, isLive, live, dataUnavailable } = analysis;
  const [added, setAdded] = React.useState(false);

  const kickoff = fixture?.fixture?.date ? new Date(fixture.fixture.date) : null;
  const qualifiedCount = candidates.filter((c) => c.qualified).length;

  const handleAdd = () => {
    onAdd(analysis);
    setAdded(true);
  };

  return (
    <div className="space-y-4">
      {dataUnavailable && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400 leading-relaxed">
            Some live data couldn't be fetched right now — the free API-Football quota is used up or the service is rate-limiting. Only
            sections with real data are shown below; nothing is invented.
          </p>
        </div>
      )}

      {/* Upcoming fixture / live match */}
      {fixture ? (
        <Section icon={Calendar} title={isLive ? "Live Now" : "Upcoming Fixture"}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <img src={fixture.teams?.home?.logo || ""} alt="" className="w-8 h-8 object-contain" onError={(e) => (e.target.style.display = "none")} />
              <span className="font-bold text-sm truncate">{fixture.teams?.home?.name}</span>
            </div>
            <div className="text-center shrink-0">
              <p className="text-[10px] text-muted-foreground">{fixture.league?.name}</p>
              {isLive && live ? (
                <>
                  <p className="font-heading font-extrabold text-lg text-red-400 leading-tight">
                    {live.hg} : {live.ag}
                  </p>
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    LIVE{live.elapsed ? ` · ${live.elapsed}'` : ""}
                  </p>
                </>
              ) : (
                <p className="text-primary font-bold text-xs">
                  {kickoff && !isNaN(kickoff) ? kickoff.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "TBD"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
              <img src={fixture.teams?.away?.logo || ""} alt="" className="w-8 h-8 object-contain" onError={(e) => (e.target.style.display = "none")} />
              <span className="font-bold text-sm truncate">{fixture.teams?.away?.name}</span>
            </div>
          </div>
        </Section>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400 leading-relaxed">
            No scheduled meeting between these teams right now. Form and head-to-head history are shown below — the
            engine only publishes value picks for a real upcoming fixture.
          </p>
        </div>
      )}

      {/* Team form cards */}
      <div className="grid grid-cols-2 gap-3">
        <TeamCard team={fixture ? { ...teamA, logo: fixture.teams?.home?.logo || teamA.logo } : teamA} form={formA} />
        <TeamCard team={fixture ? { ...teamB, logo: fixture.teams?.away?.logo || teamB.logo } : teamB} form={formB} />
      </div>

      {/* H2H record */}
      <Section icon={Swords} title={`Head-to-Head — last ${h2h.matches || 0} meetings`}>
        {h2h.matches > 0 ? (
          <>
            <div className="grid grid-cols-3 text-center text-sm font-bold mb-3">
              <div className="text-emerald-400">{h2h.winsA}<div className="text-[10px] font-normal text-muted-foreground">{teamA.name}</div></div>
              <div className="text-amber-400">{h2h.draws}<div className="text-[10px] font-normal text-muted-foreground">Draws</div></div>
              <div className="text-red-400">{h2h.winsB}<div className="text-[10px] font-normal text-muted-foreground">{teamB.name}</div></div>
            </div>
            <div className="space-y-1.5">
              {h2h.list.filter((m) => m.played).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-[11px] border-t border-border/40 pt-1.5">
                  <span className="truncate text-muted-foreground">{m.home} {m.hg} - {m.ag} {m.away}</span>
                  <span className="text-muted-foreground/70 shrink-0">{m.date}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              Avg total goals {h2h.avgTotal.toFixed(1)} · over 1.5 in {Math.round(h2h.over15 * 100)}% · over 2.5 in {Math.round(h2h.over25 * 100)}%
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No completed meetings on record — form above is the honest signal.</p>
        )}
      </Section>

      {/* Injuries */}
      <Section icon={ShieldAlert} title={`Injuries & Sidelined (${injuries.length})`}>
        {injuries.length ? (
          <div className="space-y-1">
            {injuries.map((i, idx) => (
              <p key={idx} className="text-[11px] border-t border-border/40 pt-1">
                <span className="font-semibold">{i.player}</span>
                <span className="text-muted-foreground"> — {i.reason} · {i.team}</span>
              </p>
            ))}
            <p className="text-[10px] text-muted-foreground/70 pt-1">
              Confidence is penalized {(analysis.injuryPenalty * 100).toFixed(0)}% for availability — deliberately conservative.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sidelined players reported for this fixture.</p>
        )}
      </Section>

      {/* Model xG + corners + API prediction */}
      <Section icon={Activity} title="Model Expectancy">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Expected goals (Poisson)</p>
            <p className="font-heading font-extrabold text-lg">{xg.home.toFixed(2)} — {xg.away.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Match corners (verified feed)</p>
            <p className="font-heading font-extrabold text-lg">{corners ? corners.expected : "—"}</p>
            <p className="text-[9px] text-muted-foreground">{corners ? `${corners.label} · real match corner stats` : "no verified corner data yet"}</p>
          </div>
        </div>
        {apiPrediction && apiPrediction.home != null && (
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Percent className="w-3 h-3" /> API-Football prediction</p>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary">
              <div className="bg-emerald-500" style={{ width: `${apiPrediction.home * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${apiPrediction.draw * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${apiPrediction.away * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {Math.round(apiPrediction.home * 100)}% / {Math.round(apiPrediction.draw * 100)}% / {Math.round(apiPrediction.away * 100)}%
              {apiPrediction.advice ? ` · ${apiPrediction.advice}` : ""}
            </p>
          </div>
        )}
      </Section>

      {/* Live match stats — in play right now */}
      {isLive && live && live.stats.length > 0 && (
        <Section icon={BarChart3} title="Live Match Stats — real match stats">
          <StatsTable stats={live.stats} />
        </Section>
      )}

      {/* Real stats from the last meeting */}
      {lastMeet && lastMeet.stats.length > 0 && (
        <Section icon={BarChart3} title={`Last Meeting — real match stats (${lastMeet.date})`}>
          <p className="text-[11px] text-muted-foreground mb-2">{lastMeet.home} {lastMeet.hg} - {lastMeet.ag} {lastMeet.away}</p>
          <StatsTable stats={lastMeet.stats} />
        </Section>
      )}

      {/* Value table — every candidate evaluated */}
      <Section icon={Crosshair} title="Value Scan — model vs bookmaker">
        {candidates.length === 0 ? (
          <p className="text-xs text-amber-400">
            {isLive
              ? "Match is in play — the pre-match value scan is closed because the captured prices no longer apply."
              : noOdds
              ? "No bookmaker odds are published for this fixture yet. The engine never invents a price — no pick is qualified without a real one."
              : "No bookmaker markets in the supported range are currently offered for this fixture."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal py-1">Market</th>
                    <th className="text-right font-normal py-1">Odds</th>
                    <th className="text-right font-normal py-1">Model</th>
                    <th className="text-right font-normal py-1">Implied</th>
                    <th className="text-right font-normal py-1">Edge</th>
                    <th className="text-right font-normal py-1">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.key + c.bookmaker} className="border-t border-border/40">
                      <td className="py-1.5 pr-2">
                        <span className="font-semibold block">{c.label}</span>
                        <span className="text-muted-foreground/70 text-[10px]">{c.bookmaker}</span>
                      </td>
                      <td className="py-1.5 text-right font-semibold">{c.odds.toFixed(2)}</td>
                      <td className="py-1.5 text-right">{c.modelProb != null ? `${Math.round(c.modelProb * 100)}%` : "—"}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{Math.round(c.implied * 100)}%</td>
                      <td className={`py-1.5 text-right ${c.edge != null && c.edge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {c.edge != null ? `${c.edge >= 0 ? "+" : ""}${(c.edge * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        {c.qualified ? (
                          <span className="text-emerald-400 font-semibold">QUALIFIES</span>
                        ) : (
                          <span className="text-muted-foreground" title={c.reason}>{c.reason ? "REJECTED" : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              {qualifiedCount} of {candidates.length} real prices carry a model edge ≥ 1.5% at ≥ 72% estimated probability. Data quality score:{" "}
              {Math.round(dataQuality * 100)}/100.
            </p>
          </>
        )}
      </Section>

      {/* The two best compatible picks */}
      {picks ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Two Best Compatible Picks</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PickCard pick={picks.pick1} />
            {picks.pick2 ? <PickCard pick={picks.pick2} /> : (
              <div className="rounded-xl border border-border/60 bg-card p-3 text-[11px] text-muted-foreground">
                Only one market qualified for this match — the engine does not force a second pick.
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              Pair odds {picks.pairOdds.toFixed(2)} · joint probability estimate {(picks.jointProbability * 100).toFixed(1)}%
              {picks.pick2 ? " (with correlation haircut)" : ""}
            </p>
            <button
              onClick={handleAdd}
              disabled={added}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60"
            >
              {added ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {added ? "Added to accumulator" : "Add to 50-match accumulator"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400 leading-relaxed">
            {isLive
              ? "Match is in play — value picks lock at kickoff, so no selection is offered once the game has started."
              : noFixture
              ? "No upcoming fixture — nothing to qualify."
              : "No qualifying pick for this match. The engine never manufactures a selection — weak or poorly supported candidates are rejected."}
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
        Model probabilities are estimates, never guarantees. Odds are real bookmaker prices captured from API-Football and snapshotted
        locally when added to the accumulator. Data is server-cached to protect the free API quota.
      </p>
    </div>
  );
}