// RESILIENT REQUEST LAYER — the single place every /sports request goes
// through: bounded timeouts, limited retries with backoff, TTL/dedupe caching
// and stale-response guards. A slow or dead provider can never block the page
// indefinitely, and a duplicate request can never storm an API.
//
// This module is PURE at module scope (the SDK is imported lazily inside
// invokeFunction only), so the automated test suite covers it end-to-end.

export const DEFAULT_TIMEOUT_MS = 12000; // normal API request
export const SLOW_PROVIDER_TIMEOUT_MS = 20000; // slow provider aggregation — hard ceiling
export const SLOW_NOTICE_MS = 8000; // after this long a load shows its "taking longer than usual" state

export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label || "request"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.code = "TIMEOUT";
  }
}

// Reject with TimeoutError if a promise does not settle within ms. Never
// leaves an unresolved request blocking the UI.
export function withTimeoutMs(promise, ms, label) {
  if (!(ms > 0)) return promise;
  let timer;
  const timed = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    timed,
  ]);
}

// Retry classification — authentication/authorization/malformed-request
// failures (400, 401, 403, 404, 422) are NEVER retried; transient failures
// (timeout, network, 429, 5xx) are.
export function isRetryableStatus(status) {
  const s = Number(status);
  return s === 429 || s === 408 || (s >= 500 && s <= 599);
}

export function isRetryableError(err) {
  if (!err) return false;
  if (err.code === "TIMEOUT" || err.code === "NETWORK") return true;
  return isRetryableStatus(err.status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonOnce(url, init, timeoutMs, fetchImpl) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const timed = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new TimeoutError(`fetch ${url}`, timeoutMs));
    }, timeoutMs);
  });
  let res;
  try {
    res = await Promise.race([
      fetchImpl(url, { ...init, signal: init.signal || (controller ? controller.signal : undefined) }),
      timed,
    ]);
  } catch (e) {
    const err = new Error(`network error: ${e?.message || e}`);
    err.code = e?.code === "TIMEOUT" ? "TIMEOUT" : "NETWORK";
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${url}`);
    err.status = res.status;
    if (res.status === 429) {
      // respect the provider's Retry-After header when present
      const ra = Number(res.headers?.get?.("retry-after"));
      if (Number.isFinite(ra) && ra >= 0) err.retryAfterMs = ra * 1000;
    }
    throw err;
  }
  try {
    return await res.json();
  } catch (e) {
    const err = new Error(`malformed response body from ${url}: ${e?.message || e}`);
    err.code = "BAD_BODY";
    throw err;
  }
}

// fetch + JSON with a bounded timeout and limited retries with backoff.
// attempts: initial + `retries` retries. Backoff doubles (500ms, 1000ms…)
// unless a 429 supplied Retry-After.
export async function fetchJsonResilient(url, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    initialDelayMs = 500,
    fetchImpl = (typeof fetch !== "undefined" ? fetch : null),
    ...init
  } = opts;
  if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
  let attempt = 0;
  for (;;) {
    try {
      return await fetchJsonOnce(url, init, timeoutMs, fetchImpl);
    } catch (err) {
      if (attempt >= retries || !isRetryableError(err)) throw err;
      const delay = err.retryAfterMs != null ? err.retryAfterMs : initialDelayMs * Math.pow(2, attempt);
      await sleep(delay);
      attempt++;
    }
  }
}

// Backend-function invocation with a bounded timeout. The SDK is imported
// lazily so this module stays importable in the pure test environment.
// A single paced retry on 429/5xx clears the platform's transient request
// throttles (the /sports page fires several invokes on mount) instead of
// surfacing "provider unavailable" while the provider is actually fine.
let base44Sdk = null;
export async function invokeFunction(name, payload = {}, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, retryDelayMs = 2500 } = opts;
  if (!base44Sdk) {
    const mod = await import("@/api/base44Client");
    base44Sdk = mod.base44;
  }
  const run = () => withTimeoutMs(base44Sdk.functions.invoke(name, payload), timeoutMs, `${name} request`);
  try {
    return await run();
  } catch (err) {
    if (retries <= 0) throw err;
    const msg = String(err?.message || "");
    const status = Number(
      err?.status ?? err?.response?.status ?? (msg.match(/status code (\d+)/) || [])[1]
    );
    const throttled = status === 429 || (status >= 500 && status <= 599);
    if (!throttled) throw err;
    await sleep(retryDelayMs);
    return run();
  }
}

// TTL cache with in-flight dedupe — identical requests within the TTL (or
// while one is still in flight) share a single underlying call, so API
// credits are never burned on duplicates. A failed call is evicted so a
// retry can start fresh.
export function createTtlCache(defaultTtlMs = 60000) {
  const map = new Map(); // key -> { at, promise }
  return {
    run(key, factory, { ttl = defaultTtlMs, force = false } = {}) {
      const hit = map.get(key);
      if (!force && hit && Date.now() - hit.at < ttl) return hit.promise;
      const entry = {
        at: Date.now(),
        promise: Promise.resolve()
          .then(factory)
          .catch((e) => {
            if (map.get(key) === entry) map.delete(key);
            throw e;
          }),
      };
      map.set(key, entry);
      return entry.promise;
    },
    clear() {
      map.clear();
    },
  };
}

// Stale-response guard — when a refresh starts, older in-flight responses
// are ignored on arrival so a slow request can never overwrite newer data.
export function createRequestGuard() {
  let latest = 0;
  return {
    begin() {
      return ++latest;
    },
    isCurrent(token) {
      return token === latest;
    },
  };
}

// Provider status semantics:
//   CONNECTED — successful recent request
//   DEGRADED  — provider responds but slowly (> 6s)
//   OFFLINE   — provider unavailable / disabled / not configured
//   UNKNOWN   — status not checked yet
// A missing OPTIONAL provider key (e.g. Sportradar) maps to OFFLINE — it can
// never throw or break the panel.
export function providerStatusLabel(raw, elapsedMs = 0) {
  const s = String(raw || "").trim().toUpperCase();
  if (["ONLINE", "CONNECTED", "OK", "ACTIVE", "PASS"].includes(s)) {
    return elapsedMs > 6000 ? "DEGRADED" : "CONNECTED";
  }
  if (["OFFLINE", "ERROR", "UNAVAILABLE", "FAILED", "DOWN", "DISABLED", "NOT CONFIGURED", "MISSING_KEY"].includes(s)) {
    return "OFFLINE";
  }
  return "UNKNOWN";
}