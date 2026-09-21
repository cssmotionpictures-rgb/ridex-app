import { fetchRss } from "@/lib/rssParser";

// Zero-credit natural-disaster detection — runs entirely in the browser.
// Backend disaster-alerts function is blocked while workspace integration
// credits are exhausted. USGS GeoJSON feeds send permissive CORS headers so
// they're fetched directly; GDACS RSS is fetched via a free CORS proxy.

function detectType(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("earthquake") || t.includes("quake")) return "earthquake";
  if (t.includes("cyclone") || t.includes("typhoon") || t.includes("hurricane")) return "cyclone";
  if (t.includes("flood")) return "flood";
  if (t.includes("volcano") || t.includes("eruption")) return "volcano";
  if (t.includes("drought")) return "drought";
  if (t.includes("landslide") || t.includes("mudslide")) return "landslide";
  if (t.includes("wildfire") || t.includes("forest fire")) return "wildfire";
  return "alert";
}

function severityFromGdacs(desc) {
  const d = (desc || "").toLowerCase();
  if (/red alert|"red"|alertlevel.*red/.test(d)) return "red";
  if (/orange alert|"orange"|alertlevel.*orange/.test(d)) return "orange";
  if (/green alert|"green"|alertlevel.*green/.test(d)) return "green";
  return "orange";
}

export async function getDisasters() {
  const all = [];

  // 1. USGS M4.5+ earthquakes past day (GeoJSON, CORS-enabled, no key)
  try {
    const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");
    if (r.ok) {
      const gj = await r.json();
      const feats = gj?.features || [];
      for (const f of feats) {
        const p = f.properties || {};
        all.push({
          title: `M${(p.mag ?? 0).toFixed(1)} Earthquake — ${p.place || "unknown"}`,
          link: p.url || "https://earthquake.usgs.gov",
          pubDate: p.time ? new Date(p.time).toUTCString() : "",
          description: p.tsunami ? "Tsunami warning issued" : `Depth ${(f.geometry?.coordinates?.[2] ?? 0).toFixed(0)} km`,
          type: "earthquake",
          severity: p.tsunami ? "red" : p.mag >= 6 ? "red" : p.mag >= 5 ? "orange" : "green",
          source: "USGS",
        });
      }
    }
  } catch (e) { /* USGS unavailable — GDACS still carries events */ }

  // 2. GDACS global disaster alerts (RSS via CORS proxy, no key)
  try {
    const items = await fetchRss("https://www.gdacs.org/xml/rss.xml", "GDACS");
    for (const it of items) {
      all.push({
        title: it.title,
        link: it.link,
        pubDate: it.pubDate,
        description: (it.description || "").slice(0, 200),
        type: detectType(it.title + " " + it.description),
        severity: severityFromGdacs(it.description),
        source: "GDACS",
      });
    }
  } catch (e) { /* GDACS unavailable */ }

  // dedupe by title, sort newest first
  const seen = new Set();
  const dedup = [];
  for (const it of all) {
    const key = it.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push({ ...it, ts: it.pubDate ? Date.parse(it.pubDate) : 0 });
  }
  dedup.sort((a, b) => b.ts - a.ts);
  const items = dedup.slice(0, 25);

  return { items, fetchedAt: Date.now() };
}