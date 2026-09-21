import React from "react";
import { useBreakingNewsPoll } from "@/lib/newsAlerts";
import { Radio, Bell, BellOff, ExternalLink } from "lucide-react";

// Always-on breaking-news radar. Polls the zero-credit news-alerts function,
// pings a browser notification on any new headline, and shows a scrolling
// ticker of the latest reports across BBC / Al Jazeera / Sky.
export default function BreakingNewsTicker() {
  const { items, lastFetch } = useBreakingNewsPoll({ intervalMs: 5 * 60 * 1000 });
  const [perm, setPerm] = React.useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const [open, setOpen] = React.useState(false);

  const breaking = items.filter((i) => i.breaking);
  const ticker = items.slice(0, 12);

  const askPermission = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPerm(p));
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-red-500/15 to-transparent">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <Radio className="w-4 h-4 text-red-400" />
        <span className="text-sm font-bold">Breaking News Radar</span>
        <span className="text-[10px] text-muted-foreground ml-1">live · {items.length} reports</span>
        <button
          onClick={perm === "default" ? askPermission : undefined}
          className="ml-auto inline-flex items-center gap-1 text-[11px] bg-secondary px-2.5 py-1 rounded-full hover:text-foreground text-muted-foreground"
          title={perm === "granted" ? "Notifications on" : perm === "denied" ? "Notifications blocked in browser" : "Enable pings"}
        >
          {perm === "granted" ? <Bell className="w-3.5 h-3.5 text-primary" /> : <BellOff className="w-3.5 h-3.5" />}
          {perm === "granted" ? "Pings on" : perm === "denied" ? "Blocked" : "Enable"}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-primary hover:underline">
          {open ? "Hide" : "View all"}
        </button>
      </div>

      {ticker.length > 0 && !open && (
        <div className="overflow-hidden whitespace-nowrap py-2 px-3 text-sm">
          <span className="inline-block animate-marquee will-change-transform">
            {[...ticker, ...ticker].map((it, i) => (
              <span key={i} className="mx-4">
                <span className={`text-[10px] font-bold ${it.breaking ? "text-red-400" : "text-primary"}`}>● {it.source}</span>{" "}
                <span className="text-foreground/90">{it.title}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {open && (
        <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
          {items.slice(0, 25).map((it, i) => (
            <a key={i} href={it.link} target="_blank" rel="noopener noreferrer" className="flex gap-2 px-3 py-2 hover:bg-secondary/50 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {it.breaking && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">BREAKING</span>}
                  <span className="text-[10px] text-muted-foreground">{it.source}</span>
                </div>
                <div className="text-sm font-medium leading-snug group-hover:text-primary line-clamp-2">{it.title}</div>
                {it.pubDate && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(it.pubDate).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" />
            </a>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground">Loading latest reports…</div>
      )}
    </div>
  );
}