// TASK 52741 — RESULTS & HISTORY DUPLICATE DISPLAY / COUNT FIX
// Regression suite for the canonical projection: one prediction identity =
// one visible result, one counted win/loss/void. Raw duplicate copies on the
// immutable ledger can never inflate finished counts, wins, losses,
// performance, calibration or learning evidence.
import { describe, expect, it } from "vitest";
import { canonicalizeRows, canonicalStats, canonicalIdentityOf } from "@/lib/globalLearning/canonicalProjection";

const G_866 = "monster|monster-v1|espn-401816866|1|v1";
const G_851 = "monster|monster-v1|espn-401816851|1|v1";

const copy = (gid, i, over = {}) => ({
  id: `row_${gid}_${i}`,
  global_prediction_id: gid,
  source_section: "monster",
  model_version: "monster-v1",
  fixture_id: gid.split("|")[2],
  home: "Athletics",
  away: "Toronto Blue Jays",
  market_key: "1",
  market_label: "Athletics to Win",
  prediction_version: 1,
  confidence: 79,
  status: "won",
  actual_home: 2,
  actual_away: 0,
  lagos_date_key: "2026-09-09",
  created_date: new Date(Date.parse("2026-09-09T21:35:00Z") + i * 60000).toISOString(),
  ...over,
});

describe("TEST 1 — 12 identical copies of one prediction", () => {
  it("projects to 1 row, 1 finished prediction, 1 result", () => {
    const rows = Array.from({ length: 12 }, (_, i) => copy(G_866, i));
    const canon = canonicalizeRows(rows);
    const stats = canonicalStats(rows);
    expect(canon.length).toBe(1);
    expect(stats.finished).toBe(1);
    expect(stats.won).toBe(1);
    expect(stats.lost).toBe(0);
    expect(stats.void).toBe(0);
    expect(stats.unique).toBe(1);
    expect(stats.duplicateCopiesExcluded).toBe(11);
  });
});

describe("TEST 2 — two different fixtures, same teams and selection", () => {
  it("stays 2 separate results", () => {
    const rows = [
      copy(G_851, 0, { actual_home: 6, actual_away: 5, lagos_date_key: "2026-09-08", fixture_id: "espn-401816851" }),
      copy(G_866, 0),
    ];
    const canon = canonicalizeRows(rows);
    const stats = canonicalStats(rows);
    expect(canon.length).toBe(2);
    expect(stats.finished).toBe(2);
    expect(stats.won).toBe(2);
  });
});

describe("TEST 3 — Athletics Sep 7 6–5 + Sep 9 2–0 (plus 11 Sep-9 copies)", () => {
  it("projects to exactly 2 results, never merged", () => {
    const rows = [
      copy(G_851, 0, { actual_home: 6, actual_away: 5, lagos_date_key: "2026-09-08", fixture_id: "espn-401816851" }),
      ...Array.from({ length: 12 }, (_, i) => copy(G_866, i)),
    ];
    const canon = canonicalizeRows(rows);
    const sep7 = canon.filter((r) => r.fixture_id === "espn-401816851");
    const sep9 = canon.filter((r) => r.fixture_id === "espn-401816866");
    expect(canon.length).toBe(2);
    expect(sep7.length).toBe(1);
    expect(`${sep7[0].actual_home}–${sep7[0].actual_away}`).toBe("6–5");
    expect(sep9.length).toBe(1);
    expect(`${sep9[0].actual_home}–${sep9[0].actual_away}`).toBe("2–0");
  });
});

describe("TEST 4 — archived duplicate copies", () => {
  it("archived copies (absent from reads) are neither displayed nor counted", () => {
    const rows = Array.from({ length: 12 }, (_, i) => copy(G_866, i));
    // The authorized cleanup archives copies by removing them from the live
    // read — the projection only ever sees live rows.
    const archived = rows.slice(5); // archived by the cleanup run
    const live = rows.slice(0, 5);
    const stats = canonicalStats(live);
    expect(canonicalizeRows(live).length).toBe(1);
    expect(stats.finished).toBe(1);
    expect(stats.won).toBe(1);
    // archiving copies changed nothing visible — and the same identity
    // still projects to exactly one row with zero copies left.
    const single = canonicalStats(live.slice(0, 1));
    expect(single.finished).toBe(1);
    expect(single.won).toBe(1);
    expect(archived.length).toBe(7);
  });
});

describe("TEST 5 — open duplicate copy exists", () => {
  it("only the canonical settled result is projected once", () => {
    const rows = [
      copy(G_866, 0), // graded
      copy(G_866, 1, { status: "open", actual_home: 0, actual_away: 0 }),
      copy(G_866, 2, { status: "open", actual_home: 0, actual_away: 0 }),
    ];
    const canon = canonicalizeRows(rows);
    const stats = canonicalStats(rows);
    expect(canon.length).toBe(1);
    expect(canon[0].status).toBe("won"); // graded beats open copies
    expect(stats.finished).toBe(1);
    expect(stats.won).toBe(1);
  });
});

describe("TEST 6 — different model versions for the same fixture", () => {
  it("never collapses champion/challenger records", () => {
    const rows = [
      copy("kala|RX-2.0|of-en1-2026-09-09-ars-che|1|v1", 0, { source_section: "kala", model_version: "RX-2.0", home: "Arsenal", away: "Chelsea", fixture_id: "of-en1-2026-09-09-ars-che" }),
      copy("kala|RX-2.1|of-en1-2026-09-09-ars-che|1|v1", 0, { source_section: "kala", model_version: "RX-2.1", home: "Arsenal", away: "Chelsea", fixture_id: "of-en1-2026-09-09-ars-che" }),
    ];
    const canon = canonicalizeRows(rows);
    const stats = canonicalStats(rows);
    expect(canon.length).toBe(2); // distinct model identities stay distinct
    expect(stats.finished).toBe(2);
    // distinct prediction versions stay distinct too
    const versions = [
      copy("kala|RX-2.0|fx|1|v1", 0, { prediction_version: 1 }),
      copy("kala|RX-2.0|fx|1|v2", 0, { prediction_version: 2 }),
    ];
    expect(canonicalizeRows(versions).length).toBe(2);
  });
});

describe("TEST 7 — VOID result", () => {
  it("counts once under VOID with zero win/loss contribution", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => copy("win-raba|wr-v1|fx-void|1|v1", i, { source_section: "win-raba", status: "void", actual_home: 0, actual_away: 0, fixture_id: "fx-void" })),
      copy("win-raba|wr-v1|fx-won|1|v1", 0, { source_section: "win-raba", fixture_id: "fx-won" }),
      copy("win-raba|wr-v1|fx-lost|1|v1", 0, { source_section: "win-raba", status: "lost", fixture_id: "fx-lost" }),
    ];
    const stats = canonicalStats(rows);
    expect(stats.finished).toBe(3);
    expect(stats.won).toBe(1);
    expect(stats.lost).toBe(1);
    expect(stats.void).toBe(1); // 4 void copies → 1 void identity
  });
});

describe("TEST 8 — repeated import / re-ingestion", () => {
  it("never creates an additional visible row", () => {
    // The same prediction identity re-arrives later (re-ingestion copy with a
    // NEW record id and LATER created_date) — the projection still shows one.
    const existing = [copy(G_866, 0)];
    const reingested = [copy(G_866, 99, { id: "row_reingested", created_date: "2026-09-10T08:32:09.687Z" })];
    const canon = canonicalizeRows([...existing, ...reingested]);
    expect(canon.length).toBe(1);
    expect(canonicalStats([...existing, ...reingested]).finished).toBe(1);
    expect(canonicalStats([...existing, ...reingested]).won).toBe(1);
    // identity is the canonical key — same fixture+market+version+model = same key
    expect(canonicalIdentityOf(existing[0])).toBe(canonicalIdentityOf(reingested[0]));
  });
});

describe("TEST 9 — performance counters match Results & History", () => {
  it("unique-identity counts reconcile across projections", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => copy(G_866, i)),
      copy(G_851, 0, { actual_home: 6, actual_away: 5, lagos_date_key: "2026-09-08", fixture_id: "espn-401816851" }),
      copy("kala|RX-2.0|fx-k1|1|v1", 0, { source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-k1" }),
      copy("kala|RX-2.0|fx-k2|1|v1", 0, { source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-k2", status: "lost" }),
    ];
    const stats = canonicalStats(rows);
    // Results & History projection: canonicalize first, then count
    const resultsPageRows = canonicalizeRows(rows);
    expect(resultsPageRows.length).toBe(4);
    expect(stats.unique).toBe(resultsPageRows.length); // identical projection
    expect(stats.raw).toBe(15);
    expect(stats.finished).toBe(4);
    expect(stats.won).toBe(3);
    expect(stats.lost).toBe(1);
  });
});

describe("TEST 10 — pagination", () => {
  it("deduplicates BEFORE pagination — no identity can appear on two pages", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => copy(G_866, i)),
      copy(G_851, 0, { fixture_id: "espn-401816851" }),
      copy("kala|RX-2.0|fx-k1|1|v1", 0, { source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-k1" }),
      copy("kala|RX-2.0|fx-k2|1|v1", 0, { source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-k2" }),
    ];
    // projection FIRST (exactly what Results & History does), then paginate
    const canon = canonicalizeRows(rows);
    const page1 = canon.slice(0, 2);
    const page2 = canon.slice(2, 4);
    const ids1 = new Set(page1.map(canonicalIdentityOf));
    const ids2 = new Set(page2.map(canonicalIdentityOf));
    expect([...ids1].filter((id) => ids2.has(id))).toEqual([]); // disjoint pages
    expect(page1.length + page2.length).toBe(4);
  });
});

describe("TEST 11 — concurrent ingestion (identical timestamps)", () => {
  it("still projects to exactly one canonical row", () => {
    const sameInstant = "2026-09-09T21:35:58.867000";
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ...copy(G_866, 0),
      id: `race_${i}`,
      created_date: sameInstant, // concurrent write burst — same created_date
    }));
    const canon = canonicalizeRows(rows);
    expect(canon.length).toBe(1);
    expect(canon[0].id).toBe("race_0"); // deterministic tie-break
    expect(canonicalStats(rows).won).toBe(1);
  });
});

describe("TEST 12 — provider fixture IDs missing", () => {
  it("uses canonical fallback identity and never silently merges ambiguous fixtures", () => {
    // no global id, but fixture id present → identity reconstructed from
    // immutable fields and identical rows still collapse to one
    const a = {
      id: "a1", source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-legacy-1",
      market_key: "1", prediction_version: 1, status: "won", created_date: "2026-09-01T00:00:00Z",
    };
    const a2 = {
      id: "a2", source_section: "kala", model_version: "RX-2.0", fixture_id: "fx-legacy-1",
      market_key: "1", prediction_version: 1, status: "won", created_date: "2026-09-02T00:00:00Z",
    };
    expect(canonicalIdentityOf(a)).toBe(canonicalIdentityOf(a2));
    expect(canonicalizeRows([a, a2]).length).toBe(1);
    // no global id AND no fixture id → ambiguous: NEVER merged, even when
    // teams/market/display text look identical
    const ambiguous1 = { id: "amb1", source_section: "kala", model_version: "RX-2.0", market_key: "1", home: "Arsenal", away: "Chelsea", status: "won", created_date: "2026-09-01T00:00:00Z" };
    const ambiguous2 = { id: "amb2", source_section: "kala", model_version: "RX-2.0", market_key: "1", home: "Arsenal", away: "Chelsea", status: "won", created_date: "2026-09-01T00:00:00Z" };
    const canon = canonicalizeRows([ambiguous1, ambiguous2]);
    expect(canon.length).toBe(2); // stays separate — never silently merged
  });
});