import React from "react";
import { Radio, BellRing, BellOff } from "lucide-react";
import {
  subscribeLivePing,
  setPingEnabled,
  requestPingPermission,
  getLivePingState,
} from "@/lib/livePingScanner";
import { playPingSound } from "@/lib/sportsSounds";

// LIVE SCANNER PING — the sports-page chip for the app-wide live-game
// scanner (src/lib/livePingScanner.js). The scanner itself runs on every
// page; this chip shows its status, lists the newest kickoffs and toggles
// the alerts on/off.
export default function LiveMatchPing() {
  const [snap, setSnap] = React.useState(() => {
    const s = getLivePingState();
    return { on: s.on, live: s.live, fresh: s.fresh };
  });

  React.useEffect(() => {
    return subscribeLivePing((s) => {
      setSnap({ on: s.on, live: s.live, fresh: s.fresh });
    });
  }, []);

  const toggle = async () => {
    const next = !snap.on;
    setPingEnabled(next);
    if (next) {
      await requestPingPermission();
      playPingSound();
    }
  };

  const { on, live, fresh } = snap;

  return (
    <div className="space-y-2">
      <button
        onClick={toggle}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold ${
          on
            ? "bg-red-500/15 text-red-400 border border-red-500/40"
            : "bg-secondary text-muted-foreground"
        }`}
      >
        {on ? <BellRing className="w-3.5 h-3.5 animate-pulse" /> : <BellOff className="w-3.5 h-3.5" />}
        {on
          ? live == null
            ? "LIVE SCANNER PING ON — watching for new live games"
            : `LIVE SCANNER PING ON · ${live} live now`
          : "SCANNER PING OFF — tap to never miss a kickoff"}
      </button>
      {fresh.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 space-y-1">
          {fresh.map((m) => (
            <p key={m.id} className="text-[10px] font-semibold text-red-300 flex items-center gap-1.5">
              <Radio className="w-3 h-3 animate-pulse shrink-0" />
              <span className="truncate">
                NEW LIVE: {m.home} vs {m.away} · {m.league || "Live"}
              </span>
            </p>
          ))}
          <button
            onClick={() => {
              setSnap((s) => ({ ...s, fresh: [] }));
              const s = getLivePingState();
              s.fresh = [];
            }}
            className="text-[9px] text-muted-foreground underline"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}