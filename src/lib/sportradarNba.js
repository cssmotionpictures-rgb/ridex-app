// Sportradar NBA (production) — client transport.
// Real NBA fixtures from the sportradar-nba backend function, cached for the
// day so every basketball component shares one request.

import { base44 } from "@/api/base44Client";

let cache = null;
let cacheDay = "";

export async function srNbaFixtures(days = 7, force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && cache && cacheDay === today) return cache;
  try {
    const res = await base44.functions.invoke("sportradar-nba", { days });
    cache = res?.data?.games || [];
  } catch {
    cache = []; // never invented — an outage means no Sportradar fixtures today
  }
  cacheDay = today;
  return cache;
}