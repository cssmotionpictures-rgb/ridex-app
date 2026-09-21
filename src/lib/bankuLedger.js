// BANKu results ledger — stores every daily BANKu drop in the database and
// settles each leg against the REAL final score from the same day feed the
// engine scans. Powers the last-week lookback: the 15 daily games, day by
// day, graded win/loss from actual goals — never self-reported.

import { base44 } from "@/api/base44Client";
import { readWithRetry } from "@/lib/throttledRead";
import { marketKeyOf } from "@/lib/slipDealing";
import { logBetAuditBatch } from "@/lib/betAuditLog";

const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);

// Win/loss of a normalized market key against the real final score.
// Returns null when the market can't be resolved — never guessed.
export function settleKey(key, h, a) {
  const k = String(key || "").trim().toUpperCase();
  if (k === "1") return h > a;
  if (k === "X") return h === a;
  if (k === "2") return a > h;
  if (k === "1X") return h >= a;
  if (k === "X2") return a >= h;
  if (k === "12") return h !== a;
  const ou = /^O([\d.]+)$/.exec(k);
  if (ou) return h + a > Number(ou[1]);
  const uu = /^U([\d.]+)$/.exec(k);
  if (uu) return h + a < Number(uu[1]);
  if (k === "BTTS_Y") return h > 0 && a > 0;
  if (k === "BTTS_N") return !(h > 0 && a > 0);
  return null;
}

// Record the drop (idempotent — the same game is never stored twice, no
// matter how many surfaces compute the deal). Each pick is stored keyed by
// the GAME'S date (today's legs and next-day fill legs alike), so settlement
// always looks up the right day's results. Normalized market key = exact.
// `slip` keeps each drop's ledger its own — "banku" (the morning 15) and
// "kala" (the daily 10 × 2.50) never mix in lookbacks.
export async function recordBankuDay(picks = [], slip = "banku") {
  const day = todayISO();
  const legs = (picks || []).filter((p) => p && p.home && p.away && p.date && p.date >= day);
  if (!legs.length) return 0;
  const dates = [...new Set(legs.map((p) => p.date))];
  const existingLists = await Promise.all(
    dates.map((d) =>
      readWithRetry(() => base44.entities.BankuPickResult.filter({ date_key: d }, "-created_date", 60), { fallback: [] })
    )
  );
  // The dedup key includes the MARKET — since a slip may now carry a second
  // scrutinized market from the same game (strict 10/15 fill), the same game
  // can legitimately hold two legs, each recorded and settled on its own.
  const have = new Set();
  for (const rows of existingLists) {
    for (const r of rows || []) {
      // Stable team identity + normalized market KEY (never the human label,
      // whose wording can drift between deals) — the same game + market is
      // never recorded twice even when fixture ids or label wording change.
      if (r.market_key) have.add(`${r.date_key}|${r.slip || "banku"}|${norm(r.home)}|${norm(r.away)}|${norm(r.market_key)}`);
      have.add(`${r.date_key}|${r.slip || "banku"}|${norm(r.home)}|${norm(r.away)}|${norm(r.market_label)}`);
      // Duplicate prevention by fixture id — the same fixture never enters a
      // slip's ledger twice, whatever surface computed the deal. BOTH the
      // human market label AND the normalized market key guard the fixture:
      // the label is a display field (a resolved participant name must never
      // create a second record), the market key is the stable identity.
      if (r.fixture_id) {
        have.add(`${r.slip || "banku"}|${r.fixture_id}|${norm(r.market_label)}`);
        if (r.market_key) have.add(`${r.slip || "banku"}|${r.fixture_id}|${norm(r.market_key)}`);
      }
    }
  }
  const seen = new Set();
  const fresh = [];
  for (const p of legs) {
    const k = `${p.date}|${slip}|${norm(p.home)}|${norm(p.away)}|${norm(p.marketLabel || "")}`;
    const fid = p.fixtureId || p.fixture_id || "";
    const mk = String(p.marketKey || marketKeyOf(p.marketLabel || "") || "");
    const fk = fid ? `${slip}|${fid}|${norm(p.marketLabel || "")}` : null;
    const fmk = fid && mk ? `${slip}|${fid}|${norm(mk)}` : null;
    if (
      have.has(k) || seen.has(k) ||
      (fk && (have.has(fk) || seen.has(fk))) ||
      (fmk && (have.has(fmk) || seen.has(fmk)))
    ) continue;
    seen.add(k);
    if (fk) seen.add(fk);
    if (fmk) seen.add(fmk);
    fresh.push({
      slip,
      date_key: p.date,
      home: p.home,
      away: p.away,
      league: p.league || "",
      fixture_id: fid,
      sport: p.sport || "",
      ...(p.timestamp && !String(p.timestamp).endsWith("T12:00:00Z") ? { kickoff: p.timestamp } : {}),
      day_index: Number(p.dayIndex) || 0,
      market_label: p.marketLabel || "",
      market_key: p.marketKey || marketKeyOf(p.marketLabel || ""),
      probability: Number(p.prob) || 0,
      fair_odds: Number(p.fairOdds) || 0,
      src: p.src || "",
      status: "open",
    });
  }
  if (fresh.length) await base44.entities.BankuPickResult.bulkCreate(fresh);
  return fresh.length;
}

// Settle every past-day open pick against the real final scores. Returns the
// rows that just WON so the UI can fire the win celebration for them.
export async function settleBankuPicks() {
  const today = todayISO();
  const open = await readWithRetry(() =>
    base44.entities.BankuPickResult.filter({ status: "open" }, "-date_key", 200)
  );
  const pending = (open || []).filter((r) => r.date_key && r.date_key < today);
  if (!pending.length) return { settled: 0, wins: [] };

  const byDate = {};
  for (const r of pending) (byDate[r.date_key] = byDate[r.date_key] || []).push(r);

  const updates = [];
  const wins = [];
  const settledIds = new Set();
  for (const [day, group] of Object.entries(byDate).slice(0, 7)) {
    try {
      const res = await fetch(`${BASE}/eventsday.php?d=${day}&s=Soccer`);
      if (!res.ok) continue;
      const j = await res.json();
      const idx = new Map();
      for (const ev of (j && j.events) || []) {
        if (ev.intHomeScore == null || ev.intAwayScore == null) continue;
        idx.set(`${norm(ev.strHomeTeam)}|${norm(ev.strAwayTeam)}`, [Number(ev.intHomeScore), Number(ev.intAwayScore)]);
      }
      for (const r of group) {
        const hit = idx.get(`${norm(r.home)}|${norm(r.away)}`);
        if (!hit) continue;
        const won = settleKey(r.market_key, hit[0], hit[1]);
        if (won == null) continue;
        settledIds.add(r.id);
        updates.push({
          id: r.id,
          status: won ? "win" : "loss",
          actual_home: hit[0],
          actual_away: hit[1],
          settled_at: new Date().toISOString(),
        });
        if (won) wins.push({ home: r.home, away: r.away, market: r.market_label });
      }
    } catch {}
  }

  // Aging — a game older than 7 days whose result never appeared in the feed
  // is voided: it counts toward neither wins nor losses.
  const stale = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const r of pending) {
    if (r.date_key < stale && !settledIds.has(r.id)) updates.push({ id: r.id, status: "void" });
  }

  if (updates.length) await base44.entities.BankuPickResult.bulkUpdate(updates);

  // AUDIT TRAIL — every processed bet result (win/loss/void) is appended to
  // the owner's Google Sheets Bet Audit tab in ONE batched call, so the full
  // historical performance is reviewable outside the app.
  const rowById = new Map(pending.map((r) => [r.id, r]));
  const audits = updates
    .map((u) => {
      const r = rowById.get(u.id);
      if (!r) return null;
      return {
        type: "bet_result",
        sport: "football",
        match: `${r.home} vs ${r.away}`,
        market: r.market_label,
        odds: r.probability ? Math.round((1 / r.probability) * 100) / 100 : "",
        result: u.status,
        notes: `${(r.slip || "banku").toUpperCase()} drop leg · final ${u.actual_home ?? "-"}-${u.actual_away ?? "-"} · graded from the real final score`,
      };
    })
    .filter(Boolean);
  if (audits.length) logBetAuditBatch(audits);

  return { settled: updates.length, wins };
}

// The last N days of stored drops, newest first — one slip's own ledger
// only (legacy rows stored before the slip field count as banku).
export async function getBankuHistory(days = 7, slip = "banku") {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await readWithRetry(() => base44.entities.BankuPickResult.filter({}, "-date_key", 300));
  return (rows || []).filter((r) => (r.date_key || "") >= since && (r.slip || "banku") === slip);
}