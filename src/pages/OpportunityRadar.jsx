import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { scanAll, buildApplicationDraft, mailtoLink, playAlarm } from "@/lib/opportunityRadar";
import PageHeader from "@/components/shared/PageHeader";
import { Radar, Bell, BellOff, RefreshCw, ExternalLink, Mail, Copy, Music2, Briefcase, GraduationCap, Plane, Loader2 } from "lucide-react";

const CAT_ICON = { Remote: Briefcase, Scholarship: GraduationCap, Relocation: Plane };

export default function OpportunityRadar() {
  const [items, setItems] = useState([]);
  const [feeds, setFeeds] = useState({ ok: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [alarmOn, setAlarmOn] = useState(() => { try { return localStorage.getItem("opradar_alarm") !== "off"; } catch { return true; } });
  const toggleAlarm = async () => {
    const next = !alarmOn;
    setAlarmOn(next);
    try { localStorage.setItem("opradar_alarm", next ? "on" : "off"); } catch {}
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
  };
  const [lastScan, setLastScan] = useState(null);
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState("all"); // all | music | remote | scholarship
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(null);
  const seenRef = useRef(typeof window !== "undefined" ? new Set(JSON.parse(localStorage.getItem("opradar_seen") || "[]")) : new Set());
  const [newCount, setNewCount] = useState(0);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser(null)); }, []);

  const runScan = async (initial = false) => {
    setScanning(true);
    const { items: found, feedsOk, feedsTotal } = await scanAll();
    // detect fresh matches (not seen before)
    const fresh = found.filter((it) => it.link && !seenRef.current.has(it.link));
    fresh.forEach((it) => seenRef.current.add(it.link));
    try { localStorage.setItem("opradar_seen", JSON.stringify([...seenRef.current].slice(-500))); } catch {}
    setItems(found);
    setFeeds({ ok: feedsOk, total: feedsTotal });
    setLastScan(new Date());
    setLoading(false);
    setScanning(false);
    if (!initial && fresh.length && alarmOn) {
      playAlarm();
      setNewCount(fresh.length);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(`${fresh.length} new opportunity match${fresh.length > 1 ? "es" : ""}!`, { body: fresh.slice(0, 3).map((f) => f.title).join("\n"), tag: "ridex-opradar" }); } catch {}
      }
    } else {
      setNewCount(0);
    }
  };

  useEffect(() => { runScan(true); /* eslint-disable-next-line */ }, []);

  // auto re-scan every 10 minutes so the radar stays "live" without credits
  useEffect(() => {
    const t = setInterval(() => runScan(false), 10 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [alarmOn]);

  const filtered = items.filter((it) => {
    if (filter === "music") return it.music;
    if (filter === "remote") return it.category === "Remote";
    if (filter === "scholarship") return it.category === "Scholarship";
    return true;
  });

  const openDraft = (item) => setDraft({ item, ...buildApplicationDraft(item, user) });
  const copyDraft = async (item) => {
    const d = buildApplicationDraft(item, user);
    try {
      await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
      setCopied(item.link); setTimeout(() => setCopied(null), 1800);
    } catch {}
  };

  return (
    <div>
      <PageHeader
        eyebrow="🛰️ Opportunity Radar"
        title="Nigeria-Friendly Jobs & Opportunities"
        subtitle="Scans free public job feeds worldwide, scores every opportunity for how Nigeria-friendly it is (remote, worldwide, Africa, diaspora, music industry, scholarships, relocation), and sounds an alarm the moment a new match appears. Tap any opportunity to auto-generate a ready application email."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAlarm}
              className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full font-semibold border transition ${alarmOn ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60"}`}
            >
              {alarmOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />} Alarm {alarmOn ? "On" : "Off"}
            </button>
          </div>
        }
      />

      {/* control bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => runScan(false)}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {scanning ? "Scanning…" : "Re-scan"}
        </button>
        <span className="text-xs text-muted-foreground">
          {feeds.ok}/{feeds.total} feeds live · {items.length} opportunities · {lastScan ? `last ${lastScan.toLocaleTimeString()}` : "—"}
        </span>
        {newCount > 0 && <span className="text-xs font-bold text-primary animate-pulse">🔔 {newCount} new match{newCount > 1 ? "es" : ""}!</span>}
      </div>

      {/* filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
        {[["all", "All"], ["remote", "Remote jobs"], ["music", "🎵 Music"], ["scholarship", "Scholarships"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">Scanning worldwide job feeds for Nigeria-friendly opportunities…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No opportunities matched this filter right now. Try another filter or re-scan.
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((it) => {
          const Icon = CAT_ICON[it.category] || Briefcase;
          return (
            <div key={it.link || it.title} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${it.music ? "bg-fuchsia-500/15 text-fuchsia-400" : "bg-primary/15 text-primary"}`}>
                  {it.music ? <Music2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{it.source}</span>
                    {it.music && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-400 font-semibold">🎵 Music</span>}
                    <span className="text-[10px] font-bold text-primary">⚡ {it._score} match</span>
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mt-1 leading-snug">{it.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <a href={it.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-semibold">
                      <ExternalLink className="w-3 h-3" /> View job
                    </a>
                    <button onClick={() => openDraft(it)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border/60 text-foreground font-semibold">
                      <Mail className="w-3 h-3" /> Auto-apply draft
                    </button>
                    <button onClick={() => copyDraft(it)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground font-semibold">
                      <Copy className="w-3 h-3" /> {copied === it.link ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* application draft modal */}
      {draft && (
        <div className="fixed inset-0 z-[2000] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setDraft(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border/60 p-4 max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Auto-Application Draft</h3>
              <button onClick={() => setDraft(null)} className="text-muted-foreground text-sm">✕</button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{draft.item.title} · {draft.item.source}</p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">To</p>
                <p className="font-medium">{draft.to || <span className="text-amber-400">No direct email found in this listing — use the "View job" link to apply on their site.</span>}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</p>
                <p className="font-medium">{draft.subject}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Body</p>
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-secondary/40 rounded-lg p-3 font-body leading-relaxed">{draft.body}</pre>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {draft.to && (
                <a href={mailtoLink(draft)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  <Mail className="w-4 h-4" /> Open in email app
                </a>
              )}
              <button
                onClick={async () => { try { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); setCopied("draft"); setTimeout(() => setCopied(null), 1800); } catch {} }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/60 text-sm font-semibold"
              >
                <Copy className="w-4 h-4" /> {copied === "draft" ? "Copied!" : "Copy draft"}
              </button>
              <a href={draft.item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/60 text-sm font-semibold">
                <ExternalLink className="w-4 h-4" /> Go to application
              </a>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-3">Auto-drafted by Ride X Opportunity Radar. Server-side auto-send is paused while workspace integration credits are exhausted — copy or open in your email app to submit instantly.</p>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4 flex items-start gap-3">
        <Radar className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">How it works:</span> the radar fetches free public job feeds directly in your browser (no backend, no credits), scores each role for Nigeria-friendliness, plays an alarm when fresh matches land, and auto-writes your application. It re-scans automatically every 10 minutes. Toggle the alarm off if you only want silent notifications.
        </p>
      </div>
    </div>
  );
}