// API-FOOTBALL TRANSPORT ENVELOPE (pure) — SDK-free, directly unit-testable.
//
// REGRESSION LOCK: the api-football proxy's response reaches the client
// through up to three nested layers, and a missed layer silently turns every
// fetch into "unavailable":
//   1. the SDK returns an axios-style wrapper {status, headers, data}
//   2. the function's JSON body is {cached, data}
//   3. chunked-cache rehydration may wrap the payload as {__cache, chunks, data}
// This module unwraps all three. Tests in src/__tests__/apiFootballPayload.test.js
// pin every shape — normal, cached, empty, error, malformed — so the wrapper
// bug that produced false "unavailable" statuses can never return silently.

export function unwrapApiFootballEnvelope(res) {
  const body = res?.data ?? res ?? null; // axios-style wrapper → JSON body
  const error = body?.error || res?.error || null;
  let payload = body?.data ?? body ?? null; // body → payload (fresh response)
  if (payload && typeof payload === "object" && payload.__cache) payload = payload.data ?? null; // chunked cache → rehydrated payload
  return {
    payload: error ? null : payload,
    error: error ? String(error) : null,
    cached: !!body?.cached,
  };
}