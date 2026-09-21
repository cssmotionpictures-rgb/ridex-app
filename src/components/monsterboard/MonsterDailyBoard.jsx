import React from "react";
import { Flame, Eye } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/kala/Bits";
import MonsterPickCard from "@/components/monsterboard/MonsterPickCard";
import { MONSTER_TARGET } from "@/lib/monsterBoard";

// TODAY'S DROP — the MONSTER daily board. Every position is a genuinely
// qualified selection; empty positions stay empty rather than being filled
// with something weak. WATCH selections are shown separately and never enter
// the ticket.
export default function MonsterDailyBoard({ monster, results, windowLabel }) {
  const board = monster?.board || [];
  const watch = monster?.watch || [];
  const corr = monster?.correlation || {};
  const keyOf = (p) => `${p.fixtureId}|${p.marketKey}`;
  return (
    <div className="space-y-4">
      <SectionCard
        title={`${windowLabel || "TODAY"} DROP`}
        icon={<Flame className="w-4 h-4 text-primary" />}
        sub={
          board.length
            ? `${board.length} qualified selection${board.length === 1 ? "" : "s"} — ranked by strongest current evidence. Never forced to fill the board.`
            : "The board only ever shows genuinely qualified selections."
        }
        right={
          board.length ? (
            <span className="shrink-0 inline-flex px-2.5 py-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 text-[10px] font-extrabold">
              MONSTER IS LIVE · {board.length}/{MONSTER_TARGET}
            </span>
          ) : null
        }
      >
        {board.length ? (
          <div className="space-y-3">
            {board.map((p, i) => (
              <MonsterPickCard
                key={keyOf(p)}
                pick={p}
                rank={i + 1}
                correlation={corr[keyOf(p)]}
                result={(results || {})[keyOf(p)]}
              />
            ))}
            {board.length < MONSTER_TARGET && (
              <p className="text-[10px] text-muted-foreground">
                {MONSTER_TARGET - board.length} position{MONSTER_TARGET - board.length === 1 ? "" : "s"} left empty —
                the standard is never lowered to reach {MONSTER_TARGET}.
              </p>
            )}
          </div>
        ) : (
          <EmptyState>
            NO QUALIFIED MONSTER PICKS {windowLabel === "TODAY" ? "TODAY" : "IN THIS WINDOW"}
          </EmptyState>
        )}
      </SectionCard>

      {watch.length > 0 && (
        <SectionCard
          title="MONSTER WATCH"
          icon={<Eye className="w-4 h-4 text-primary" />}
          sub="Interesting selections that did not meet the full MONSTER standard — they never enter the MONSTER ticket."
        >
          <div className="space-y-3">
            {watch.slice(0, 6).map((p) => (
              <MonsterPickCard key={keyOf(p)} pick={p} watch result={(results || {})[keyOf(p)]} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}