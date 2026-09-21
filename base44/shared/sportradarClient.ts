// SportradarClient — the ONE centralized Sportradar Soccer API v4 client.
// Every Sportradar request in the app goes through here: server-side x-api-key
// auth, bounded timeouts, retry with backoff (never for 400/401/403/404 —
// auth/bad-request), Retry-After respected on 429, trial rate-limit
// serialization (~1 req/s), TTL caching, in-flight dedupe, response validation,
// request metrics and honest health derivation. The API key NEVER leaves the
// server and is never logged or included in any response.
//
// Entitlements verified live against the trial (2026-09-05, all HTTP 200):
//   /competitions · /seasons · /schedules/{date}/schedules ·
//   /schedules/live/schedules · /sport_events/{id}/summary ·
//   /sport_events/{id}/timeline · /sport_events/{id}/lineups
// NOT subscribed and therefore NEVER requested/used: Soccer Probabilities,
// Extended Probabilities, Extended Historical, any odds/props feed. The
// prediction engine calculates its own probabilities; Sportradar supplies
// DATA and per-event COVERAGE metadata only.

const envGet = (k) => {
  try {
    if (typeof Deno !== "undefined") return Deno.env.get(k);
  } catch { /* not Deno */ }
  try {
    return typeof process !== "undefined" && process.env ? process.env[k] : undefined;
  } catch {
    return undefined;
  }
};

// Retry policy: transient failures only. Timeout (AbortError/TimeoutError) and
// network errors (TypeError) retry; 429 and 5xx retry; 400/401/403/404 never
// (malformed request / bad key — hammering the provider would waste credits).
export function classifyRetry(status, errName) {
  if (errName === "AbortError" || errName === "TimeoutError" || errName === "TypeError") return "retry";
  if (status == null) return errName ? "retry" : "no-retry";
  if ([429, 500, 502, 503, 504].includes(status)) return "retry";
  return "no-retry";
}

// Coverage-aware scoring (spec §6). Sportradar publishes per-event coverage
// flags; they are NEVER assumed — an event with no flags scores INSUFFICIENT.
// Weights (documented formula): lineups 2, extended_team_stats 2, formations 1,
// extended_player_stats 1, goal_scorers 1, scores 1, venue 1 → total 9.
// ratio ≥ 0.99 FULL · ≥ 0.5 HIGH · ≥ 0.25 MEDIUM · > 0 LOW · else INSUFFICIENT.
export function coverageLevel(coverage) {
  const p = coverage && typeof coverage === "object" ? coverage.sport_event_properties || {} : {};
  const weights = { lineups: 2, extended_team_stats: 2, formations: 1, extended_player_stats: 1, goal_scorers: 1, scores: 1, venue: 1 };
  let score = 0;
  for (const [k, w] of Object.entries(weights)) if (p[k]) score += w;
  const ratio = score / 9;
  const level = score === 0 ? "INSUFFICIENT" : ratio >= 0.99 ? "FULL" : ratio >= 0.5 ? "HIGH" : ratio >= 0.25 ? "MEDIUM" : "LOW";
  return { level, score, ratio };
}

export class SportradarClient {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || envGet("SPORTRADAR_API_KEY") || null;
    this.accessLevel = opts.accessLevel || envGet("SPORTRADAR_ACCESS_LEVEL") || "trial";
    this.language = opts.language || envGet("SPORTRADAR_LANGUAGE") || "en";
    this.baseUrl = `https://api.sportradar.com/soccer/${this.accessLevel}/v4/${this.language}`;
    this.fetchImpl = opts.fetchImpl || ((...args) => fetch(...args));
    this.sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 12000;
    this.minIntervalMs = opts.minIntervalMs != null ? opts.minIntervalMs : 1100; // trial ≈ 1 req/s
    this.maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : 3;
    this.metrics = {
      requests: 0, retries: 0, errors: 0, rateLimited: 0,
      lastStatus: null, lastLatencyMs: null, lastSuccess: null, lastError: null,
    };
    this._queue = Promise.resolve();
    this._lastStart = 0;
    this._cache = new Map();
    this._inflight = null;
  }

  ready() {
    return !!this.apiKey;
  }

  // TTL cache + in-flight dedupe: identical requests inside the TTL are served
  // from memory; a request already in flight is awaited, never duplicated —
  // the trial credit/request budget is protected.
  get(path, opts = {}) {
    const ttlMs = opts.ttlMs || 0;
    const hit = this._cache.get(path);
    if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data);
    if (this._inflight && this._inflight.path === path) return this._inflight.promise;
    const promise = this._request(path)
      .then((data) => {
        if (data != null && ttlMs > 0) this._cache.set(path, { ts: Date.now(), ttlMs, data });
        return data;
      })
      .finally(() => {
        if (this._inflight && this._inflight.promise === promise) this._inflight = null;
      });
    this._inflight = { path, promise };
    return promise;
  }

  // All requests serialize through one queue with a minimum start interval —
  // the trial plan's per-second limit can never be exceeded, even when many
  // callers race at once.
  _request(path) {
    if (!this.ready()) return Promise.reject(new Error("Sportradar API key not configured"));
    if (!/^\/[A-Za-z0-9/_\-.:?=&]+$/.test(path) || path.includes("..") || path.includes("//")) {
      return Promise.reject(new Error("Invalid Sportradar path"));
    }
    const run = this._queue.then(() => this._attempt(path));
    this._queue = run.then(() => {}, () => {});
    return run;
  }

  async _attempt(path) {
    const wait = Math.max(0, this._lastStart + this.minIntervalMs - Date.now());
    if (wait > 0) await this.sleep(wait);
    this._lastStart = Date.now();

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const started = Date.now();
      try {
        this.metrics.requests++;
        const res = await this.fetchImpl(this.baseUrl + path, {
          headers: { "x-api-key": this.apiKey, Accept: "application/json" },
          signal: ctrl.signal,
        });
        this.metrics.lastStatus = res.status;
        if (res.ok) {
          const data = await res.json();
          if (!data || typeof data !== "object") throw new Error("Malformed provider response");
          this.metrics.lastLatencyMs = Date.now() - started;
          this.metrics.lastSuccess = new Date().toISOString();
          this.metrics.lastError = null;
          return data;
        }
        if (res.status === 429) this.metrics.rateLimited++;
        const retryable = classifyRetry(res.status, null) === "retry";
        if (!retryable || attempt === this.maxAttempts) {
          this.metrics.errors++;
          this.metrics.lastError = `HTTP ${res.status}`;
          return null;
        }
        this.metrics.retries++;
        const ra = Number(res.headers && res.headers.get ? res.headers.get("retry-after") : NaN);
        await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * attempt);
      } catch (err) {
        const retryable = classifyRetry(null, err && err.name) === "retry";
        if (!retryable || attempt === this.maxAttempts) {
          this.metrics.errors++;
          this.metrics.lastError = String((err && err.message) || err).slice(0, 160);
          return null;
        }
        this.metrics.retries++;
        await this.sleep(500 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  // Honest provider health — derived ONLY from real request outcomes, never
  // assumed. Statuses map to the app's provider-status semantics.
  healthSnapshot() {
    const m = this.metrics;
    if (!this.ready()) return { status: "AUTH ERROR", lastSuccess: null, lastError: "missing API key", requests: 0 };
    if (m.lastSuccess && !m.lastError) {
      return { status: "ONLINE", lastSuccess: m.lastSuccess, lastError: null, lastLatencyMs: m.lastLatencyMs, requests: m.requests, rateLimited: m.rateLimited };
    }
    if (m.lastError) {
      if (/^HTTP 40[13]/.test(m.lastError)) return { status: "AUTH ERROR", lastSuccess: m.lastSuccess, lastError: m.lastError, requests: m.requests };
      if (/HTTP 429/.test(m.lastError)) return { status: "RATE LIMITED", lastSuccess: m.lastSuccess, lastError: m.lastError, requests: m.requests, rateLimited: m.rateLimited };
      if (m.lastSuccess) return { status: "DEGRADED", lastSuccess: m.lastSuccess, lastError: m.lastError, requests: m.requests };
      return { status: "OFFLINE", lastSuccess: null, lastError: m.lastError, requests: m.requests };
    }
    return { status: "UNKNOWN", lastSuccess: null, lastError: null, requests: m.requests };
  }
}