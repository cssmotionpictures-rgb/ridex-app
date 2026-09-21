import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Sparkles, CalendarPlus, CalendarCheck, Copy, Check, Search, Sunrise, Moon, RefreshCw } from "lucide-react";
import { SPORTS } from "@/lib/pickEngine";
import { buildVerifiedSportPlan } from "@/lib/verifiedRolloverPlan";
import { downloadFixturesICS } from "@/lib/calendarSync";
import { syncFixturesToGoogle, stats as calStats } from "@/lib/calendarStore";
import { useToast } from "@/components/ui/use-toast";
import RolloverProgress from "@/components/sports/RolloverProgress";
import { cycleInfo } from "@/lib/dealtPickMemory";

const AUTOSYNC_KEY = "ridex_autosync";
const AUTOSYNC_DATE_KEY = "ridex_autosync_date";

function todayStr() { return new Date().toISOString().slice(0, 10); }

function PickCard({ pick, slot, user, onCopied }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const Icon = slot === "morning" ? Sunrise : Moon;
  const copy = async () => {
    if (!user?.id) { toast({ title: "Log in to save picks", variant: "destructive" }); return; }
    try {
      const existing = await base44.entities.MatchPrediction.filter({ match_id: pick.id, user_id: user.id }, "-created_date", 1);
      if (existing.length) await base44.entities.MatchPrediction.update(existing[0].id, { predicted_score_a: pick.home_score, predicted_score_b: pick.away_score });
      else await base44.entities.MatchPrediction.create({ match_id: pick.id, match_label: `${pick.home} vs ${pick.away}`, user_id: user.id, user_name: user.full_name || user.email, predicted_score_a: pick.home_score, predicted_score_b: pick.away_score });
      setCopied(true);
      toast({ title: "Pick saved", description: `${pick.home} vs ${pick.away} → ${pick.market} (${pick.confidence}%)` });
      if (onCopied) onCopied();
    } catch (e) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{slot}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{pick.time || "TBD"}</span>
      </div>
      <p className="text-sm font-medium truncate">{pick.home} <span className="text-muted-foreground">vs</span> {pick.away}</p>
      <p className="text-[10px] text-muted-foreground truncate mb-1.5">{pick.league}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading font-extrabold text-base leading-none text-primary">{pick.market}</p>
          <p className="text-[10px] text-muted-foreground truncate">{pick.marketName}</p>
          <p className="text-[10px] font-semibold mt-0.5">{pick.confidence}% · score {pick.home_score}-{pick.away_score}</p>
          <p className="text-[9px] text-muted-foreground/70 truncate">{pick.basis}</p>
        </div>
        <button onClick={copy} className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold inline-flex items-center gap-1 ${copied ? "bg-emerald-500/15 text-emerald-400" : "bg-primary text-primary-foreground"}`}>
          {copied ? <><Check className="w-3 h-3" /> Saved</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
    </div>
  );
}

export default function RollOverPlan({ matches: initialSoccer, user, onCopied }) {
  const { toast } = useToast();
  const [sport, setSport] = React.useState("soccer");
  const [matches, setMatches] = React.useState(initialSoccer || []);
  const [plan, setPlan] = React.useState([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [searching, setSearching] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [autoSync, setAutoSync] = React.useState(() => localStorage.getItem(AUTOSYNC_KEY) === "1");
  const [syncing, setSyncing] = React.useState(false);
  const [calState, setCalState] = React.useState(() => calStats());

  // Run the verified-pool plan whenever the sport changes — basketball and
  // tennis now draw from the same scrutinized ESPN-verified supply as soccer
  // (the free TheSportsDB feeds carry no usable fixtures for any of them).
  const run = React.useCallback(async () => {
    setSearching(true); setPlan([]); setProgress({ done: 0, total: 0 });
    try {
      const { days, fixtures } = await buildVerifiedSportPlan(sport, (done, total) => setProgress({ done, total }));
      setPlan(days);
      setMatches(fixtures); // verified fixtures keep the calendar sync real
    } finally { setSearching(false); }
  }, [sport]);

  React.useEffect(() => { run(); }, [run, refreshKey]);

  // Auto calendar sync — when enabled, mirrors the day's fixtures into browser
  // storage and pushes them to Google Calendar via the connector (falls back to
  // a one-click .ics import if the API push is unavailable). Fires once per day.
  React.useEffect(() => {
    if (!autoSync || !matches.length || searching) return;
    const last = localStorage.getItem(AUTOSYNC_DATE_KEY);
    if (last === todayStr()) return;
    (async () => {
      setSyncing(true);
      try {
        const r = await syncFixturesToGoogle(matches, sport);
        localStorage.setItem(AUTOSYNC_DATE_KEY, todayStr());
        setCalState(calStats());
        toast({ title: "Calendar auto-synced", description: r.api.ok ? `${r.api.created}/${r.total} pushed to Google Calendar` : `${r.ics} ${sport} fixtures saved locally — import the .ics once.` });
      } finally { setSyncing(false); }
    })();
  }, [autoSync, matches, searching, sport]);

  const toggleAutoSync = async () => {
    const next = !autoSync;
    setAutoSync(next);
    localStorage.setItem(AUTOSYNC_KEY, next ? "1" : "0");
    if (next && matches.length) {
      setSyncing(true);
      try {
        const r = await syncFixturesToGoogle(matches, sport);
        localStorage.setItem(AUTOSYNC_DATE_KEY, todayStr());
        setCalState(calStats());
        toast({ title: "Auto-sync on", description: r.api.ok ? `${r.api.created} fixtures pushed to Google Calendar — 30-min alert each.` : `${r.ics} fixtures saved locally — import the .ics for alerts.` });
      } catch (e) { toast({ title: "Sync failed", description: e.message, variant: "destructive" }); }
      finally { setSyncing(false); }
    } else {
      toast({ title: "Auto-sync off" });
    }
  };

  const syncNow = async () => {
    if (!matches.length) { toast({ title: "No matches to sync" }); return; }
    setSyncing(true);
    try {
      const r = await syncFixturesToGoogle(matches, sport);
      setCalState(calStats());
      toast({ title: r.api.ok ? `${r.api.created}/${r.total} synced to Google Calendar` : `${r.ics} fixtures exported`, description: r.api.ok ? "30-min kickoff reminders added." : "Import the .ics into Google Calendar → Import & export" });
    } catch (e) { toast({ title: "Sync failed", description: e.message, variant: "destructive" }); }
    finally { setSyncing(false); }
  };

  return (
    <div className="space-y-4">
      <RolloverProgress />

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 bg-secondary/40">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Search className="w-4 h-4" /></div>
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /> 7-Day Roll-Over Plan</p>
                <p className="text-[10px] text-muted-foreground">Deep-searched form picks · pick cycle day {cycleInfo().day}/7 — a new Day 1 starts automatically · 50/50, try your luck</p>
              </div>
            </div>
            <button onClick={toggleAutoSync} disabled={syncing} title="Auto-sync to Google Calendar" className={`text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 font-medium disabled:opacity-50 ${autoSync ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {autoSync ? <CalendarCheck className="w-3 h-3" /> : <CalendarPlus className="w-3 h-3" />} Auto-sync {autoSync ? "on" : "off"}
            </button>
          </div>
          {/* Sport switcher */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {SPORTS.map((s) => (
              <button key={s.key} onClick={() => setSport(s.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${sport === s.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 flex items-center justify-between gap-2 border-b border-border/40">
          <p className="text-[10px] text-muted-foreground">Every pick from the engine's verified pools — real form on both sides, head-to-head checked</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={syncNow} disabled={syncing} className="text-xs px-2.5 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 inline-flex items-center gap-1.5">
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />} Sync now
            </button>
            <button onClick={() => setRefreshKey((k) => k + 1)} disabled={searching} className="text-xs px-2.5 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 inline-flex items-center gap-1.5">
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
            </button>
          </div>
        </div>

        {searching ? (
          <div className="px-4 py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Deep-searching {sport} form…</p>
            <p className="text-[10px] text-muted-foreground/70">{progress.done}/{progress.total} verified pools scanned · real form on both sides</p>
          </div>
        ) : plan.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No {sport} fixtures to analyse right now — check back soon.</div>
        ) : (
          <div className="p-3 space-y-2.5">
            {plan.map((day) => (
              <div key={day.date} className="rounded-xl border border-border/40 bg-background/40 p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{day.label}</p>
                  <span className="text-[10px] text-muted-foreground">{day.count} fixtures</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Morning</p>
                    {(day.morningPicks && day.morningPicks.length) ? day.morningPicks.map((p, i) => <PickCard key={i} pick={p} slot="morning" user={user} onCopied={onCopied} />) : <div className="rounded-xl border border-dashed border-border/40 px-3 py-3 text-[11px] text-muted-foreground text-center">No morning fixtures</div>}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Evening</p>
                    {(day.eveningPicks && day.eveningPicks.length) ? day.eveningPicks.map((p, i) => <PickCard key={i} pick={p} slot="evening" user={user} onCopied={onCopied} />) : <div className="rounded-xl border border-dashed border-border/40 px-3 py-3 text-[11px] text-muted-foreground text-center">No evening fixtures</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-t border-border/40 space-y-1">
          {calState.total > 0 && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <CalendarCheck className="w-3 h-3 text-emerald-400" />
              {calState.upcoming} upcoming in browser calendar{calState.connected ? " · synced to Google Calendar" : ""}{calState.lastSync ? ` · last ${new Date(calState.lastSync).toLocaleDateString()}` : ""}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70">
            Picks are estimates from team form — for fun, not betting advice. No outcome is guaranteed. Sync stores fixtures in your browser and pushes a 30-min kickoff reminder per match to Google Calendar.
          </p>
        </div>
      </div>
    </div>
  );
}