import React from "react";
import { base44 } from "@/api/base44Client";
import { Bell, BellOff } from "lucide-react";

export default function MatchNotifications() {
  const [perm, setPerm] = React.useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const seenLive = React.useRef(new Set());
  const seenSoon = React.useRef(new Set());

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
  };

  React.useEffect(() => {
    if (perm !== "granted") return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const list = await base44.entities.LiveMatch.list("-kickoff_time", 30);
        const now = Date.now();
        (list || []).forEach((m) => {
          if (m.status === "live" && !seenLive.current.has(m.id)) {
            seenLive.current.add(m.id);
            try {
              new Notification("⚽ Match Live: " + m.team_a + " vs " + m.team_b, { body: (m.league || "") + (m.minute ? ` · ${m.minute}` : "") });
            } catch {}
          }
          // Kickoff reminder — fires once when a match is within 30 min of kickoff and not yet live.
          if (m.status !== "live" && m.kickoff_time && !seenSoon.current.has(m.id)) {
            const mins = Math.round((new Date(m.kickoff_time).getTime() - now) / 60000);
            if (mins > 0 && mins <= 30) {
              seenSoon.current.add(m.id);
              try {
                new Notification("⏰ Match starts in " + mins + " min", { body: `${m.team_a} vs ${m.team_b}` + (m.league ? ` · ${m.league}` : "") });
              } catch {}
            }
          }
        });
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => { stopped = true; clearInterval(iv); };
  }, [perm]);

  if (perm === "unsupported") return null;

  return (
    <button onClick={enable} disabled={perm === "granted"} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${perm === "granted" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
      {perm === "granted" ? <><Bell className="w-3.5 h-3.5" /> Alerts on</> : <><BellOff className="w-3.5 h-3.5" /> Enable alerts</>}
    </button>
  );
}