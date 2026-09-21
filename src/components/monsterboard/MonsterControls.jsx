import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONSTER_WINDOWS, MONSTER_SESSIONS } from "@/lib/monsterBoard";

// MONSTER main controls — the manual REFRESH action plus the fixture window
// and session filters (all Lagos time). The daily drop itself is automatic;
// REFRESH MONSTER is only the additional manual action.
export default function MonsterControls({
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
        className="w-full rounded-2xl text-base font-extrabold py-3.5"
        onClick={() => onScan(true)}
        disabled={scan === "scanning"}
      >
        {scan === "scanning" ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="w-5 h-5 mr-2" />
        )}
        {scan === "scanning"
          ? `BUILDING TODAY'S DROP… ${progress.done}/${progress.total} LEAGUES`
          : "REFRESH MONSTER"}
      </Button>
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {MONSTER_WINDOWS.map((w) => pill(windowKey === w.key, w.label, () => setWindowKey(w.key)))}
        </div>
        <div className="flex gap-1.5">
          {MONSTER_SESSIONS.map((s) => pill(session === s.key, s.label, () => setSession(s.key)))}
        </div>
      </div>
    </div>
  );
}