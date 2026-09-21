import React, { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import {
  fetchLatestNews, ALERTS, ALERT_LABELS, enableNotifications, pushNotify,
  pollLiveEvents, detectEvent, getTodayMatches, addMatch, removeMatch, getMonthMatches,
} from "@/lib/liveSportsMonitor";
import {
  Activity, Bell, BellRing, RefreshCw, Volume2, Plus, Trash2, Radio, Newspaper, Clock, AlertTriangle, CheckCircle2, Calendar, CalendarPlus, Download,
} from "lucide-react";
import { downloadMatchICS, googleCalendarLink, downloadFixturesICS } from "@/lib/calendarSync";
import { fetchSportsEvents } from "@/lib/sportsScores";

export default function LiveSportsMonitor() {
  const [news, setNews] = useState([]);
  const [newsFeeds, setNewsFeeds] = useState({ ok: 0, total: 0 });
  const [newsLoading, setNewsLoading] = useState(true);

  const [monitoring, setMonitoring] = useState(true);
  const [monitorStatus, setMonitorStatus] = useState("idle");
  const [lastPoll, setLastPoll] = useState(null);
  const [events, setEvents] = useState([]);
  const [notifOn, setNotifOn] = useState(false);

  const [schedule, setSchedule] = useState([]);
  const [cal, setCal] = useState(new Date());
  const [form, setForm] = useState({ time: "", home: "", away: "", league: "" });
  const [syncMsg, setSyncMsg] = useState("");
  const [dlLoading, setDlLoading] = useState(false);
  const [dlMsg, setDlMsg] = useState("");
  const downloadFixturesFile = async () => {
    setDlLoading(true);
    try {
      const events = await fetchSportsEvents();
      const n = downloadFixturesICS(events);
      setDlMsg(n ? `Exported ${n} upcoming fixtures — import ridex-7day-fixtures.ics into your calendar.` : "No upcoming fixtures found to export.");
    } catch { setDlMsg("Couldn't fetch fixtures right now — try again."); }
    finally { setDlLoading(false); setTimeout(() => setDlMsg(""), 8000); }
  };
  const syncToCalendar = () => {
    const n = downloadMatchICS();
    setSyncMsg(n ? `Exported ${n} match${n > 1 ? "es" : ""} — import ridex-match-schedule.ics into Google Calendar → Settings → Import.` : "Add a match with a kickoff time first, then sync.");
    setTimeout(() => setSyncMsg(""), 8000);
  };

  const seenEvents = useRef(new Set());
  const reminded = useRef(new Set()); // scheduled-match ids already alerted

  // ---- Scheduled-match alerts: fire a notification + sound ~15 min before kickoff ----
  useEffect(() => {
    if (!notifOn) return;
    const check = () => {
      const now = new Date();
      getTodayMatches().forEach((m) => {
        if (!m.time || reminded.current.has(m.id)) return;
        const [hh, mm] = m.time.split(":").map(Number);
        const ko = new Date(); ko.setHours(hh || 0, mm || 0, 0, 0);
        const diffMin = (ko - now) / 60000; // minutes until kickoff (negative = already started)
        if (diffMin <= 15 && diffMin > -2) {
          reminded.current.add(m.id);
          const mins = Math.max(0, Math.round(diffMin));
          ALERTS.goal?.();
          pushNotify(
            `${m.home} vs ${m.away} ${mins === 0 ? "starting now" : `in ${mins} min`}`,
            `Kickoff ${m.time}${m.league ? " · " + m.league : ""}`
          );
        }
      });
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [notifOn, schedule]);

  // ---- News ticker (refreshes every 60s so it's always "last minute") ----
  const loadNews = async () => {
    const { items, feedsOk, feedsTotal } = await fetchLatestNews(40);
    setNews(items); setNewsFeeds({ ok: feedsOk, total: feedsTotal }); setNewsLoading(false);
  };
  useEffect(() => { loadNews(); const t = setInterval(loadNews, 60000); return () => clearInterval(t); }, []);

  // ---- Live event monitor ----
  useEffect(() => {
    if (!monitoring) return;
    let active = true;
    const poll = async () => {
      const r = await pollLiveEvents({});
      if (!active) return;
      setLastPoll(new Date());
      if (!r.ok) {
        setMonitorStatus("waiting"); // backend blocked (credits) — keep watching
        return;
      }
      setMonitorStatus("live");
      // Normalize backend payload into a list of event strings.
      let raw = [];
      const d = r.data;
      if (Array.isArray(d)) raw = d;
      else if (d && Array.isArray(d.events)) raw = d.events;
      else if (d && Array.isArray(d.response)) raw = d.response;
      else if (d && typeof d === "object") raw = Object.values(d).filter(Array.isArray).flat();
      const fresh = [];
      raw.forEach((ev) => {
        const label = typeof ev === "string" ? ev : (ev?.text || ev?.detail || ev?.type || ev?.comment || JSON.stringify(ev));
        const key = typeof ev === "string" ? ev : (ev?.id || label);
        if (key && !seenEvents.current.has(key)) {
          seenEvents.current.add(key);
          const type = detectEvent(label);
          if (type) {
            ALERTS[type]?.();
            if (notifOn) pushNotify(ALERT_LABELS[type], label.slice(0, 140));
            fresh.push({ type, label, time: new Date().toLocaleTimeString(), id: key });
          }
        }
      });
      if (fresh.length) setEvents((e) => [...fresh.reverse(), ...e].slice(0, 50));
    };
    poll();
    const t = setInterval(poll, 30000); // poll every 30s — auto-fires when data returns
    return () => { active = false; clearInterval(t); };
    // eslint-disable-next-line
  }, [monitoring, notifOn]);

  // ---- Schedule ----
  const refreshSchedule = () => setSchedule(getTodayMatches());
  useEffect(() => { refreshSchedule(); }, []);
  const submitMatch = (e) => {
    e.preventDefault();
    const m = addMatch(form);
    if (m) { setForm({ time: "", home: "", away: "", league: "" }); refreshSchedule(); }
  };

  const toggleNotifications = async () => {
    if (!notifOn) { const ok = await enableNotifications(); setNotifOn(ok); if (ok) pushNotify("Ride X Live Monitor", "Live match alerts are on."); }
    else setNotifOn(false);
  };

  const tickerText = newsLoading ? "Loading latest sports & world news…" : news.map((n) => `${n.source}: ${n.title}`).join("   •   ");

  return (
    <div>
      <PageHeader
        eyebrow="🔴 Live Sports Monitor"
        title="Live Match Monitor & News"
        subtitle="An always-on ticker of the last minute's sports & world news, a live-match monitor that auto-fires distinct sound alerts for goals, red cards, penalties, substitutions, throw-ins and corners, and a daily match schedule you control."
        action={
          <button onClick={toggleNotifications} className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full font-semibold border transition ${notifOn ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60"}`}>
            {notifOn ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />} Alerts {notifOn ? "On" : "Off"}
          </button>
        }
      />

      {/* Always-on news ticker */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden mb-5">
        <div className="flex items-stretch">
          <div className="shrink-0 bg-primary text-primary-foreground px-3 py-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <Newspaper className="w-4 h-4" /> Live News
          </div>
          <div className="relative flex-1 overflow-hidden">
            <div className="whitespace-nowrap py-2.5 px-3 text-sm animate-marquee" style={{ display: "inline-block" }}>
              {tickerText}
            </div>
          </div>
        </div>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/40 flex items-center justify-between">
          <span>{newsFeeds.ok}/{newsFeeds.total} news feeds live</span>
          <button onClick={loadNews} className="inline-flex items-center gap-1 text-primary font-semibold"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
      </div>

      {/* Live match monitor */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 mb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold flex items-center gap-2"><Radio className="w-5 h-5 text-primary" /> Live Match Monitor</h2>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${
              monitorStatus === "live" ? "bg-emerald-500/15 text-emerald-400" : monitorStatus === "waiting" ? "bg-amber-500/15 text-amber-400" : "bg-secondary text-muted-foreground"
            }`}>
              {monitorStatus === "live" ? <><CheckCircle2 className="w-3 h-3" /> LIVE</> : monitorStatus === "waiting" ? <><Clock className="w-3 h-3" /> Waiting for feed</> : <><Activity className="w-3 h-3" /> Idle</>}
            </span>
            <button onClick={() => setMonitoring((m) => !m)} className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${monitoring ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60"}`}>
              {monitoring ? "Monitoring" : "Paused"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Last poll: {lastPoll ? lastPoll.toLocaleTimeString() : "—"}
        </p>

        {monitorStatus === "waiting" && (
          <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>The live-match backend feed is currently blocked because workspace integration credits are exhausted (resets 2026-09-01). The monitor keeps polling every 30s and will auto-fire goal/red-card/penalty sound alerts the moment live data returns — no action needed.</p>
          </div>
        )}

        {/* Sound test */}
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5" /> Sound alerts (tap to test)</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(ALERT_LABELS).map((k) => (
              <button key={k} onClick={() => ALERTS[k]?.()} className="text-[11px] px-2.5 py-1.5 rounded-full border border-border/60 bg-secondary/40 text-foreground font-semibold active:scale-95 transition">
                {ALERT_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Event feed */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Live event feed</p>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">No live events yet — the monitor is watching and will sound the alarm the moment a match event comes in.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-auto">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 text-sm rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-xs font-bold text-primary whitespace-nowrap">{ALERT_LABELS[ev.type]}</span>
                  <span className="text-xs text-muted-foreground flex-1">{ev.label}</span>
                  <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">{ev.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily match schedule */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Today's Match Schedule</h2>
          <button onClick={refreshSchedule} className="text-xs inline-flex items-center gap-1 text-primary font-semibold"><RefreshCw className="w-3 h-3" /> Sync</button>
        </div>
        <form onSubmit={submitMatch} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} type="time" className="bg-input border border-border/60 rounded-lg px-2.5 py-2 text-sm" />
          <input value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} placeholder="Home team" className="bg-input border border-border/60 rounded-lg px-2.5 py-2 text-sm" />
          <input value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} placeholder="Away team" className="bg-input border border-border/60 rounded-lg px-2.5 py-2 text-sm" />
          <div className="flex gap-1">
            <input value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })} placeholder="League" className="flex-1 min-w-0 bg-input border border-border/60 rounded-lg px-2.5 py-2 text-sm" />
            <button type="submit" className="shrink-0 px-3 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
        </form>
        {schedule.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No matches scheduled for today. Add one above.</p>
        ) : (
          <div className="space-y-1.5">
            {schedule.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <span className="text-xs font-bold text-primary whitespace-nowrap w-16">{m.time || "—"}</span>
                <span className="flex-1 min-w-0 truncate">{m.home} <span className="text-muted-foreground">vs</span> {m.away}</span>
                {m.league && <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{m.league}</span>}
                <a href={googleCalendarLink(m)} target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary" title="Add to Google Calendar"><CalendarPlus className="w-3.5 h-3.5" /></a>
                <button onClick={() => { removeMatch(m.id); refreshSchedule(); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly calendar sync */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Match Calendar</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setCal(new Date(cal.getFullYear(), cal.getMonth() - 1, 1))} className="w-7 h-7 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground">‹</button>
            <span className="text-xs font-semibold w-28 text-center">{cal.toLocaleDateString("en-NG", { month: "long", year: "numeric" })}</span>
            <button onClick={() => setCal(new Date(cal.getFullYear(), cal.getMonth() + 1, 1))} className="w-7 h-7 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground">›</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {(() => {
            const y = cal.getFullYear(), m = cal.getMonth();
            const first = new Date(y, m, 1).getDay();
            const days = new Date(y, m + 1, 0).getDate();
            const byDay = {};
            getMonthMatches(y, m).forEach((mm) => { const dd = parseInt((mm.date || "").slice(8), 10); if (dd) (byDay[dd] || (byDay[dd] = [])).push(mm); });
            const cells = [];
            for (let i = 0; i < first; i++) cells.push(<div key={"b" + i} />);
            for (let d = 1; d <= days; d++) {
              const t = new Date(); const isToday = d === t.getDate() && m === t.getMonth() && y === t.getFullYear();
              const has = byDay[d];
              cells.push(
                <div key={d} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${isToday ? "bg-primary text-primary-foreground font-bold" : has ? "bg-primary/15 text-primary" : "bg-secondary/40 text-foreground"}`}>
                  <span>{d}</span>
                  {has && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
                </div>
              );
            }
            return cells;
          })()}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={syncToCalendar} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold">
            <Download className="w-3.5 h-3.5" /> Sync to Google Calendar
          </button>
          <button onClick={downloadFixturesFile} disabled={dlLoading} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary text-foreground font-semibold border border-border/60 hover:border-primary/50 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> {dlLoading ? "Preparing…" : "Download fixtures .ics"}
          </button>
          {syncMsg && <span className="text-[11px] text-primary/90">{syncMsg}</span>}
          {dlMsg && <span className="text-[11px] text-primary/90">{dlMsg}</span>}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2">Days with a dot have scheduled matches. The .ics export includes a 15-min kickoff reminder on every event — import it once into Google Calendar and alerts fire automatically.</p>
      </div>

      <p className="text-[11px] text-muted-foreground/70 text-center">
        News & schedule work offline. Live match scores require the API-Football backend, which resumes when workspace integration credits reset on 2026-09-01.
      </p>
    </div>
  );
}