// prediction-board — the Ride X model engine endpoint.
// One call returns the full 7-day board (morning/evening picks with quality
// scores, agreement, value edges and honest empty states), settles finished
// matches (calibration), and locks picks at kickoff. All provider calls are
// server-side and cached — no AI integration credits are used anywhere.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { cacheGet, cachePut, fetchSeason, currentSeasonYear } from "./openfootball.ts";
import { buildBoard, mergeConfig } from "./engine.ts";
import { localParts, evaluateMarket, isConsistent } from "./models.ts";
import { healthGet, teamsMatch, afFixturesForDate, srFixturesForDate, sportradarReady, providerRegistry } from "./providers.ts";

async function loadConfig(base44) {
  try {
    const rows = await base44.asServiceRole.entities.PredictionConfig.filter({ name: "global" }, "-updated_date", 1);
    return mergeConfig(rows && rows[0]);
  } catch (e) {
    console.error("config load failed:", e?.message || e);
    return mergeConfig(null);
  }
}

// Lock open picks whose match has kicked off — the original pre-match
// prediction is never changed after kickoff.
async function lockStarted(base44) {
  try {
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.EnginePick.updateMany(
      { status: "open", kickoff: { $lt: nowIso } },
      { $set: { status: "locked" } }
    );
  } catch (e) {
    console.error("lock failed:", e?.message || e);
  }
}

// Live result tracking: fetch the final score for recently finished picks,
// mark WIN / LOSS / VOID / POSTPONED and record Brier score + log loss.
async function settlePicks(base44) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const rows = await base44.asServiceRole.entities.EnginePick.filter(
    { status: { $in: ["open", "locked"] }, kickoff: { $lt: cutoff } },
    "kickoff", 10
  );
  let settled = 0;
  for (const rec of (rows || [])) {
    try {
      // fixture_id = "<league>|<date>|<home>|<away>" — resettle from the
      // real season results once the provider publishes the final score.
      const parts = String(rec.fixture_id || "").split("|");
      if (parts.length < 4) continue;
      const fDate = parts[1];
      const fHome = parts[2];
      const fAway = parts[3];
      const sy = currentSeasonYear(now);
      const isCurrent = Number(rec.kickoff.slice(0, 4)) >= sy;
      const ms = await fetchSeason(base44, rec.league_code, isCurrent ? sy : sy - 1, isCurrent);
      const m = (ms || []).find((x) => x.date === fDate && x.team1 === fHome && x.team2 === fAway);
      if (!m || !m.played || m.hs == null || m.as == null) continue;
      const hs = m.hs;
      const as = m.as;
      const outcome = evaluateMarket(rec.market_key, hs, as);
      const p = rec.probability;
      const brier = outcome === "void" ? null : (p - (outcome === "win" ? 1 : 0)) ** 2;
      const logLoss = outcome === "void"
        ? null
        : -(outcome === "win" ? Math.log(Math.max(p, 1e-6)) : Math.log(Math.max(1 - p, 1e-6)));
      await base44.asServiceRole.entities.EnginePick.update(rec.id, {
        status: outcome,
        actual_home_goals: hs,
        actual_away_goals: as,
        settled_at: now.toISOString(),
        brier,
        log_loss: logLoss,
      });
      settled++;
    } catch (e) {
      console.error("settle one failed:", e?.message || e);
    }
  }
  return settled;
}

// Persist today's board picks — idempotent: one stored pick per fixture.
async function persistPicks(base44, board) {
  const flat = [];
  for (const day of board.days) {
    for (const s of ["morning", "evening"]) {
      for (const p of day[s].picks) flat.push(p);
    }
  }
  if (!flat.length) return;
  const ids = flat.map((p) => p.fixtureId);
  const existing = await base44.asServiceRole.entities.EnginePick.filter(
    { fixture_id: { $in: ids } }, "-created_date", 200
  );
  const seen = new Set((existing || []).map((r) => r.fixture_id));
  for (const p of flat) {
    if (seen.has(p.fixtureId)) continue;
    try {
      await base44.asServiceRole.entities.EnginePick.create({
        fixture_id: p.fixtureId,
        league_code: p.leagueCode,
        league_name: p.league,
        home_team: p.home,
        away_team: p.away,
        home_logo: p.homeLogo,
        away_logo: p.awayLogo,
        kickoff: p.kickoff,
        date_key: p.dateKey,
        session: p.session,
        local_time: p.localTime,
        market_key: p.marketKey,
        market_label: p.marketLabel,
        probability: p.probability,
        predicted_home_goals: p.predictedHome,
        predicted_away_goals: p.predictedAway,
        quality_score: p.qualityScore,
        model_agreement: p.agreementText,
        agreement_ratio: p.agreementRatio,
        data_quality: p.dataQuality,
        uncertainty: p.uncertainty,
        fair_odds: p.fairOdds,
        market_odds: p.marketOdds,
        value_edge: p.valueEdge,
        risk_level: p.risk,
        reasons: JSON.stringify(p.reasons || []),
        models: JSON.stringify(p.models || []),
        flags: JSON.stringify(p.flags || []),
        sources: JSON.stringify(p.sources || []),
        status: "open",
        model_version: "v3",
      });
    } catch (e) {
      console.error("persist pick failed:", e?.message || e);
    }
  }
}

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "board");
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Diagnostics — one provider call + one cache round-trip, surfaced in the
    // response so the data path can be verified without dashboard access.
    if (action === "debug") {
      const diag = {};
      try {
        const matches = await fetchSeason(base44, "en.1", currentSeasonYear(new Date()), true);
        diag.seasonMatches = matches ? matches.length : null;
        diag.seasonPlayed = matches ? matches.filter((m) => m.played).length : null;
      } catch (e) {
        diag.seasonError = String(e?.message || e);
      }
      // Raw API-Football probe — what the provider actually returns from here.
      try {
        const key = (typeof Deno !== "undefined" && Deno.env.get("API_FOOTBALL_KEY")) || "";
        diag.afKeyPresent = !!key;
        const t0 = Date.now();
        const r = await fetch("https://v3.football.api-sports.io/fixtures?date=2026-09-05", {
          headers: { "x-apisports-key": key },
        });
        const j = await r.json();
        diag.afProbe = {
          status: r.status,
          ms: Date.now() - t0,
          results: j?.results,
          errors: j?.errors ?? null,
          responseLen: Array.isArray(j?.response) ? j.response.length : "not-array",
        };
      } catch (e) {
        diag.afProbeError = String(e?.message || e);
      }
      // The provider-layer wrapper on an IN-WINDOW date — clear the cached
      // entry first so it must do a real provider call.
      try {
        const stale = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: "af:fixtures:2026-09-05" }, "-updated_date", 1);
        if (stale?.[0]) await base44.asServiceRole.entities.ApiFootballCache.delete(stale[0].id);
        const wrapped = await afFixturesForDate(base44, "2026-09-05", true);
        diag.afWrapped = {
          count: Array.isArray(wrapped) ? wrapped.length : "not-array",
          championship: (wrapped || []).filter((f) => f.league === "Championship").length,
        };
      } catch (e) {
        diag.afWrappedError = String(e?.message || e);
      }
      return Response.json({ diag });
    }

    // TEMPORARY diagnostic — traces the Sportradar adapter inside the deployed
    // bundle, step by step, with the entity rows it should leave behind.
    if (action === "srdebug") {
      const out = {};
      out.ready = sportradarReady();
      try {
        const before = await cacheGet(base44, "provider:health:sportradar");
        out.healthBefore = before ? before.payload : null;
        const fx = await srFixturesForDate(base44, "2026-09-06", true, []);
        out.fixtureCount = Array.isArray(fx) ? fx.length : "not-array";
        out.firstFixture = fx && fx[0] ? { league: fx[0].league, home: fx[0].home, away: fx[0].away, coverage: fx[0].coverage } : null;
        const after = await cacheGet(base44, "provider:health:sportradar");
        out.healthAfter = after ? after.payload : null;
        const cached = await cacheGet(base44, "sr:fixtures:2026-09-06");
        out.fixturesCacheRow = cached ? { len: (cached.payload || "").length, ts: cached.ts } : null;
      } catch (e) {
        out.error = String(e?.message || e);
      }
      return Response.json({ out });
    }

    // Automated acceptance suite — the consistency validator + the
    // cross-provider team resolver. Pure logic, no provider calls.
    if (action === "selftest") {
      const cases = [
        ["U2.5", 2, 1, false], ["U2.5", 1, 0, true], ["O2.5", 2, 1, true], ["O2.5", 1, 0, false],
        ["BTTS_Y", 2, 0, false], ["BTTS_Y", 2, 1, true], ["BTTS_N", 2, 1, false], ["BTTS_N", 2, 0, true],
        ["1", 0, 2, false], ["2", 0, 2, true], ["X", 1, 1, true], ["X", 2, 0, false],
        ["1X", 0, 2, false], ["X2", 2, 0, false], ["12", 1, 1, false], ["12", 0, 2, true],
        ["U1.5", 1, 0, true], ["U3.5", 3, 0, true], ["O3.5", 2, 1, false], ["O1.5", 1, 1, true],
      ];
      const consistency = cases.map(([k, h, a, expected]) => {
        const got = isConsistent(k, h, a);
        return { testcase: `${k} + ${h}-${a}`, expected, got, pass: got === expected };
      });
      const normCases = [
        ["Manchester City FC", "Manchester City", true],
        ["Stoke City FC", "Stoke", true],
        ["AS Roma", "Roma", true],
        ["FC Bayern München", "Bayern München", true],
        ["Manchester United FC", "Manchester City", false],
        ["Real Madrid CF", "Real Sociedad", false],
      ];
      const normalization = normCases.map(([a, b, expected]) => {
        const got = teamsMatch(a, b);
        return { testcase: `${a} ≟ ${b}`, expected, got, pass: got === expected };
      });
      const all = [...consistency, ...normalization];
      return Response.json({
        suite: "model-engine-acceptance",
        passed: all.filter((r) => r.pass).length,
        total: all.length,
        results: all,
      });
    }

    const cfg = await loadConfig(base44);

    // Live provider health — the admin dashboard view.
    if (action === "health") {
      const health = {};
      for (const [k, v] of Object.entries(cfg.providerRegistry)) {
        const h = await healthGet(base44, k);
        health[k] = {
          label: v.label,
          enabled: v.enabled,
          status: v.enabled ? (h.status || "UNKNOWN") : "DISABLED",
          lastSuccess: h.lastSuccess || null,
          lastError: h.lastError || null,
          requestsToday: h.requestsToday ?? null,
        };
      }
      return Response.json({ health, updatedAt: new Date().toISOString() });
    }

    // Settle + lock first (bounded) so calibration keeps updating.
    await lockStarted(base44);
    let settledCount = 0;
    try {
      settledCount = await settlePicks(base44);
    } catch (e) {
      console.error("settle failed:", e?.message || e);
    }

    // Board cache (30 min) — repeated loads never re-hit the provider.
    const todayKey = localParts(new Date().toISOString(), cfg.timezone).dateKey;
    const cfgSig = [cfg.timezone, cfg.minProbability, cfg.minQualityScore, cfg.maxUncertainty,
      cfg.minAgreement, cfg.maxMorning, cfg.maxEvening, cfg.maxPerLeague, cfg.minGames,
      cfg.leagues.length, todayKey].join("|");
    const boardKey = `engine:board:v3:${cfgSig}`;

    // Board cache (30 min) — the full board exceeds the per-field size cap,
    // so it is stored as one small meta row + one small row per day/session.
    if (action !== "refresh") {
      const metaHit = await cacheGet(base44, `${boardKey}:meta`);
      if (metaHit && (Date.now() - metaHit.ts) / 1000 < 1800) {
        try {
          const meta = JSON.parse(metaHit.payload);
          const reads = await Promise.all((meta.dayKeys || []).flatMap((dk) =>
            ["m", "e"].map((s) => cacheGet(base44, `${boardKey}:d:${dk}:${s}`).then((r) => ({ dk, s, r })))));
          if (reads.length && reads.every((x) => x.r)) {
            const byDay = {};
            for (const x of reads) {
              const p = JSON.parse(x.r.payload);
              (byDay[x.dk] ||= { dateKey: x.dk, scanned: p.scanned || 0, morning: { picks: [] }, evening: { picks: [] } })[x.s === "m" ? "morning" : "evening"] = p.session;
            }
            const cached = { ...meta, days: (meta.dayKeys || []).map((dk) => byDay[dk]) };
            delete cached.dayKeys;
            cached.settledCount = settledCount;
            return Response.json(cached);
          }
        } catch { /* partial cache — rebuild live */ }
      }
    }

    const board = await buildBoard(base44, cfg);
    board.settledCount = settledCount;
    try {
      await persistPicks(base44, board);
      // never cache an empty/data-down board — a later load must retry live
      if (!board.sourceDown) {
        const { days, ...meta } = board;
        meta.dayKeys = days.map((d) => d.dateKey);
        await cachePut(base44, `${boardKey}:meta`, "engine-board", JSON.stringify(meta), null);
        for (const d of days) {
          for (const s of ["m", "e"]) {
            const sessionName = s === "m" ? "morning" : "evening";
            await cachePut(base44, `${boardKey}:d:${d.dateKey}:${s}`, "engine-board",
              JSON.stringify({ scanned: d.scanned || 0, session: d[sessionName] }), null);
          }
        }
      }
    } catch (e) {
      console.error("persist/cache failed:", e?.message || e);
    }
    return Response.json(board);
  } catch (error) {
    console.error("prediction-board error:", error?.message || error);
    return Response.json(
      { error: "DATA SOURCE TEMPORARILY UNAVAILABLE", message: String(error?.message || error) },
      { status: 500 }
    );
  }
}