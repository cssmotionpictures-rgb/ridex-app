import React from "react";
import { fetchRss } from "@/lib/rssParser";

// Zero-credit breaking-news radar — runs entirely in the browser.
// Backend news-alerts function is blocked while workspace integration
// credits are exhausted, so we aggregate the same free RSS feeds (BBC,
// Al Jazeera, Sky) directly via a CORS proxy and return the latest headlines.
const FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/rss.xml", name: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", name: "BBC Africa" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", name: "BBC Sport Football" },
  { url: "https://www.skysports.com/rss/12040", name: "Sky Sports Football" },
];

export async function getBreakingNews() {
  const all = [];
  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const items = await fetchRss(f.url, f.name);
        for (const it of items) all.push(it);
      } catch (e) { /* one bad feed shouldn't blank the radar */ }
    })
  );

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

  return { items, fetchedAt: now, feeds: FEEDS.length };
}

// Polling hook — polls the news radar every `intervalMs` (default 5 min) and
// fires a browser Notification + calls onNew() whenever a headline arrives
// that hasn't been seen yet. "Always ping when breaking news surfaces."
export function useBreakingNewsPoll({ intervalMs = 5 * 60 * 1000, onNew } = {}) {
  const seenRef = React.useRef(new Set());
  const [items, setItems] = React.useState([]);
  const [lastFetch, setLastFetch] = React.useState(0);

  const notify = React.useCallback((it) => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const n = new Notification(`🚨 ${it.source}: ${it.title}`, {
          body: it.description || "Breaking news",
          icon: it.thumbnail || undefined,
          tag: it.link,
        });
        n.onclick = () => { window.open(it.link, "_blank"); n.close(); };
      }
    } catch (e) { /* notifications may be blocked — silent */ }
  }, []);

  const tick = React.useCallback(async () => {
    try {
      const data = await getBreakingNews();
      const fresh = data?.items || [];
      setItems(fresh);
      setLastFetch(Date.now());
      const seen = seenRef.current;
      let newest = null;
      for (const it of fresh) {
        const key = it.link || it.title;
        if (!seen.has(key)) {
          if (!newest || (it.ts || 0) > (newest.ts || 0)) newest = it;
          seen.add(key);
        }
      }
      // only ping for genuinely new items after the initial load
      if (newest && seen.size > fresh.length) {
        notify(newest);
        onNew?.(newest);
      }
    } catch (e) { /* silent — next tick retries */ }
  }, [notify, onNew]);

  React.useEffect(() => {
    // request notification permission once
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    // seed seen-set with the first load so we don't blast a notification
    // for every existing headline on mount
    (async () => {
      try {
        const data = await getBreakingNews();
        const fresh = data?.items || [];
        setItems(fresh);
        setLastFetch(Date.now());
        for (const it of fresh) seenRef.current.add(it.link || it.title);
      } catch (e) { /* silent */ }
    })();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs]);

  return { items, lastFetch };
}