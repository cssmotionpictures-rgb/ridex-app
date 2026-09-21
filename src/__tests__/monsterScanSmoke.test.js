// TEMPORARY smoke test — reproduce the MONSTER daily-drop build failure with a
// real stack trace. Deleted once the cause is fixed.
import { describe, it, expect } from "vitest";
import { buildWinRabaBoard } from "@/lib/winRaba";
import { buildMonster } from "@/lib/monsterBoard";

describe("monster daily drop smoke", () => {
  it("builds the engine board and the MONSTER view", async () => {
    const b = await buildWinRabaBoard({ force: true });
    expect(b).toBeTruthy();
    expect(Array.isArray(b.days)).toBe(true);
    const perDay = [];
    (b.days || []).forEach((d) => {
      const m = buildMonster(b, { windowKey: d.dateKey, session: "all" });
      m.board.forEach((p, i) => perDay.push({ pick: p, rank: i + 1 }));
    });
    expect(perDay.length).toBeGreaterThanOrEqual(0);
  }, 120000);
});