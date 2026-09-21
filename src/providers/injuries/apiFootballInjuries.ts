import { invokeFunction } from "@/lib/resilient";

// INJURIES / LINEUPS provider (client side) — API-Football via the
// football-context backend function. Injuries are only ever
// provider-confirmed records (player, team, status, reason, source,
// provider, timestamp); lineups are separated into PROBABLE and CONFIRMED.
// When the feed has nothing, it says UNAVAILABLE — it never infers.
//
// Bounded: a slow context fetch can never block a leg popup, and the status
// probe can never block the provider panel.

export async function fetchFixtureContext({ date, home, away, league }) {
  const res = await invokeFunction(
    "football-context",
    {
      action: "fixture",
      date,
      home,
      away,
      league,
    },
    { timeoutMs: 15000 }
  );
  return res?.data ?? res;
}

export async function fetchProviderStatus() {
  const res = await invokeFunction("football-context", { action: "status" }, { timeoutMs: 12000 });
  return res?.data ?? res;
}