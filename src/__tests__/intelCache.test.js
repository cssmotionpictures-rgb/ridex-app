import { describe, it, expect } from "vitest";
import {
  slimRow,
  markersFromRows,
  markersUnchanged,
  readIntelCache,
  writeIntelCache,
  clearIntelCache,
  INTEL_CACHE_KEY,
} from "@/lib/globalLearning/intelCache";

// SNAPSHOT CACHE REGRESSION — the cache-first open of the Prediction
// Intelligence page must be both CHEAP (no ledger traversal when the change
// markers match) and SAFE (anything ambiguous forces a recount; a failed
// probe is never mistaken for "verified fresh").
describe("intelCache — snapshot cache + change markers", () => {
  it("slimRow strips heavy blob fields and oversized strings, keeps everything else", () => {
    const row = {
      id: "r1",
      status: "won",
      market_key: "1",
      snapshot_json: "x".repeat(50),
      provenance_json: "{}",
      models_json: "[]",
      giant_field: "y".repeat(5000),
    };
    const slim = slimRow(row);
    expect(slim.id).toBe("r1");
    expect(slim.status).toBe("won");
    expect(slim.market_key).toBe("1");
    expect("snapshot_json" in slim).toBe(false);
    expect("provenance_json" in slim).toBe(false);
    expect("models_json" in slim).toBe(false);
    expect("giant_field" in slim).toBe(false);
  });

  it("markersFromRows picks the newest-created and most-recently-updated rows", () => {
    const rows = [
      { id: "a", created_date: "2026-09-10T10:00:00Z", updated_date: "2026-09-10T11:00:00Z" },
      { id: "b", created_date: "2026-09-11T09:00:00Z", updated_date: "2026-09-09T08:00:00Z" },
      { id: "c", created_date: "2026-09-09T07:00:00Z", updated_date: "2026-09-11T10:00:00Z" },
    ];
    expect(markersFromRows(rows)).toEqual({ created: "2026-09-11T09:00:00Z|b", updated: "2026-09-11T10:00:00Z|c" });
    expect(markersFromRows([])).toEqual({ created: "", updated: "" });
    // a later update to an OLD row must still flip the updated marker
    expect(markersFromRows([...rows, { id: "d", created_date: "2026-09-01T00:00:00Z", updated_date: "2026-09-12T06:00:00Z" }]).updated).toBe(
      "2026-09-12T06:00:00Z|d"
    );
  });

  it("markersUnchanged — only an exact, non-empty marker match counts as fresh", () => {
    const m = { created: "x|1", updated: "y|2" };
    expect(markersUnchanged(m, { created: "x|1", updated: "y|2" })).toBe(true);
    expect(markersUnchanged(m, { created: "z|3", updated: "y|2" })).toBe(false);
    expect(markersUnchanged(m, null)).toBe(false);
    expect(markersUnchanged(null, m)).toBe(false);
    // an empty probe is never "verified fresh" — it must force a recount
    expect(markersUnchanged({ created: "", updated: "" }, { created: "", updated: "" })).toBe(false);
  });

  it("snapshot round-trips through browser storage", () => {
    clearIntelCache();
    expect(readIntelCache()).toBe(null);
    const ok = writeIntelCache({
      markers: { created: "x|1", updated: "y|2" },
      readDiag: { pages: 2, capped: false, source: "browser", raw: 3000, canonical: 1276 },
      rows: [slimRow({ id: "r1", status: "won" })],
      insights: [],
      batches: [],
      changelog: [],
    });
    expect(ok).toBe(true);
    const cached = readIntelCache();
    expect(cached.rows).toHaveLength(1);
    expect(cached.rows[0].id).toBe("r1");
    expect(cached.markers.created).toBe("x|1");
    expect(cached.readDiag.canonical).toBe(1276);
    clearIntelCache();
    expect(readIntelCache()).toBe(null);
    expect(INTEL_CACHE_KEY).toContain("v3");
  });
});