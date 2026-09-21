// 429-AWARE SECONDARY READS — retry handling for background database reads.
// Design rules (never violated):
//  - ONLY HTTP 429 read throttling is retried; every other error fails fast
//    exactly as before — nothing is hammered and real failures are never masked.
//  - Retry-After is respected when the platform supplies one (capped so a bad
//    value can never freeze a panel).
//  - Exponential backoff with jitter, MAX 3 retries per read.
//  - Callers decide the empty-state policy: pass `fallback` to preserve the old
//    .catch(() => []) contract, or omit it and catch ThrottleReadError to keep
//    the last good data and surface a "retrying" state.
//  - This module is NEVER used inside the primary prediction scan — the scan
//    stays exactly as fast as before, no matter how throttled the ledgers are.

export class ThrottleReadError extends Error {
  constructor(cause) {
    super("Secondary read throttled (HTTP 429) — retries exhausted");
    this.name = "ThrottleReadError";
    this.isThrottle = true;
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const statusOf = (e) =>
  Number(e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.data?.status);

const messageOf = (e) =>
  String(e?.message || e?.detail || e?.response?.data?.message || e);

// Detect platform read throttling (HTTP 429 / entity read traffic volume limit).
export function isThrottleError(e) {
  if (!e) return false;
  if (e.isThrottle) return true;
  if (statusOf(e) === 429) return true;
  const msg = messageOf(e);
  if (/entity read traffic volume limit/i.test(msg)) return true;
  return /\b429\b/.test(msg) && /traffic|rate limit|throttl|too many requests/i.test(msg);
}

// Retry-After, when the platform supplies one ("Retry after 19s" or a
// Retry-After header) — capped at 60s so a bad value can never stall a panel.
function retryAfterMsOf(e) {
  const m = String(e?.detail || e?.message || "").match(
    /retry[ -]?after\s*([\d.]+)\s*(ms|s|sec|seconds|min|minutes)?/i
  );
  if (m) {
    const v = Number(m[1]);
    const unit = String(m[2] || "s").toLowerCase();
    const ms = Number.isFinite(v)
      ? unit.startsWith("ms") ? v : unit.startsWith("min") ? v * 60000 : v * 1000
      : null;
    if (ms != null) return Math.min(Math.max(ms, 0), 60000);
  }
  try {
    const h = e?.response?.headers?.get?.("retry-after");
    const secs = Number(h);
    if (Number.isFinite(secs)) return Math.min(Math.max(secs * 1000, 0), 60000);
  } catch {
    /* SDK errors carry no header object */
  }
  return null;
}

export const READ_RETRIES = 3;

// Read with 429 handling: detect the throttle explicitly, respect Retry-After,
// back off exponentially with jitter, retry at most 3 times. Non-throttle
// errors are never retried — they fail exactly as before.
export async function readWithRetry(readFn, { retries = READ_RETRIES, fallback } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readFn();
    } catch (e) {
      if (!isThrottleError(e)) {
        if (fallback !== undefined) return fallback;
        throw e;
      }
      if (attempt >= retries) {
        if (fallback !== undefined) return fallback; // contract-preserving swallow
        throw new ThrottleReadError(e);
      }
      const backoff = Math.min(1000 * 2 ** attempt, 16000);
      const wait = Math.max(backoff, retryAfterMsOf(e) ?? 0) + Math.random() * 400; // jitter
      await sleep(wait);
    }
  }
}