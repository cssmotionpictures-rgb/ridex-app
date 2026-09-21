import { describe, it, expect } from "vitest";
import { SportradarClient, classifyRetry, coverageLevel } from "../../base44/shared/sportradarClient";

// SportradarClient — the centralized Sportradar Soccer v4 client. These tests
// cover the spec's resilience contract: retry classification, trial rate-limit
// serialization, TTL cache + dedupe, response validation, coverage scoring and
// honest health semantics. The API key never appears in errors or metrics.

const okJson = (data, headers) => ({
  ok: true,
  status: 200,
  headers: { get: () => null, ...(headers || {}) },
  json: async () => data,
});
const http = (status, headers) => ({
  ok: false,
  status,
  headers: { get: (h) => (headers || {})[h] != null ? String(headers[h]) : null },
  json: async () => ({}),
});

const mk = (responses, opts = {}) => {
  const calls = [];
  const sleeps = [];
  const client = new SportradarClient({
    apiKey: "test-key-123",
    fetchImpl: async (url, init) => {
      calls.push({ url, init, at: Date.now() });
      const r = responses[Math.min(calls.length - 1, responses.length - 1)];
      return typeof r === "function" ? r(calls.length) : r;
    },
    sleep: async (ms) => sleeps.push(ms),
    timeoutMs: 2000,
    minIntervalMs: 0,
    maxAttempts: 3,
    ...opts,
  });
  return { client, calls, sleeps };
};

describe("classifyRetry — transient failures only", () => {
  it("retries rate limits and 5xx", () => {
    for (const s of [429, 500, 502, 503, 504]) expect(classifyRetry(s, null)).toBe("retry");
  });
  it("never retries auth / malformed-request statuses", () => {
    for (const s of [400, 401, 403, 404, 422]) expect(classifyRetry(s, null)).toBe("no-retry");
  });
  it("retries timeout and network errors", () => {
    expect(classifyRetry(null, "AbortError")).toBe("retry");
    expect(classifyRetry(null, "TimeoutError")).toBe("retry");
    expect(classifyRetry(null, "TypeError")).toBe("retry");
  });
});

describe("coverageLevel — coverage is scored, never assumed", () => {
  const flags = (o) => ({ sport_event_properties: o });
  it("INSUFFICIENT when no coverage flags exist", () => {
    expect(coverageLevel(null).level).toBe("INSUFFICIENT");
    expect(coverageLevel({}).level).toBe("INSUFFICIENT");
    expect(coverageLevel(flags({})).level).toBe("INSUFFICIENT");
  });
  it("LOW for minimal coverage", () => {
    expect(coverageLevel(flags({ scores: "post" })).level).toBe("LOW");
  });
  it("MEDIUM for partial coverage", () => {
    expect(coverageLevel(flags({ lineups: true, extended_team_stats: true })).level).toBe("MEDIUM");
  });
  it("FULL when every tracked flag is present", () => {
    expect(coverageLevel(flags({
      lineups: true, formations: true, venue: true, extended_team_stats: true,
      extended_player_stats: true, goal_scorers: true, scores: "post",
    })).level).toBe("FULL");
  });
});

describe("SportradarClient requests", () => {
  it("authenticates with x-api-key, validates JSON and records success", async () => {
    const { client, calls } = mk([okJson({ generated_at: "x", schedules: [] })]);
    const data = await client.get("/schedules/2026-09-05/schedules");
    expect(data.schedules).toEqual([]);
    expect(calls[0].init.headers["x-api-key"]).toBe("test-key-123");
    expect(client.metrics.lastStatus).toBe(200);
    expect(client.healthSnapshot().status).toBe("ONLINE");
  });

  it("rejects invalid paths — no arbitrary request injection", async () => {
    const { client } = mk([okJson({})]);
    await expect(client.get("/../secrets")).rejects.toThrow();
    await expect(client.get("https://evil.example")).rejects.toThrow();
  });

  it("retries a 500 exactly once with backoff, then succeeds", async () => {
    const { client, sleeps } = mk([http(500), okJson({ ok: 1 })]);
    const data = await client.get("/competitions");
    expect(data).toEqual({ ok: 1 });
    expect(client.metrics.retries).toBe(1);
    expect(sleeps).toContain(500);
  });

  it("never retries 401 — one request, honest AUTH ERROR health", async () => {
    const { client, calls } = mk([http(401)]);
    const data = await client.get("/competitions");
    expect(data).toBeNull();
    expect(calls.length).toBe(1);
    expect(client.healthSnapshot().status).toBe("AUTH ERROR");
  });

  it("respects Retry-After on 429", async () => {
    const { client, sleeps } = mk([http(429, { "retry-after": "2" }), okJson({ ok: 1 })]);
    const data = await client.get("/seasons");
    expect(data).toEqual({ ok: 1 });
    expect(client.metrics.rateLimited).toBe(1);
    expect(sleeps).toContain(2000);
  });

  it("gives up after maxAttempts on persistent 5xx, never hammering", async () => {
    const { client, calls } = mk([http(503)]);
    const data = await client.get("/seasons");
    expect(data).toBeNull();
    expect(calls.length).toBe(3);
    expect(client.healthSnapshot().status).toBe("OFFLINE");
  });

  it("rejects malformed responses and never leaks the key in errors", async () => {
    const { client } = mk([{ ok: true, status: 200, headers: { get: () => null }, json: async () => "not-an-object" }]);
    const data = await client.get("/competitions");
    expect(data).toBeNull();
    const err = JSON.stringify(client.metrics);
    expect(err).not.toContain("test-key-123");
  });
});

describe("SportradarClient cache + rate limit", () => {
  it("serves identical requests from the TTL cache — no duplicate spend", async () => {
    const { client, calls } = mk([okJson({ generated_at: "x" })]);
    await client.get("/competitions", { ttlMs: 60000 });
    await client.get("/competitions", { ttlMs: 60000 });
    expect(calls.length).toBe(1);
  });

  it("re-issues after the TTL expires — stale prices/data are never served forever", async () => {
    const { client, calls } = mk([okJson({ generated_at: "x" })], { minIntervalMs: 0 });
    await client.get("/competitions", { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 15));
    await client.get("/competitions", { ttlMs: 1 });
    expect(calls.length).toBe(2);
  });

  it("serializes requests with the trial minimum interval — ~1 req/s respected", async () => {
    const starts = [];
    const client = new SportradarClient({
      apiKey: "k",
      fetchImpl: async () => { starts.push(Date.now()); return okJson({ ok: 1 }); },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      minIntervalMs: 120,
    });
    await Promise.all([client.get("/a"), client.get("/b")]);
    const gap = starts[1] - starts[0];
    expect(gap).toBeGreaterThanOrEqual(100);
  });

  it("dedupes a request already in flight", async () => {
    const { client, calls } = mk([
      () => new Promise((res) => setTimeout(() => res(okJson({ ok: 1 })), 40)),
    ]);
    const [a, b] = await Promise.all([client.get("/live"), client.get("/live")]);
    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 1 });
    expect(calls.length).toBe(1);
  });
});