import { invokeFunction } from "@/lib/resilient";

// ODDS HISTORY (client side) — movement computed server-side from the
// OddsSnapshot rows saved on every provider poll. STEAM/DRIFT labels only
// exist when real snapshot history exists (2+ quotes); a single current
// price is never labelled.
//
// Bounded: a slow odds-history invoke can never block a leg popup.

export async function fetchOddsMovement(eventIds) {
  const res = await invokeFunction(
    "odds-history",
    {
      eventIds: Array.isArray(eventIds) ? eventIds.slice(0, 20) : [],
    },
    { timeoutMs: 12000 }
  );
  const data = res?.data ?? res;
  return Array.isArray(data?.history) ? data.history : [];
}