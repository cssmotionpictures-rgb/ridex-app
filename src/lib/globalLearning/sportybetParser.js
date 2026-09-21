// SPORTYBET TICKET PARSER — full-batch structural parsing of pasted SportyBet
// ticket text. The parser recognizes TICKET boundaries (Ticket ID, stake,
// total odds, Number of Bets…), then every individual LEG (Game ID, kickoff,
// teams, FT Score, Pick, Odds, Market, Outcome). Raw UI fragments (Match
// Tracker, Rebet, Delete Ticket…) are ignored — they NEVER become unresolved
// observations. Only genuine leg blocks count: a recognized leg that cannot be
// normalized is UNRESOLVED with its exact reason; a leg with no final score is
// PENDING; duplicated tickets and legs are deduplicated deterministically.
// Pure module — no database access, fully unit-testable.

const NOISE_RE = /^(?:match tracker|sporty note|rebet|delete ticket|contact (?:support|us)|customer support|share|print|copy (?:code|ticket)?|view details|statistics|live chat|help(?: center)?|settings|how to play|terms|privacy)\b/i;

const TICKET_ID_RE = /^(?:ticket|bet)\s*(?:id|no\.?|number)?\s*[:#]?\s*(\d{4,})(.*)$/i;
const GAME_ID_RE = /^game\s*id\s*[:#]?\s*(\d+)\s*(.*)$/i;
const TEAMS_RE = /^(.{2,60}?)\s+(?:vs\.?|v\.?|versus)\s+(.{2,60})$/i;
const FT_RE = /(?:ft|full\s*time)\s*(?:score)?\s*[:\-]?\s*(\d{1,2})\s*[:\-–]\s*(\d{1,2})/i;
const PICK_RE = /^pick\s*[:\-]?\s*(.+)$/i;
const MARKET_RE = /^market\s*[:\-]?\s*(.+)$/i;
const OUTCOME_RE = /^outcome\s*[:\-]?\s*(.+)$/i;
const KICKOFF_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:[ ,]+(\d{1,2}:\d{2}))?/;
const ODDS_RE = /(?:^|\s)(?:odds|price)\s*[:\-]?\s*(\d{1,4}\.\d{1,2})(?:\s|$)/i;
const STAKE_RE = /(?:stake|amount)\s*[:\-]?\s*([\d.,]+)/i;
const TOTAL_ODDS_RE = /total\s*odds\s*[:\-]?\s*([\d.,]+)/i;
const BETS_COUNT_RE = /number\s*of\s*bets\s*[:\-]?\s*(\d+)/i;

const stripMarkdown = (line) =>
  String(line || "")
    .replace(/^[*_•·>#~\s]+/, "")
    .replace(/\*+/g, "")
    .replace(/_{2,}/g, " ")
    .trim();

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

// Conservative detection — the text must look like SportyBet ticket structure,
// never a small generic result list.
export function detectSportyBetText(text) {
  const t = String(text || "");
  const ticketId = /(?:ticket|bet)\s*(?:id|no\.?|number)?\s*[:#]?\s*\d{4,}/i.test(t);
  const gameId = /game\s*id\s*[:#]?\s*\d+/i.test(t);
  const labelHits = ["ft score", "market", "outcome", "pick"].filter((k) =>
    new RegExp(k.replace(" ", "\\s*"), "i").test(t)
  ).length;
  if (/sportybet/i.test(t) && (gameId || labelHits >= 2)) return true;
  if (ticketId && labelHits >= 2) return true;
  if (gameId && labelHits >= 3) return true;
  return false;
}

// dd/mm(/yyyy) → YYYY-MM-DD. SportyBet prints day-first; the year comes from
// the ticket date when present, else the current year. Unparseable → "".
function kickoffDateOf(day, month, year, ticketYear) {
  const d = Number(day);
  const m = Number(month);
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return "";
  let y = year ? Number(year.length === 2 ? `20${year}` : year) : ticketYear ? Number(ticketYear) : new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2000 || y > 2100) y = new Date().getFullYear();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function newTicket(ticketId) {
  return { ticketId: String(ticketId || ""), meta: { stake: 0, totalOdds: 0, betsCount: 0, ticketDate: "" }, metaText: [], legs: [] };
}

function newLeg(gameId) {
  return { gameId: String(gameId || ""), lines: [] };
}

// Per-ticket tallies from classified legs (pure). bucket: settled | pending |
// conflict | suppliedOnly | unresolved — a settled leg tallies WON/LOST/PUSH,
// everything unsettled tallies into its own bucket. A ticket losing because of
// one or two legs never marks its other winning legs as losses.
export function ticketTalliesOf(classifications) {
  const map = new Map();
  for (const c of classifications || []) {
    const key = c.ticketId || "unknown";
    const t = map.get(key) || { wins: 0, losses: 0, pushes: 0, pending: 0, unresolved: 0, legs: 0 };
    if (c.bucket === "settled") {
      if (c.status === "won") t.wins += 1;
      else if (c.status === "lost") t.losses += 1;
      else t.pushes += 1;
    } else if (c.bucket === "pending") t.pending += 1;
    else t.unresolved += 1; // conflict + supplied-only legs are not settled
    t.legs += 1;
    map.set(key, t);
  }
  return map;
}

// Parse the full pasted batch into ticket blocks and unique leg observations.
export function parseSportyBetBatch(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const hasGameIds = /game\s*id\s*[:#]?\s*\d+/i.test(rawText || "");
  const tickets = [];
  let ticket = null;
  let leg = null;
  let ignoredFragments = 0;
  // fallback context (no-Game-ID pastes): teams/kickoff/score lines seen
  // before the Pick line belong to the upcoming leg
  let ctx = { teams: null, kickoff: "", kickoffDate: "", ft: null };

  const closeLeg = () => { if (leg) { (ticket || (ticket = newTicket("")), ticket.legs).push(leg); } leg = null; };
  const closeTicket = () => { closeLeg(); if (ticket) tickets.push(ticket); ticket = null; };

  for (const raw of lines) {
    const line = stripMarkdown(raw);
    if (!line) continue;
    if (NOISE_RE.test(line)) { ignoredFragments++; continue; }

    const tm = TICKET_ID_RE.exec(line);
    if (tm) {
      closeTicket();
      ticket = newTicket(tm[1]);
      if (tm[2]) ticket.metaText.push(tm[2].trim());
      continue;
    }
    const gm = GAME_ID_RE.exec(line);
    if (gm) {
      closeLeg();
      if (!ticket) ticket = newTicket("");
      leg = newLeg(gm[1]);
      if (gm[2]) leg.lines.push(gm[2].trim());
      continue;
    }

    const pm = PICK_RE.exec(line);
    if (pm && !hasGameIds) {
      // no Game IDs in this paste — the Pick line delimits legs
      closeLeg();
      if (!ticket) ticket = newTicket("");
      leg = newLeg("");
      leg.lines.push(`Pick: ${pm[1].trim()}`);
      continue;
    }

    if (!ticket) ticket = newTicket("");

    // ticket metadata
    const stakeM = STAKE_RE.exec(line);
    const oddsM = TOTAL_ODDS_RE.exec(line);
    const betsM = BETS_COUNT_RE.exec(line);
    if (stakeM) { ticket.meta.stake = Number(stakeM[1].replace(/,/g, "")) || 0; continue; }
    if (oddsM) { ticket.meta.totalOdds = Number(oddsM[1].replace(/,/g, "")) || 0; continue; }
    if (betsM) { ticket.meta.betsCount = Number(betsM[1]) || 0; continue; }
    if (/^(multiple|single|system)\b/i.test(line) || /^\d{4,}$/.test(line)) { ticket.metaText.push(line); continue; }

    // kickoff / teams / score context
    const km = KICKOFF_RE.exec(line);
    const teamsM = TEAMS_RE.exec(line);
    const ftM = FT_RE.exec(line);
    const isLabelLine = pm || MARKET_RE.test(line) || OUTCOME_RE.test(line) || ODDS_RE.test(line);

    if (teamsM && !isLabelLine) {
      if (hasGameIds) {
        if (leg) leg.lines.push(`Teams: ${teamsM[1].trim()}|${teamsM[2].trim()}`);
        else ticket.metaText.push(line);
      } else {
        // new fixture context — replaces the previous one
        ctx = { teams: [teamsM[1].trim(), teamsM[2].trim()], kickoff: km ? line.trim() : "", kickoffDate: km ? kickoffDateOf(km[1], km[2], km[3]) : "", ft: null };
        continue;
      }
      if (!km) continue;
      if (leg) leg.lines.push(`Kickoff: ${km[0]}`);
      continue;
    }

    if (km && !isLabelLine && !ftM) {
      if (hasGameIds) {
        if (leg) leg.lines.push(`Kickoff: ${km[0]}`);
        else ticket.metaText.push(line);
        continue;
      }
      ctx.kickoff = km[0];
      if (!ctx.kickoffDate) ctx.kickoffDate = kickoffDateOf(km[1], km[2], km[3]);
      continue;
    }

    if (ftM && !isLabelLine) {
      if (hasGameIds) {
        if (leg) leg.lines.push(`FT: ${ftM[1]}:${ftM[2]}`);
        else ticket.metaText.push(line);
        continue;
      }
      ctx.ft = [Number(ftM[1]), Number(ftM[2])];
      continue;
    }

    if (!hasGameIds && ctx.teams && !leg) {
      // materialize the pending-context leg so its labels attach
      leg = newLeg("");
      leg.lines.push(`Teams: ${ctx.teams[0]}|${ctx.teams[1]}`);
      if (ctx.kickoff) leg.lines.push(`Kickoff: ${ctx.kickoff}`);
      if (ctx.ft) leg.lines.push(`FT: ${ctx.ft[0]}:${ctx.ft[1]}`);
    }

    if (leg) leg.lines.push(line);
    else ticket.metaText.push(line);
  }
  closeTicket();

  // ticket date (first date-like meta line) supplies the kickoff year
  const ticketYearOf = (t) => {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t.metaText.join(" "));
    return m ? m[3] : "";
  };

  // —— structure each leg ——
  const structured = [];
  for (const t of tickets) {
    const year = ticketYearOf(t);
    t.legs = t.legs.map((lg) => structureLeg(lg, year));
    structured.push(t);
  }

  // —— deduplicate tickets ——
  const byTicket = new Map();
  const uniqueTickets = [];
  let duplicateTicketCopies = 0;
  for (const t of structured) {
    const key = t.ticketId || `no-id-${uniqueTickets.length}`;
    if (t.ticketId && byTicket.has(t.ticketId)) {
      duplicateTicketCopies++;
      // merge any genuinely new legs into the canonical ticket copy
      byTicket.get(t.ticketId).legs.push(...t.legs);
      continue;
    }
    if (t.ticketId) byTicket.set(t.ticketId, t);
    t.key = key;
    uniqueTickets.push(t);
  }

  // —— deduplicate legs across tickets ——
  // legKey (within ticket): game|teams|pick|odds — repeated legs collapse.
  // gameKey (across tickets): the SAME original selection on another ticket is
  // ONE observation linked to both tickets, never counted twice.
  const observations = [];
  const byGameKey = new Map();
  let duplicateLegs = 0;
  for (const t of uniqueTickets) {
    const seenInTicket = new Set();
    const ticketLegs = [];
    for (const lg of t.legs) {
      if (!lg.home || !lg.away || !lg.pick) {
        // recognized leg block (Game ID / teams present) that could not be fully
        // structured — an UNRESOLVED observation, never a discarded fragment
        if (lg.gameId || lg.home || lg.away) ticketLegs.push(lg);
        else ignoredFragments++;
        continue;
      }
      const legKey = `${lg.gameId}|${slug(lg.home)}|${slug(lg.away)}|${slug(lg.pick)}|${lg.odds}`;
      if (seenInTicket.has(legKey)) { duplicateLegs++; continue; }
      seenInTicket.add(legKey);
      ticketLegs.push(lg);
    }
    t.legs = ticketLegs;
    for (const lg of ticketLegs) {
      const gameKey = `${lg.gameId}|${slug(lg.home)}|${slug(lg.away)}|${slug(lg.pick)}|${lg.odds}`;
      const prior = byGameKey.get(gameKey);
      if (prior) {
        duplicateLegs++;
        if (!prior.ticketIds.includes(t.ticketId || t.key)) prior.ticketIds.push(t.ticketId || t.key);
        continue;
      }
      lg.ticketIds = [t.ticketId || t.key];
      lg.identity = `sb|${t.ticketId || t.key}|${gameKey}`;
      byGameKey.set(gameKey, lg);
      observations.push(lg);
    }
  }

  return {
    ticketsDetected: tickets.length,
    uniqueTickets,
    duplicateTicketCopies,
    legs: observations,
    duplicateLegs,
    ignoredFragments,
  };
}

// Leg block → structured leg (pure).
function structureLeg(lg, ticketYear) {
  const out = {
    gameId: lg.gameId || "",
    home: "", away: "", kickoff: "", kickoffDate: "",
    ftScore: null, pick: "", odds: 0, market: "", outcome: "",
  };
  const teamsFrom = (h, a) => { if (!out.home) { out.home = h.trim(); out.away = a.trim(); } };
  for (const line of lg.lines) {
    const tm = /^Teams:\s*(.+?)\|(.+)$/.exec(line);
    if (tm) { teamsFrom(tm[1], tm[2]); continue; }
    const km = /^Kickoff:\s*(.+)$/.exec(line);
    if (km) {
      const k = KICKOFF_RE.exec(km[1]);
      if (k && !out.kickoffDate) {
        out.kickoff = k[0].trim();
        out.kickoffDate = kickoffDateOf(k[1], k[2], k[3], ticketYear);
      }
      continue;
    }
    const fm = /^FT:\s*(\d{1,2}):(\d{1,2})$/.exec(line);
    if (fm) { out.ftScore = [Number(fm[1]), Number(fm[2])]; continue; }
    const pm = PICK_RE.exec(line);
    if (pm) { if (!out.pick) out.pick = pm[1].trim(); continue; }
    const om = ODDS_RE.exec(line);
    if (om) { out.odds = Number(om[1]) || 0; continue; }
    const mm = MARKET_RE.exec(line);
    if (mm) { if (!out.market) out.market = mm[1].trim(); continue; }
    const um = OUTCOME_RE.exec(line);
    if (um) { if (!out.outcome) out.outcome = um[1].trim(); continue; }
    const fm2 = FT_RE.exec(line);
    if (fm2 && !out.ftScore) { out.ftScore = [Number(fm2[1]), Number(fm2[2])]; continue; }
    const tm2 = TEAMS_RE.exec(line);
    if (tm2 && !out.home) { teamsFrom(tm2[1], tm2[2]); continue; }
  }
  return out;
}