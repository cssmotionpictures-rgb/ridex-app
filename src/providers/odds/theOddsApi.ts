import { invokeFunction } from "@/lib/resilient";
import { PROVIDER_MARKETS } from "@/lib/oddsMath";

// THE ODDS API provider adapter (client side). All requests go through the
// bookmaker-odds backend function — the API key never touches the frontend.
// Every price returned by this adapter was quoted by a real bookmaker; the
// provider does not price team totals or corners, and the adapter never
// manufactures those prices.
//
// Bounded but patient: the backend pulls up to 12 provider competitions
// SEQUENTIALLY (a parallel burst trips the provider's request throttle and
// every league falsely reports "all keys exhausted"), so a cold aggregate
// legitimately runs longer than the generic slow-provider ceiling. The call
// always runs behind the slips' own visible DEALING state — it can never
// silently hang the accumulator or a leg popup.

export const ODDS_PROVIDER_NAME = "The Odds API";
export { PROVIDER_MARKETS };

let lastRawResponse = null;

// Dev-mode aid: the raw provider payload of the last fetch, for inspection.
export function getLastRawResponse() {
  return lastRawResponse;
}

export async function fetchRealBookmakerOdds(sportKeys, opts = {}) {
  const res = await invokeFunction(
    "bookmaker-odds",
    {
      sportKeys: sportKeys || [],
      ttlMinutes: opts.ttlMinutes ?? 30,
      force: opts.force === true,
    },
    { timeoutMs: 45000 }
  );
  const data = res?.data ?? res;
  lastRawResponse = data ?? null;
  return data;
}