// Opportunity Radar — client-side job & opportunity detector for Nigerians.
// Works fully offline from Base44's perspective: it fetches free public RSS
// feeds via the rss2json proxy (direct browser fetch, NOT a backend function,
// so it costs 0 integration credits). It scores each opportunity for how
// Nigeria-friendly it is (remote, worldwide, Africa, diaspora, music, etc.),
// sounds a Web Audio alarm when fresh matches appear, and auto-generates a
// tailored application email draft the user can copy or send via mailto.
//
// NOTE on "auto-submit to their direct email": server-side auto-send uses the
// SendEmail integration, which is blocked while workspace credits are
// exhausted. The engine still COMPOSES the full application automatically and
// opens a ready mailto link (or copies the draft) so submission is one tap.

const FEEDS = [
  { id: "wwr", name: "We Work Remotely", url: "https://weworkremotely.com/remote-jobs.rss", category: "Remote" },
  { id: "remoteok", name: "Remote OK", url: "https://remoteok.io/remote-jobs.rss", category: "Remote" },
  { id: "remotive", name: "Remotive", url: "https://remotive.com/remote-jobs.rss", category: "Remote" },
  { id: "remoteco", name: "Remote.co", url: "https://remote.co/remote-jobs/feed/", category: "Remote" },
  { id: "scholar", name: "Scholarship Positions", url: "https://scholarship-positions.com/feed/", category: "Scholarship" },
  { id: "relod", name: "Relocate.me", url: "https://relocate.me/feed.rss", category: "Relocation" },
];

const NIGERIA_KEYS = [
  "remote", "worldwide", "anywhere", "global", "international", "english",
  "africa", "nigeria", "nigerian", "diaspora", "relocation", "relocate",
  "visa", "sponsorship", "developing", "global south", "asynchronous",
  "scholarship", "fellowship", "grant", "stipend", "unpaid", "volunteer",
];
const MUSIC_KEYS = [
  "music", "audio", "studio", "label", "producer", "spotify", "apple music",
  "artist", "publishing", "distribution", "song", "a&r", "touring", "booking",
  "sync", "licensing", "sound", "mixing", "mastering",
];

export function scoreItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 0;
  for (const k of NIGERIA_KEYS) if (text.includes(k)) score += 2;
  if (item.category === "Remote") score += 3; // remote = no relocation barrier
  if (item.category === "Scholarship") score += 4;
  if (item.category === "Relocation") score += 2;
  if (MUSIC_KEYS.some((k) => text.includes(k))) { score += 5; item.music = true; }
  // recency boost
  const ageDays = (Date.now() - new Date(item.pubDate || 0).getTime()) / 86400000;
  if (ageDays < 2) score += 3; else if (ageDays < 7) score += 2; else if (ageDays < 30) score += 1;
  return Math.max(0, score);
}

export async function fetchFeed(feed) {
  try {
    const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
    const res = await fetch(api);
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.items)) return [];
    return data.items.slice(0, 40).map((it) => ({
      title: (it.title || "").trim(),
      link: it.link || "",
      pubDate: it.pubDate || "",
      description: (it.content || it.description || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 500),
      author: it.author || "",
      source: feed.name,
      category: feed.category,
    })).filter((it) => it.title);
  } catch {
    return [];
  }
}

export async function scanAll() {
  const settled = await Promise.all(FEEDS.map((f) => fetchFeed(f)));
  let all = [];
  let feedsOk = 0;
  settled.forEach((items, i) => { if (items.length) feedsOk++; all = all.concat(items); });
  all.forEach((it) => { it._score = scoreItem(it); });
  all.sort((a, b) => b._score - a._score || (new Date(b.pubDate || 0) - new Date(a.pubDate || 0)));
  return { items: all.slice(0, 120), total: all.length, feedsOk, feedsTotal: FEEDS.length };
}

export function extractEmail(item) {
  const m = `${item.description} ${item.link} ${item.author || ""}`.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (m) return m[0];
  // application email often embedded as mailto: in description text
  const m2 = (item.description || "").match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return m2 ? m2[1] : "";
}

export function buildApplicationDraft(item, user) {
  const name = user?.full_name || user?.name || "[Your Name]";
  const email = user?.email || "[Your Email]";
  const phone = user?.phone || "[Your Phone]";
  const role = item.title || "the role";
  const company = item.source || "your organization";
  const subject = `Application for ${role} — ${name}`;
  const body = [
    `Dear Hiring Team at ${company},`,
    ``,
    `I am writing to apply for ${role}, which I found through the Ride X Opportunity Radar and believe I am a strong fit for.`,
    ``,
    `As a Nigerian professional, I bring a strong work ethic, adaptability, and a global perspective. I am comfortable working remotely across time zones and am eager to contribute real value to ${company}.`,
    ``,
    `My core strengths include fast learning, clear communication, and consistent delivery. I would welcome the chance to discuss how I can help your team achieve its goals.`,
    ``,
    `Thank you for considering my application. I have attached my CV and look forward to your response.`,
    ``,
    `Warm regards,`,
    `${name}`,
    `${email} · ${phone}`,
  ].join("\n");
  return { subject, body, to: extractEmail(item) };
}

export function mailtoLink(draft) {
  const to = draft.to || "";
  return `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

let alarmCtx = null;
export function playAlarm() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!alarmCtx || alarmCtx.state === "closed") alarmCtx = new Ctx();
    const ctx = alarmCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [0, 0.22, 0.44, 0.66].forEach((d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(d % 0.44 === 0 ? 1046 : 880, now + d);
      g.gain.setValueAtTime(0, now + d);
      g.gain.linearRampToValueAtTime(0.25, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.16);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + d); o.stop(now + d + 0.18);
    });
  } catch (e) {}
}