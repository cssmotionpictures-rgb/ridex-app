import { parseRss } from "../../shared/rssParser.ts";

// Zero-credit breaking-news radar — aggregates multiple free RSS feeds
// (no key, no daily limit) and returns the latest headlines across all of
// them, sorted newest-first. The frontend polls this and fires a browser
// notification whenever a headline it hasn't seen appears = "always ping".
const FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/rss.xml", name: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", name: "BBC Africa" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", name: "BBC Sport Football" },
  { url: "https://www.skysports.com/rss/12040", name: "Sky Sports Football" },
];

export default async function(req) {
  try {
    const all = [];
    await Promise.all(FEEDS.map(async (f) => {
      try {
        const r = await fetch(f.url, {
          headers: { "User-Agent": "RideXBot/1.0 (+https://ridex.app)", "Accept": "application/rss+xml,application/xml,text/xml" },
        });
        if (!r.ok) return;
        const xml = await r.text();
        const items = parseRss(xml, f.name);
        for (const it of items) all.push(it);
      } catch (e) { console.error(`feed ${f.name} failed:`, e?.message || e); }
    }));

    // dedupe by title
    const seen = new Set();
    const dedup = [];
    for (const it of all) {
      const key = it.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(it);
    }

    // parse dates, sort newest first
    const withTs = dedup
      .map((it) => ({ ...it, ts: it.pubDate ? Date.parse(it.pubDate) : 0 }))
      .sort((a, b) => b.ts - a.ts);

    const now = Date.now();
    const items = withTs.slice(0, 25).map((it) => ({
      ...it,
      breaking: /breaking|urgent|just in/i.test(it.title) || (it.ts > 0 && now - it.ts < 1000 * 60 * 60), // < 1h old
    }));

    return Response.json({ items, fetchedAt: now, feeds: FEEDS.length });
  } catch (error) {
    console.error("news-alerts error:", error?.message || error);
    return Response.json({ error: error?.message || "unknown error", items: [] }, { status: 500 });
  }
}