// STREAM AUTO-TUNE ENGINE — when a user picks a match, this engine scans
// every merged sports-station source, detects which stations actually
// respond, ranks them by broadcast relevance to THAT match (league
// broadcaster → team channel → country → generic sports), and returns a
// working station to auto-play. Dead stations found along the way are
// remembered so future scans get faster.

const PLAYLIST_URLS = [
  "https://iptv-org.github.io/iptv/categories/sports.m3u", // dedicated sports channels
  "https://romaxa55.github.io/world_ip_tv/output/index.m3u", // purged every 6h
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8", // free HD TV worldwide
  "https://iptv-org.github.io/iptv/index.m3u", // master list (filtered to sports)
];

const DEAD_KEY = "ridex_autotune_dead";
const CACHE_TTL = 30 * 60 * 1000;

const SPORTS_RE = /sport|football|soccer|premier|liga|bundes|serie|ligue|ucl|uefa|afcon|copa|espn|bein|sky|tnt|fox|supersport|dazn|canal|gol|arena|match|live|channel|tv/i;

// IPTV channels are named by BROADCASTER, not by team — so a match is mapped
// to the broadcasters that carry its league, then to team channels, then
// country broadcasters.
const LEAGUE_BROADCASTERS = {
  "premier league": ["premier", "sky sports", "bt sport", "tnt sports", "match"],
  "english premier league": ["premier", "sky sports", "bt sport", "tnt sports"],
  "champions league": ["champions", "uefa", "bt sport", "tnt sports", "canal"],
  "uefa champions league": ["champions", "uefa", "bt sport", "tnt sports", "canal"],
  "europa league": ["europa", "uefa", "bt sport"],
  "la liga": ["la liga", "gol", "movistar", "espn", "liga"],
  "spanish la liga": ["la liga", "gol", "movistar", "espn", "liga"],
  "bundesliga": ["bundesliga", "sky sport", "dazn", "bundes"],
  "german bundesliga": ["bundesliga", "sky sport", "dazn", "bundes"],
  "serie a": ["serie a", "sky sport", "dazn", "italia"],
  "italian serie a": ["serie a", "sky sport", "dazn", "italia"],
  "ligue 1": ["ligue 1", "canal", "prime", "france"],
  "french ligue 1": ["ligue 1", "canal", "prime", "france"],
  "eredivisie": ["eredivisie", "ziggo", "espn"],
  "primeira liga": ["liga", "sport tv", "espn"],
  "world cup": ["fifa", "world cup", "fox", "telemundo", "bbc", "itv"],
  "fifa world cup": ["fifa", "world cup", "fox", "telemundo", "bbc", "itv"],
  "afcon": ["afcon", "africa", "supersport", "canal"],
  "africa cup of nations": ["afcon", "africa", "supersport", "canal"],
  "copa america": ["copa", "america", "espn", "directv"],
  "nations league": ["nations", "uefa"],
  "saudi pro league": ["saudi", "ssc", "dazn"],
  "mls": ["mls", "apple", "espn"],
  "argentine primera division": ["espn", "tyc", "tnt", "fox", "directv", "dsports"],
  "brazilian serie a": ["globo", "sbt", "espn", "premiere"],
  "liga mx": ["liga", "azteca", "televisa", "espn"],
  "mexican primera division": ["liga", "azteca", "televisa", "espn"],
};

const COUNTRY_BROADCASTERS = {
  "argentina": ["espn", "tyc", "tnt", "fox", "directv", "dsports"],
  "brazil": ["globo", "sbt", "espn", "premiere"],
  "spain": ["movistar", "gol", "espn"],
  "england": ["sky sports", "bt sport", "tnt sports", "itv", "bbc"],
  "italy": ["sky sport", "dazn", "rai"],
  "germany": ["sky sport", "dazn", "bundesliga"],
  "france": ["canal", "prime", "france"],
  "nigeria": ["supersport", "dazn", "espn"],
  "usa": ["fox", "espn", "cbs", "nbc", "telemundo"],
};

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function parseM3U(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let current = null;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,([^,]+)$/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      current = {
        name: nameMatch ? nameMatch[1].trim() : "Unknown",
        group: groupMatch ? groupMatch[1].trim() : "",
        logo: logoMatch ? logoMatch[1] : "",
        url: null,
      };
    } else if (line.startsWith("http") && current) {
      current.url = line;
      out.push(current);
      current = null;
    }
  }
  return out;
}

// Persisted dead-station memory — stations that failed a real probe or a
// real playback attempt are skipped next time (restorable by clearing).
export function getDeadStations() {
  try { return JSON.parse(localStorage.getItem(DEAD_KEY) || "[]"); } catch { return []; }
}

export function markDeadStation(url) {
  if (!url) return;
  try {
    const list = getDeadStations();
    if (list.includes(url)) return;
    const next = [...list, url].slice(-500);
    localStorage.setItem(DEAD_KEY, JSON.stringify(next));
  } catch {}
}

// One merged sports-station list from all sources, de-duplicated, cached
// briefly so repeated watch-clicks are instant.
let cached = null;
let cachedTs = 0;
export async function loadSportsStations() {
  if (cached && Date.now() - cachedTs < CACHE_TTL) return cached;
  const dead = new Set(getDeadStations());
  const lists = await Promise.all(
    PLAYLIST_URLS.map((u) => fetch(u).then((r) => r.text()).then(parseM3U).catch(() => []))
  );
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const c of list) {
      if (!c.url || seen.has(c.url) || dead.has(c.url)) continue;
      if (!SPORTS_RE.test(`${c.name} ${c.group || ""}`)) continue;
      seen.add(c.url);
      merged.push(c);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));
  cached = merged.slice(0, 600);
  cachedTs = Date.now();
  return cached;
}

function leagueKeywords(league) {
  const l = norm(league);
  if (!l) return [];
  if (LEAGUE_BROADCASTERS[l]) return LEAGUE_BROADCASTERS[l];
  for (const [k, v] of Object.entries(LEAGUE_BROADCASTERS)) {
    if (l.includes(k)) return v;
  }
  return [];
}

// Relevance scoring — how likely is this station broadcasting THIS match.
// Returns { score, matched } so the UI can show WHY it was picked.
export function scoreStationForMatch(channel, match) {
  const hay = `${channel.name} ${channel.group || ""}`.toLowerCase();
  let score = 0;
  let matched = "";
  for (const k of leagueKeywords(match.league)) {
    if (hay.includes(k)) { score += 12; matched = match.league; break; }
  }
  if (!matched) {
    for (const t of [match.home, match.away]) {
      const n = norm(t);
      if (n && n.length > 4 && hay.includes(n)) { score += 8; matched = t; break; }
    }
  }
  if (!matched && match.country) {
    const cks = COUNTRY_BROADCASTERS[norm(match.country)] || [];
    for (const k of cks) {
      if (hay.includes(k)) { score += 5; matched = match.country; break; }
    }
  }
  if (/(football|soccer)/.test(hay)) score += 3;
  else if (/sport/.test(hay)) score += 2;
  return { score, matched };
}

// Station probe — working = the browser can actually play it (CORS-visible
// HTTP 2xx); reachable = server responds but may be blocked for in-browser
// playback; blocked = explicitly refuses; dead = no response at all.
export async function probeStation(url, timeoutMs = 4000) {
  const c1 = new AbortController();
  const t1 = setTimeout(() => c1.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: c1.signal });
    clearTimeout(t1);
    if (res.ok) return "working";
    if ([401, 403, 451].includes(res.status)) return "blocked";
    return "dead";
  } catch {
    clearTimeout(t1);
  }
  try {
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), timeoutMs);
    await fetch(url, { mode: "no-cors", signal: c2.signal });
    clearTimeout(t2);
    return "reachable";
  } catch {
    return "dead";
  }
}

// THE AUTO-TUNE — loads all stations, scores them for this match, probes the
// top candidates in bounded batches, and returns a ranked list with the
// first WORKING station first. Bounded: only the most relevant candidates
// are probed, with per-request timeouts.
export async function autoTuneMatch(match, onProgress) {
  const stations = await loadSportsStations();
  const scored = stations
    .map((c) => {
      const { score, matched } = scoreStationForMatch(c, match);
      return { ...c, score, matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const targets = scored.slice(0, 10);
  const checked = [];
  let done = 0;
  for (let i = 0; i < targets.length; i += 5) {
    const slice = targets.slice(i, i + 5);
    const batch = await Promise.all(slice.map(async (c) => ({ ...c, status: await probeStation(c.url) })));
    checked.push(...batch);
    done += batch.length;
    if (onProgress) onProgress({ done, total: targets.length, checked: [...checked] });
    // early exit — the first WORKING station is enough to start watching
    if (batch.some((c) => c.status === "working")) break;
  }
  const rank = { working: 0, reachable: 1, blocked: 2, dead: 3 };
  checked.sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score);
  for (const c of checked) if (c.status === "dead") markDeadStation(c.url);
  return {
    match,
    candidates: checked.filter((c) => c.status !== "dead"),
    deadCount: checked.filter((c) => c.status === "dead").length,
    poolSize: stations.length,
    relevantCount: scored.length,
    checkedCount: checked.length,
  };
}