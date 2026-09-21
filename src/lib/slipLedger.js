// 50-LEG BATCH LEDGER — records every dealt SPECIAL ODDS ticket (football,
// basketball, tennis, American football, baseball, ice hockey, incl. CHOP EBA)
// and settles each leg against REAL final scores
// from the same data sources the engines scanned, so the admin dashboard can
// monitor batch success: legs won / lost / still open, and whether the ticket
// is still alive. Never self-reported, never guessed.

import { settleMarket } from "@/lib/pickLedger";
import { legOdds } from "@/components/sports/SpecialSlipBatch";
import { LEAGUES, SEASON, fetchSeason } from "@/lib/slipPool";
import { todayKey } from "@/lib/dealtPickMemory";
import { logBetAuditBatch } from "@/lib/betAuditLog";

const KEY = "ridex-slip-ledger-v1";
const MAX_BATCHES = 40;
const RETAIN_DAYS = 14; // older legs are voided — their games are long gone
const MAX_LEAGUES = 12; // max league feeds fetched per settle pass
const BASE = "https://www.thesportsdb.com/api/v1/json/3";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const legKey = (l) => `${l.date || ""}|${norm(l.home)}|${norm(l.away)}|${norm(l.marketLabel)}`;

// Every market that must win for the leg to win: the main pick (combo labels
// split into their parts) plus the padding picks riding on the same leg.
const partsOf = (l) =>
  [
    ...String(l.marketLabel || "")
      .split("+")
      .map((s) => s.split("·")[0].trim())
      .filter(Boolean),
    l.companion?.label,
    l.companion2?.label,
  ].filter(Boolean);

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
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX_BATCHES)));
  } catch {}
}

// Record today's deal (upsert by batch — same-day re-renders never duplicate,
// and already-settled legs keep their result).
export function recordBatches(sport, batches) {
  const today = todayKey();
  const rows = read();
  const idx = new Map(rows.map((r, i) => [r.batchId, i]));
  for (const b of batches || []) {
    if (!b?.name || !b.legs?.length) continue;
    const batchId = `${sport}|${b.name}|${today}`;
    const prev = idx.has(batchId) ? rows[idx.get(batchId)] : null;
    const prevLegs = new Map((prev?.legs || []).map((l) => [l.key, l]));
    let combined = 1;
    for (const l of b.legs) combined *= legOdds(l);
    const legs = b.legs.map((l) => {
      const k = legKey(l);
      const p = prevLegs.get(k);
      return {
        key: k,
        sport,
        leagueId: l.leagueId || null,
        league: l.league || "",
        home: l.home,
        away: l.away,
        date: l.date,
        marketLabel: l.marketLabel,
        probability: l.probability || 0,
        parts: partsOf(l),
        status: p?.status || "open",
        actualHome: p?.actualHome ?? null,
        actualAway: p?.actualAway ?? null,
      };
    });
    const row = {
      batchId,
      sport,
      name: b.name,
      dealtAt: today,
      combinedOdds: Math.round(combined * 100) / 100,
      legs,
    };
    if (idx.has(batchId)) rows[idx.get(batchId)] = row;
    else rows.push(row);
  }
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86400000).toISOString().slice(0, 10);
  write(rows.filter((r) => r.dealtAt >= cutoff));
  return rows.length;
}

export function getBatches() {
  return read().sort((a, b) => (a.dealtAt < b.dealtAt ? 1 : -1));
}

// Non-football part: team lines settle on that team's real score (Points /
// Runs / Goals), tennis set picks on the final set score, everything else
// through the generic market parser.
function bbPart(label, hScore, aScore, homeName, awayName) {
  const s = String(label).trim();
  // team totals — "Team Over 20.5 Points / Runs / Goals"
  const m = /^(.+?)\s+over\s+([\d.]+)\s+(?:points|runs|goals)$/i.exec(s);
  if (m) {
    const team = m[1].trim();
    const line = parseFloat(m[2]);
    const isHome = norm(team) === norm(homeName);
    const isAway = norm(team) === norm(awayName);
    if (!isHome && !isAway) return null;
    return (isHome ? hScore : aScore) > line;
  }
  // tennis — "Player to Win a Set" settles on the final set score
  const w = /^(.+?)\s+to win a set$/i.exec(s);
  if (w) {
    const isHome = norm(w[1]) === norm(homeName);
    const isAway = norm(w[1]) === norm(awayName);
    if (!isHome && !isAway) return null;
    return (isHome ? hScore : aScore) >= 1;
  }
  return settleMarket(label, hScore, aScore);
}

// Football part: combo labels already split into parts upstream.
function fbPart(label, h, a) {
  return settleMarket(String(label).split("+")[0].split("·")[0].trim(), h, a);
}

function settleLeg(l, hit) {
  const parts = l.parts?.length ? l.parts : [l.marketLabel];
  let resolved = true, won = true;
  for (const part of parts) {
    const r = l.sport === "football" ? fbPart(part, hit[0], hit[1]) : bbPart(part, hit[0], hit[1], l.home, l.away);
    if (r == null) { resolved = false; break; } // unknown label — never guessed
    if (!r) won = false;
  }
  if (!resolved) return;
  l.status = won ? "win" : "loss";
  l.actualHome = hit[0];
  l.actualAway = hit[1];
}

// Settle every open leg whose game day has passed against the real final
// scores. Basketball legs settle via TheSportsDB league feeds; football legs
// via the same openfootball season file the pool scanned.
export async function settleSlipLedger() {
  const rows = read();
  const today = todayKey();
  const openLegs = [];
  for (const r of rows) for (const l of r.legs) if (l.status === "open" && l.date && l.date < today) openLegs.push(l);
  if (openLegs.length) {
    // --- TheSportsDB sports (basketball, tennis, American football, baseball, ice hockey) ---
    const byLeague = {};
    for (const l of openLegs.filter((x) => x.sport !== "football" && x.leagueId)) {
      (byLeague[l.leagueId] ||= []).push(l);
    }
    await Promise.all(
      Object.entries(byLeague).slice(0, MAX_LEAGUES).map(async ([leagueId, legs]) => {
        try {
          const res = await fetch(`${BASE}/eventspastleague.php?id=${leagueId}`);
          if (!res.ok) return;
          const j = await res.json();
          const idx = new Map();
          for (const ev of (j?.events || [])) {
            if (ev.intHomeScore == null || ev.intAwayScore == null) continue;
            idx.set(`${norm(ev.strHomeTeam)}|${norm(ev.strAwayTeam)}|${ev.dateEvent}`, [
              Number(ev.intHomeScore),
              Number(ev.intAwayScore),
            ]);
          }
          for (const l of legs) {
            const hit = idx.get(`${norm(l.home)}|${norm(l.away)}|${l.date}`);
            if (hit) settleLeg(l, hit);
          }
        } catch {}
      })
    );

    // --- football ---
    const codeOf = new Map(LEAGUES.map((lg) => [lg.label, lg.code]));
    const byCode = {};
    for (const l of openLegs.filter((x) => x.sport === "football" && codeOf.get(x.league))) {
      ((byCode[codeOf.get(l.league)] ||= [])).push(l);
    }
    await Promise.all(
      Object.entries(byCode).slice(0, MAX_LEAGUES).map(async ([code, legs]) => {
        try {
          const matches = await fetchSeason(code, SEASON);
          const idx = new Map();
          for (const m of matches) {
            if (!m.score?.ft) continue;
            idx.set(`${m.date}|${m.team1}|${m.team2}`, m.score.ft);
          }
          for (const l of legs) {
            const ft = idx.get(`${l.date}|${l.home}|${l.away}`);
            if (ft) settleLeg(l, ft);
          }
        } catch {}
      })
    );

    // --- world-league legs (API-FOOTBALL worldwide pool) have no openfootball
    // code, so they settle from the same global day feed the banku ledger
    // uses — real final scores only, never guessed.
    const worldOpen = openLegs.filter((x) => x.sport === "football" && x.status === "open" && !codeOf.get(x.league));
    if (worldOpen.length) {
      const byDay = {};
      for (const l of worldOpen) (byDay[l.date] ||= []).push(l);
      await Promise.all(
        Object.entries(byDay).slice(0, MAX_LEAGUES).map(async ([day, legs]) => {
          try {
            const res = await fetch(`${BASE}/eventsday.php?d=${day}&s=Soccer`);
            if (!res.ok) return;
            const j = await res.json();
            const idx = new Map();
            for (const ev of (j?.events || [])) {
              if (ev.intHomeScore == null || ev.intAwayScore == null) continue;
              idx.set(`${norm(ev.strHomeTeam)}|${norm(ev.strAwayTeam)}`, [Number(ev.intHomeScore), Number(ev.intAwayScore)]);
            }
            for (const l of legs) {
              const hit = idx.get(`${norm(l.home)}|${norm(l.away)}`);
              if (hit) settleLeg(l, hit);
            }
          } catch {}
        })
      );
    }

    // matches too old to still appear anywhere are voided — neither win nor loss
    const stale = new Date(Date.now() - RETAIN_DAYS * 86400000).toISOString().slice(0, 10);
    for (const l of openLegs) if (l.status === "open" && l.date && l.date < stale) l.status = "void";

    // AUDIT TRAIL — every leg settled (or voided) this pass is appended to the
    // owner's Google Sheets Bet Audit tab in ONE batched call.
    const openSet = new Set(openLegs);
    const audits = [];
    for (const r of rows) {
      for (const l of r.legs) {
        if (!openSet.has(l) || l.status === "open") continue;
        audits.push({
          type: "bet_result",
          sport: r.sport || "football",
          match: `${l.home} vs ${l.away}`,
          market: l.marketLabel,
          result: l.status,
          notes: `${r.name} leg · final ${l.actualHome ?? "-"}-${l.actualAway ?? "-"} · graded from the real final score`,
        });
      }
    }
    if (audits.length) logBetAuditBatch(audits);

    write(rows);
  }
  return rows;
}