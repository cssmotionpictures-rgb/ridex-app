// PROVIDER HEALTH ENGINE — lightweight registry for every outbound provider
// call the enrichment layer makes. Tracks outcome classes, latency and the
// last success/failure so the audit panel can show the REAL provider state
// instead of a guess. A dead key is classified AUTH_ERROR and surfaced —
// never silently retried in a loop.
const registry = new Map();

// Failure classification — the audit panel groups by these classes.
export function classifyFailure(error) {
  const s = String(error || "").toLowerCase();
  if (!s) return "UNKNOWN";
  if (/missing application key|invalid key|unauthorized|forbidden|token|401|403|not subscribed/.test(s)) return "AUTH_ERROR";
  if (/rate limit|too many requests|429/.test(s)) return "RATE_LIMIT";
  if (/timeout|aborted|timed out/.test(s)) return "TIMEOUT";
  if (/plan|restricted|subscription/.test(s)) return "PLAN_RESTRICTION";
  if (/502|503|504|bad gateway|service unavailable|server error/.test(s)) return "SERVER_ERROR";
  return "PROVIDER_UNAVAILABLE";
}

export function trackCall(provider, { ok = false, error = "", ms = 0, cached = false, endpoint = "", results = null } = {}) {
  let h = registry.get(provider);
  if (!h) {
    h = {
      provider, calls: 0, okCalls: 0, failCalls: 0, cachedCalls: 0, avgMs: 0,
      classes: {}, lastOkAt: null, lastFailAt: null, lastError: "", endpoints: {},
    };
    registry.set(provider, h);
  }
  h.calls++;
  h.avgMs = Math.round((h.avgMs * (h.calls - 1) + (Number(ms) || 0)) / h.calls);
  if (ok) {
    h.okCalls++;
    h.lastOkAt = new Date().toISOString();
  } else {
    h.failCalls++;
    h.lastFailAt = new Date().toISOString();
    h.lastError = String(error).slice(0, 160);
    const cls = classifyFailure(error);
    h.classes[cls] = (h.classes[cls] || 0) + 1;
  }
  if (cached) h.cachedCalls++;
  if (endpoint) {
    if (!h.endpoints[endpoint]) h.endpoints[endpoint] = { calls: 0, ok: 0, lastResults: null };
    h.endpoints[endpoint].calls++;
    if (ok) h.endpoints[endpoint].ok++;
    if (results != null) h.endpoints[endpoint].lastResults = results;
  }
}

export function getProviderHealth() {
  return [...registry.values()].map(({ endpoints, ...rest }) => ({
    ...rest,
    endpoints: Object.entries(endpoints).map(([k, v]) => ({ endpoint: k, ...v })),
  }));
}