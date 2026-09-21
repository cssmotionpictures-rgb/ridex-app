import { describe, it, expect } from "vitest";
import { unwrapApiFootballEnvelope } from "../lib/ensemble/apiFootballPayload";

// TRANSPORT REGRESSION — pins the exact wrapper bug that made every cached
// injuries/lineups fetch silently read as "unavailable" (the payload existed,
// the unwrap looked one level too shallow).
describe("api-football transport envelope unwrapping", () => {
  it("unwraps a fresh axios-style response: SDK wrapper → body {cached, data} → payload", () => {
    const res = {
      status: 200,
      statusText: "OK",
      data: { cached: false, data: { get: "injuries", parameters: {}, results: 2, response: [{ team: { name: "Twente" } }, {}] } },
    };
    const out = unwrapApiFootballEnvelope(res);
    expect(out.error).toBe(null);
    expect(out.cached).toBe(false);
    expect(out.payload.results).toBe(2);
    expect(Array.isArray(out.payload.response)).toBe(true);
    expect(out.payload.response[0].team.name).toBe("Twente");
  });

  it("unwraps the cached chunked-cache shape: {data:{cached, data:{__cache, chunks, data: payload}}}", () => {
    const res = {
      status: 200,
      data: {
        cached: true,
        data: { __cache: true, chunks: 0, data: { get: "injuries", results: 300, response: Array.from({ length: 300 }, () => ({})) } },
      },
    };
    const out = unwrapApiFootballEnvelope(res);
    expect(out.error).toBe(null);
    expect(out.cached).toBe(true);
    expect(out.payload.results).toBe(300);
    expect(out.payload.response).toHaveLength(300);
  });

  it("unwraps a bare body (no axios wrapper): {cached, data: payload}", () => {
    const out = unwrapApiFootballEnvelope({ cached: false, data: { get: "fixtures/lineups", results: 2, response: [{}, {}] } });
    expect(out.error).toBe(null);
    expect(out.payload.results).toBe(2);
  });

  it("an EMPTY provider response is available with zero records — distinct from unavailable", () => {
    const out = unwrapApiFootballEnvelope({ status: 200, data: { cached: false, data: { results: 0, errors: [], response: [] } } });
    expect(out.error).toBe(null);
    expect(Array.isArray(out.payload.response)).toBe(true);
    expect(out.payload.response).toHaveLength(0);
  });

  it("returns the provider error so the caller records an honest failure, never a fabricated payload", () => {
    const rate = unwrapApiFootballEnvelope({ status: 200, data: { cached: false, error: "api-football upstream 429: Too Many Requests" } });
    expect(rate.payload).toBe(null);
    expect(rate.error).toMatch(/429/);
    const plan = unwrapApiFootballEnvelope({ status: 200, data: { cached: false, error: "This endpoint is not available for your subscription plan" } });
    expect(plan.payload).toBe(null);
    expect(plan.error).toMatch(/plan/i);
  });

  it("returns a null payload for malformed/absent wrappers — never an invented one", () => {
    expect(unwrapApiFootballEnvelope(null).payload).toBe(null);
    expect(unwrapApiFootballEnvelope(undefined).payload).toBe(null);
    // chunked-cache wrapper whose rehydrated payload is missing
    expect(unwrapApiFootballEnvelope({ __cache: true, chunks: 0, data: null }).payload).toBe(null);
    // completely malformed wrapper (no payload anywhere)
    expect(unwrapApiFootballEnvelope({ status: 200, data: { cached: false, data: { __cache: true, data: undefined } } }).payload).toBe(null);
  });

  it("never treats a plain string or array body as a payload with a .response", () => {
    expect(unwrapApiFootballEnvelope({ status: 200, data: "gateway error" }).payload).toBe("gateway error");
    expect(Array.isArray(unwrapApiFootballEnvelope({ status: 200, data: [1, 2] }).payload)).toBe(true);
  });
});