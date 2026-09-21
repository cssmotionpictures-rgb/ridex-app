import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withTimeoutMs,
  TimeoutError,
  fetchJsonResilient,
  isRetryableStatus,
  isRetryableError,
  createTtlCache,
  createRequestGuard,
  providerStatusLabel,
} from "@/lib/resilient";

// RESILIENCE SUITE — timeouts, retry classification, backoff, TTL/dedupe
// caching, stale-request guards and provider status semantics. These are the
// guarantees that keep /sports loading no matter what a provider does.

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  };
}

function neverResolvingFetch() {
  return new Promise(() => {});
}

describe("retry classification", () => {
  it("retries transient statuses: 429, 408, 500, 502, 503, 504", () => {
    for (const s of [429, 408, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
  });

  it("NEVER retries auth/malformed statuses: 400, 401, 403, 404, 422", () => {
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false);
  });

  it("classifies timeout and network errors as retryable; auth errors not", () => {
    const timeoutErr = new TimeoutError("x", 10);
    expect(isRetryableError(timeoutErr)).toBe(true);
    const netErr = new Error("network error: boom");
    netErr.code = "NETWORK";
    expect(isRetryableError(netErr)).toBe(true);
    const authErr = new Error("HTTP 401");
    authErr.status = 401;
    expect(isRetryableError(authErr)).toBe(false);
    const bttsErr = new Error("HTTP 422");
    bttsErr.status = 422;
    expect(isRetryableError(bttsErr)).toBe(false); // BTTS 422 → fall back, never hammer retries
  });
});

describe("withTimeoutMs", () => {
  it("resolves normally when the promise settles in time", async () => {
    await expect(withTimeoutMs(Promise.resolve("ok"), 5000)).resolves.toBe("ok");
  });

  it("rejects with TimeoutError when the promise hangs", async () => {
    await expect(withTimeoutMs(neverResolvingFetch(), 50, "provider scan")).rejects.toMatchObject({
      name: "TimeoutError",
      code: "TIMEOUT",
    });
  });

  it("never leaves a request blocking indefinitely (fake clock)", async () => {
    vi.useFakeTimers();
    try {
      const p = withTimeoutMs(neverResolvingFetch(), 20000, "slow provider");
      const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.advanceTimersByTimeAsync(20001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchJsonResilient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hello: "world" }));
    const p = fetchJsonResilient("https://x.test/data", { fetchImpl, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toEqual({ hello: "world" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging provider and rejects (bounded request)", async () => {
    const fetchImpl = vi.fn(neverResolvingFetch);
    const p = fetchJsonResilient("https://x.test/hang", { fetchImpl, timeoutMs: 3000, retries: 0 });
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
  });

  it("does NOT retry HTTP 400/401/403/422 — a single attempt", async () => {
    for (const status of [400, 401, 403, 422]) {
      const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, { status }));
      const p = fetchJsonResilient("https://x.test/bad", { fetchImpl, timeoutMs: 5000, retries: 3 });
      const assertion = expect(p).rejects.toMatchObject({ status });
      await vi.advanceTimersByTimeAsync(0);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("retries HTTP 500 then succeeds (backoff ~500ms)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const p = fetchJsonResilient("https://x.test/flaky", { fetchImpl, timeoutMs: 5000, retries: 2 });
    const assertion = expect(p).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries HTTP 429 and respects Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const p = fetchJsonResilient("https://x.test/rate", { fetchImpl, timeoutMs: 5000, retries: 2 });
    // advance past the provider's 2s Retry-After — the retry fires then, not before
    await vi.advanceTimersByTimeAsync(2100);
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget on repeated 500s", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 503 }));
    const p = fetchJsonResilient("https://x.test/dead", { fetchImpl, timeoutMs: 5000, retries: 2 });
    const assertion = expect(p).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries — no infinite loop
  });

  it("retries network errors then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const p = fetchJsonResilient("https://x.test/net", { fetchImpl, timeoutMs: 5000, retries: 2 });
    const assertion = expect(p).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed JSON bodies", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error("Unexpected token <");
      },
    }));
    const p = fetchJsonResilient("https://x.test/html", { fetchImpl, timeoutMs: 5000, retries: 0 });
    const assertion = expect(p).rejects.toMatchObject({ code: "BAD_BODY" });
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });
});

describe("createTtlCache (duplicate request prevention)", () => {
  it("deduplicates concurrent identical calls into ONE underlying request", async () => {
    let calls = 0;
    const factory = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return { value: calls };
    };
    const cache = createTtlCache(60000);
    const [a, b, c] = await Promise.all([cache.run("k", factory), cache.run("k", factory), cache.run("k", factory)]);
    expect(calls).toBe(1); // no request storm — API credits protected
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("serves from cache within the TTL and refetches after it", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const factory = async () => ++calls;
      const cache = createTtlCache(1000);
      const first = cache.run("k", factory);
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBe(1);
      const cached = cache.run("k", factory);
      await vi.advanceTimersByTimeAsync(0);
      expect(await cached).toBe(1); // still the first result — inside TTL
      await vi.advanceTimersByTimeAsync(1001); // TTL expired
      const fresh = cache.run("k", factory);
      await vi.advanceTimersByTimeAsync(0);
      expect(await fresh).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("force=true bypasses the cache", async () => {
    let calls = 0;
    const factory = async () => ++calls;
    const cache = createTtlCache(60000);
    await cache.run("k", factory);
    await cache.run("k", factory, { force: true });
    expect(calls).toBe(2);
  });

  it("evicts a failed entry so a retry can start fresh", async () => {
    let calls = 0;
    const factory = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return "ok";
    };
    const cache = createTtlCache(60000);
    await expect(cache.run("k", factory)).rejects.toThrow("boom");
    await expect(cache.run("k", factory)).resolves.toBe("ok");
  });
});

describe("createRequestGuard (stale response cancellation)", () => {
  it("ignores an older slow response when a newer request started", () => {
    const guard = createRequestGuard();
    const t1 = guard.begin();
    const t2 = guard.begin(); // user pressed refresh
    expect(guard.isCurrent(t1)).toBe(false); // old response must never overwrite newer data
    expect(guard.isCurrent(t2)).toBe(true);
  });

  it("is current for the only in-flight request", () => {
    const guard = createRequestGuard();
    const t = guard.begin();
    expect(guard.isCurrent(t)).toBe(true);
  });
});

describe("providerStatusLabel (status semantics)", () => {
  it("marks a fast successful probe CONNECTED", () => {
    expect(providerStatusLabel("ONLINE", 1200)).toBe("CONNECTED");
  });

  it("marks a slow-but-successful probe DEGRADED", () => {
    expect(providerStatusLabel("ONLINE", 9000)).toBe("DEGRADED");
  });

  it("maps provider failures to OFFLINE", () => {
    for (const raw of ["OFFLINE", "ERROR", "UNAVAILABLE", "DISABLED"]) {
      expect(providerStatusLabel(raw, 100)).toBe("OFFLINE");
    }
  });

  it("a missing optional provider key (e.g. Sportradar) never breaks the panel", () => {
    expect(providerStatusLabel("NOT CONFIGURED", 100)).toBe("OFFLINE");
    expect(providerStatusLabel(undefined, 0)).toBe("UNKNOWN"); // never throws
    expect(providerStatusLabel(null, 0)).toBe("UNKNOWN");
  });
});