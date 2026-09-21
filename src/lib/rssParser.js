// Client-side RSS fetcher + parser — the zero-credit back door.
// Backend news/disaster functions are blocked while workspace integration
// credits are exhausted, so we fetch the same free public RSS feeds straight
// from the browser. Most RSS endpoints send no CORS headers, so requests are
// routed through free public CORS proxies (no key, no daily limit).

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&pound;/g, "£")
    .trim();
}

export function parseRss(xml, sourceName) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 40) {
    const block = m[1];
    const pick = (pat) => {
      const mm = block.match(pat);
      return mm ? decodeEntities(mm[1]) : "";
    };
    const title =
      pick(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      pick(/<title>([\s\S]*?)<\/title>/);
    const link =
      pick(/<link>([\s\S]*?)<\/link>/) ||
      pick(/<link[^>]*>([\s\S]*?)<\/link>/);
    const pub = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    let desc =
      pick(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
      pick(/<description>([\s\S]*?)<\/description>/);
    desc = desc.replace(/<[^>]+>/g, "").trim().slice(0, 220);
    const thumb =
      pick(/<media:thumbnail[^>]*url="([^"]+)"/) ||
      pick(/<media:content[^>]*url="([^"]+\.jpg[^"]*)"/) ||
      pick(/<enclosure[^>]*url="([^"]+)"/);
    if (title && link) {
      items.push({ title, link, pubDate: pub, description: desc, thumbnail: thumb, source: sourceName });
    }
  }
  return items;
}

// Free public CORS proxies for raw XML — used only as a fallback when the
// JSON proxy is unavailable. No API key, no daily cap.
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
];

// Fetch a remote URL's text body through a CORS proxy, trying each proxy in
// turn until one returns a non-empty body. Throws if all proxies fail.
export async function fetchViaProxy(url, { timeoutMs = 12000 } = {}) {
  let lastErr;
  for (const make of PROXIES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(make(url), { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) { lastErr = new Error(`proxy HTTP ${r.status}`); continue; }
      const text = await r.text();
      if (text && text.length > 50) return text;
      lastErr = new Error("empty proxy body");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all proxies failed");
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "").trim();
}

// Fetch + parse an RSS feed. Primary path: rss2json (a purpose-built
// RSS→JSON service with permissive CORS, no key). Fallback: raw XML via a
// free CORS proxy parsed locally. Returns [] on failure (one bad feed should
// never blank the whole radar).
export async function fetchRss(url, sourceName) {
  // 1. rss2json (JSON, CORS-friendly)
  try {
    const r = await Promise.race([
      fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`),
      new Promise((_, rej) => setTimeout(() => rej(new Error("rss2json timeout")), 11000)),
    ]);
    if (r.ok) {
      const j = await r.json();
      if (j?.status === "ok" && Array.isArray(j.items)) {
        return j.items.slice(0, 40).map((it) => ({
          title: stripHtml(it.title || "") || "",
          link: it.link || "",
          pubDate: it.pubDate || "",
          description: stripHtml(it.description || "").slice(0, 220),
          thumbnail: it.thumbnail || it.enclosure?.link || "",
          source: sourceName,
        })).filter((it) => it.title && it.link);
      }
    }
  } catch (e) { /* fall through to raw-XML proxy */ }

  // 2. raw XML via proxy
  try {
    const xml = await fetchViaProxy(url);
    return parseRss(xml, sourceName);
  } catch (e) { return []; }
}