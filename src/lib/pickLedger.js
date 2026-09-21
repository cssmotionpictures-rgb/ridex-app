// Accuracy ledger for the daily football prediction board.
// Every pick the board publishes is recorded in localStorage; once the match
// finishes, the pick is settled against the REAL final score from the same
// TheSportsDB feed the engine scans for fixtures — win/loss computed from the
// actual goals, never self-reported. This powers the Accuracy view.

const KEY = "ridex-pick-ledger-v1";
const MAX_ROWS = 400;
const MAX_LEAGUES = 12; // max league result feeds fetched per settle pass
const STALE_DAYS = 14; // open picks older than this with no result are voided

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

function read() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function write(rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  } catch {}
}

// Record the board's open picks (upsert by fixtureId — a settled record is
// never overwritten by a later re-scan of the same fixture).
export function recordPicks(picks) {
  const rows = read();
  const seen = new Set(rows.map((r) => r.fixtureId));
  let added = 0;
  for (const p of picks || []) {
    if (!p || !p.fixtureId || !p.date || seen.has(p.fixtureId)) continue;
    rows.push({
      fixtureId: p.fixtureId,
      leagueId: p.leagueId || null,
      date: p.date,
      localTime: p.localTime || "",
      home: p.home,
      away: p.away,
      league: p.league,
      marketLabel: p.marketLabel,
      probability: p.probability || 0,
      predictedHome: p.predictedHome,
      predictedAway: p.predictedAway,
      recordedAt: new Date().toISOString(),
      status: "open",
      actualHome: null,
      actualAway: null,
      settledAt: null,
    });
    seen.add(p.fixtureId);
    added++;
  }
  if (added) write(rows);
  return added;
}

export function getLedger() {
  return read();
}

// Win/loss of a market against the real final score. Returns null when the
// market can't be resolved (unknown label — never guessed).
export function settleMarket(label, h, a) {
  const l = String(label || "").trim().toLowerCase();
  if (l === "1") return h > a;
  if (l === "x") return h === a;
  if (l === "2") return a > h;
  if (l === "1x") return h >= a;
  if (l === "x2") return a >= h;
  if (l === "12") return h !== a;
  if (l.startsWith("over")) {
    const line = parseFloat(l.replace(/[^0-9.]/g, ""));
    return Number.isFinite(line) ? h + a > line : null;
  }
  if (l.startsWith("under")) {
    const line = parseFloat(l.replace(/[^0-9.]/g, ""));
    return Number.isFinite(line) ? h + a < line : null;
  }
  if (l.startsWith("btts")) {
    const btts = h > 0 && a > 0;
    return l.includes("no") ? !btts : btts;
  }
  return null;
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Settle every recorded pick whose match day has passed against the real
// final scores. One request per league (its past-results feed carries the
// actual final scores). Picks older than STALE_DAYS with no result available
// are marked void so they never distort the accuracy stats.
export async function settleLedger() {
  const rows = read();
  const today = new Date().toISOString().slice(0, 10);
  const pending = rows.filter((r) => r.status === "open" && r.date && r.date < today && r.leagueId);

  const byLeague = {};
  for (const r of pending) (byLeague[r.leagueId] = byLeague[r.leagueId] || []).push(r);
  let settled = 0;
  const wins = [];

  for (const [leagueId, group] of Object.entries(byLeague).slice(0, MAX_LEAGUES)) {
    try {
      const res = await fetch(`${BASE}/eventspastleague.php?id=${leagueId}`);
      if (!res.ok) continue;
      const j = await res.json();
      const events = (j && j.events) || [];
      const idx = new Map();
      for (const ev of events) {
        if (ev.intHomeScore == null || ev.intAwayScore == null) continue;
        idx.set(
          `${norm(ev.strHomeTeam)}|${norm(ev.strAwayTeam)}|${ev.dateEvent}`,
          [Number(ev.intHomeScore), Number(ev.intAwayScore)]
        );
      }
      for (const r of group) {
        const hit = idx.get(`${norm(r.home)}|${norm(r.away)}|${r.date}`);
        if (!hit) continue;
        const won = settleMarket(r.marketLabel, hit[0], hit[1]);
        if (won == null) continue;
        r.status = won ? "win" : "loss";
        r.actualHome = hit[0];
        r.actualAway = hit[1];
        r.settledAt = new Date().toISOString();
        settled++;
        if (won) wins.push({ home: r.home, away: r.away, market: r.marketLabel });
      }
    } catch {}
  }

  // Aging: matches too old to still be in the results feed are voided —
  // they count toward neither wins nor losses.
  const stale = new Date();
  stale.setDate(stale.getDate() - STALE_DAYS);
  const staleStr = stale.toISOString().slice(0, 10);
  for (const r of rows) {
    if (r.status === "open" && r.date && r.date < staleStr) r.status = "void";
  }

  if (settled) write(rows);
  return { rows, settled, wins };
}

// Test hook — remove one synthetic record (used by verification only).
export function removeRecord(fixtureId) {
  write(read().filter((r) => r.fixtureId !== fixtureId));
}