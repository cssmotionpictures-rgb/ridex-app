import React from "react";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RUNO_WINDOWS, RUNO_SESSIONS } from "@/lib/runO";

// RUN O main controls — the large primary SCAN NOW button plus the fixture
// window and session filters (all Lagos time).
export default function ScanControls({
  scan, onScan, windowKey, setWindowKey, session, setSession, progress,
}) {
  const pill = (active, label, onClick) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] inline-flex items-center transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-3">
      <Button
        className="w-full h-13 rounded-2xl text-base font-extrabold py-3.5"
        onClick={() => onScan(true)}
        disabled={scan === "scanning"}
      >
        {scan === "scanning" ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : (
          <Zap className="w-5 h-5 mr-2" />
        )}
        {scan === "scanning"
          ? `SCANNING… ${progress.done}/${progress.total} LEAGUES`
          : "RUN O — SCAN NOW"}
      </Button>
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {RUNO_WINDOWS.map((w) => pill(windowKey === w.key, w.label, () => setWindowKey(w.key)))}
        </div>
        <div className="flex gap-1.5">
          {RUNO_SESSIONS.map((s) => pill(session === s.key, s.label, () => setSession(s.key)))}
        </div>
      </div>
    </div>
  );
}