// MONSTER ROLLOVER LEDGER — settlement for the legacy MONSTER 6-day no-draw
// rollover legs (BankuPickResult rows with slip="monster"). Every past-day
// open leg grades against the REAL final score from the same verified feeds
// the engine scans — tennis match winners and league results via the
// ESPN proxy (basketball, NFL, MLB, NHL), TheSportsDB's soccer day feed for
// football legs — never self-reported, never guessed. A leg with no result
// within 7 days voids toward nothing, and a leg is never marked won from the
// prediction itself.

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { espnLeagueFeed, espnTennisScan } from "@/lib/espnSports";
import { settleKey } from "@/lib/bankuLedger";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);

// Verified league feeds per points sport — the same espn paths the pool
// scanners use, so settlement grades from the identical source the deal did.
const SPORT_FEEDS = {
  "Basketball": { espn: "basketball/nba", label: "NBA", past: 14 },
  "American football": { espn: "football/nfl", label: "NFL", past: 16 },
  "Baseball": { espn: "baseball/mlb", label: "MLB", past: 14 },
  "Ice hockey": { espn: "hockey/nhl", label: "NHL", past: 16 },
};

// League results (points sports) → normalized final-score index.
async function leagueIndex(cfg) {
  const { results } = await espnLeagueFeed(cfg.espn, cfg.label, cfg.past, 0);
  const idx = new Map();
  (results || []).forEach((e) => {
    if (e.intHomeScore == null || e.intAwayScore == null) return;
    idx.set(`${norm(e.strHomeTeam)}|${norm(e.strAwayTeam)}`, [Number(e.intHomeScore), Number(e.intAwayScore)]);
  });
  return idx;
}

// Completed tennis matches → settlement index keyed by normalized names.
async function tennisIndex(dates) {
  const { matches } = await espnTennisScan(dates);
  const idx = new Map();
  (matches || []).forEach((m) => {
    if (m?.state !== "post" || !m?.home?.name || !m?.away?.name) return;
    idx.set(`${norm(m.home.name)}|${norm(m.away.name)}`, m);
  });
  return idx;
}

// Settle every past-day open rollover leg against the real final scores.
// Unmatched legs simply stay open (never guessed) and age to void after 7 days.
export async function settleMonsterPicks() {
  const today = todayISO();
  const open = await readWithRetry(
    () => base44.entities.BankuPickResult.filter({ status: "open", slip: "monster" }, "-date_key", 200),
    { fallback: [] }
  );
  const pending = (open || []).filter((r) => r.date_key && r.date_key < today);
  if (!pending.length) return { settled: 0 };

  const bySport = {};
  pending.forEach((r) => {
    const s = r.sport || "Football"; // legacy rows recorded before the sport field
    (bySport[s] ||= []).push(r);
  });

  const updates = [];
  const settledIds = new Set();

  const grade = (r, home, away, source) => {
    const won = settleKey(r.market_key, home, away);
    if (won == null) return; // market can't be resolved — never guessed
    settledIds.add(r.id);
    updates.push({
      id: r.id,
      status: won ? "win" : "loss",
      actual_home: home,
      actual_away: away,
      result_source: source,
      settled_at: new Date().toISOString(),
    });
  };

  for (const [sport, rows] of Object.entries(bySport)) {
    const cfg = SPORT_FEEDS[sport];
    if (cfg) {
      try {
        const idx = await leagueIndex(cfg);
        rows.forEach((r) => {
          const hit = idx.get(`${norm(r.home)}|${norm(r.away)}`);
          if (hit) grade(r, hit[0], hit[1], `ESPN verified feed (espn-proxy · ${cfg.label})`);
        });
      } catch { /* feed unavailable — the legs stay open, never guessed */ }
      continue;
    }
    if (sport === "Tennis") {
      try {
        const dates = [...new Set(rows.map((r) => r.date_key))].slice(0, 14);
        const idx = await tennisIndex(dates);
        rows.forEach((r) => {
          const m = idx.get(`${norm(r.home)}|${norm(r.away)}`);
          if (!m) return;
          const k = String(r.market_key || "").trim().toUpperCase();
          let h = m.home.setsWon;
          let a = m.away.setsWon;
          // No per-set linescores: the match-winner market can still grade
          // from the winner flags alone — a 1-0 that decides only 1/2.
          if ((h == null || a == null) && (k === "1" || k === "2")) {
            if (m.home.winner) { h = 1; a = 0; }
            else if (m.away.winner) { h = 0; a = 1; }
            else return;
          }
          if (h == null || a == null) return;
          grade(r, h, a, "ESPN verified feed (espn-proxy · Tennis)");
        });
      } catch { /* feed unavailable — the legs stay open, never guessed */ }
      continue;
    }
    // Football / legacy rows — TheSportsDB's verified soccer day feed (the
    // same source the football slips settle from). Unmatched names stay open.
    try {
      const byDate = {};
      rows.forEach((r) => (byDate[r.date_key] ||= []).push(r));
      for (const [day, group] of Object.entries(byDate).slice(0, 7)) {
        const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${day}&s=Soccer`);
        if (!res.ok) continue;
        const j = await res.json();
        const idx = new Map();
        for (const ev of (j && j.events) || []) {
          if (ev.intHomeScore == null || ev.intAwayScore == null) continue;
          idx.set(`${norm(ev.strHomeTeam)}|${norm(ev.strAwayTeam)}`, [Number(ev.intHomeScore), Number(ev.intAwayScore)]);
        }
        group.forEach((r) => {
          const hit = idx.get(`${norm(r.home)}|${norm(r.away)}`);
          if (hit) grade(r, hit[0], hit[1], "TheSportsDB verified result");
        });
      }
    } catch { /* feed unavailable — the legs stay open, never guessed */ }
  }

  // Aging — a leg older than 7 days whose result never appeared is voided:
  // it counts toward neither wins nor losses.
  const stale = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const r of pending) {
    if (r.date_key < stale && !settledIds.has(r.id)) {
      updates.push({ id: r.id, status: "void", settled_at: new Date().toISOString() });
    }
  }

  if (updates.length) await base44.entities.BankuPickResult.bulkUpdate(updates).catch(() => null);
  return { settled: updates.length };
}