// Zero-credit football news proxy — fetches the BBC Sport Football RSS feed
// (public, no key) and returns parsed headlines. No Base44 integration credits,
// no external API key, no daily limit.
export default async function(req) {
  try {
    const feeds = [
      "https://feeds.bbci.co.uk/sport/football/rss.xml",
      "https://www.skysports.com/rss/12040", // Sky Sports Football
    ];
    let items = [];
    let usedSource = "";
    for (const src of feeds) {
      try {
        const r = await fetch(src, { headers: { "User-Agent": "RideXBot/1.0 (+https://ridex.app)", "Accept": "application/rss+xml,application/xml,text/xml" } });
        if (!r.ok) continue;
        const xml = await r.text();
        const parsed = parseRss(xml);
        if (parsed.length) {
          items = parsed;
          usedSource = src.includes("bbc") ? "BBC Sport Football" : "Sky Sports Football";
          break;
        }
      } catch (e) { console.error(`news feed ${src} failed:`, e?.message || e); }
    }
    if (!items.length) {
      return Response.json({ items: [], source: "", error: "no feeds available" }, { status: 200 });
    }
    return Response.json({ items, source: usedSource });
  } catch (error) {
    console.error("football-news error:", error?.message || error);
    return Response.json({ error: error?.message || "unknown error", items: [] }, { status: 500 });
  }
}

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

function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 30) {
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
      items.push({ title, link, pubDate: pub, description: desc, thumbnail: thumb });
    }
  }
  return items;
}