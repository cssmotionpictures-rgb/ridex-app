// Shared RSS parser used by the zero-credit news proxy functions.
// Returns parsed items with a source tag so feeds can be merged/deduped.

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