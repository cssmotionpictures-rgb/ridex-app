import React from "react";
import { getDisasters } from "@/lib/disasterAlerts";
import { AlertTriangle, Activity, Waves, Mountain, CloudRainWind, Flame, Loader2, ExternalLink, ShieldAlert } from "lucide-react";

const TYPE_ICON = {
  earthquake: Activity,
  cyclone: CloudRainWind,
  flood: Waves,
  volcano: Mountain,
  drought: Flame,
  landslide: Mountain,
  wildfire: Flame,
  alert: AlertTriangle,
};

const SEV_COLOR = {
  red: "text-red-400 border-red-500/40 bg-red-500/5",
  orange: "text-amber-400 border-amber-500/40 bg-amber-500/5",
  green: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
};

export default function DisasterAlerts() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const notifiedRef = React.useRef(new Set());

  const load = React.useCallback(async () => {
    try {
      const res = await getDisasters();
      setItems(res?.items || []);
      setError("");
      if ("Notification" in window && Notification.permission === "granted") {
        for (const it of (res?.items || [])) {
          if (it.severity === "red" && !notifiedRef.current.has(it.title)) {
            notifiedRef.current.add(it.title);
            try { new Notification("🚨 Disaster Alert — Ride X", { body: it.title.slice(0, 140) }); } catch {}
          }
        }
      }
    } catch (e) {
      setError(e?.message || "Disaster feed unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 300000);
    return () => clearInterval(id);
  }, [load]);

  const redCount = items.filter((i) => i.severity === "red").length;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Scanning global disaster feeds…</span>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-amber-400/90">{error}</div>;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="w-5 h-5 text-red-400" /> Natural Disaster Watch
          {redCount > 0 && <span className="ml-1 text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">{redCount} RED</span>}
        </button>
        <span className="text-[11px] text-muted-foreground">{items.length} active</span>
      </div>

      {open && (
        <div className="mt-3 space-y-2 max-h-72 overflow-y-auto no-scrollbar">
          {items.length === 0 && <p className="text-xs text-muted-foreground">No significant events detected right now.</p>}
          {items.map((it, i) => {
            const Icon = TYPE_ICON[it.type] || AlertTriangle;
            return (
              <a key={i} href={it.link} target="_blank" rel="noopener noreferrer" className={`flex items-start gap-2 rounded-lg border p-2 ${SEV_COLOR[it.severity] || SEV_COLOR.orange}`}>
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug">{it.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {it.source} · {it.pubDate ? new Date(it.pubDate).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {!open && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 truncate">{items[0].title} · tap to expand</p>
      )}
    </div>
  );
}