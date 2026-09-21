import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// REAL BOOKMAKER ODDS PROVIDER — The Odds API adapter. This function NEVER
// generates, projects or estimates a price: it only returns prices that a real
// bookmaker actually quoted (region eu, markets h2h + totals + btts, falling
// back to h2h + totals where the plan rejects btts), normalized to
// the best available decimal price per selection with the bookmaker name and
// the odds timestamp. When no provider key is configured it says so plainly —
// it does not fall back to any model-generated number.
//
// Responses are cached server-side (ApiFootballCache, TTL = requested odds
// freshness window, default 30 minutes) so repeated user requests never burn
// provider quota.

const SPORT_RE = /^(soccer|tennis)_[a-z0-9_]{1,40}$/;
// Full market set first (h2h + totals + both-teams-to-score). Some plans /
// leagues reject the btts market with 422 — the function then retries once
// with the base set rather than losing the whole league's real prices.
const MARKETS_FULL = 'h2h,totals,btts';
const MARKETS_BASIC = 'h2h,totals';
const REGIONS = 'eu';

// Compact a raw The Odds API response into the smallest honest shape:
// per event, the BEST decimal price per selection (never averaged), the
// bookmaker that quoted it, and the quote's own timestamp. Only upcoming
// events within the next 8 days are kept; started/simulated-looking events
// never enter.
function compactEvents(raw) {
  const soon = Date.now() + 8 * 86400000;
  const out = [];
  for (const ev of Array.isArray(raw) ? raw : []) {
    const start = new Date(ev.commence_time).getTime();
    if (!Number.isFinite(start) || start < Date.now() - 5 * 60000 || start > soon) continue;
    const h2h = {};
    const totals = {};
    const btts = {};
    let books = 0;
    for (const bm of ev.bookmakers || []) {
      books++;
      // PINNACLE CAPTURE — alongside the best price on the board, the sharp
      // book's own quote is kept per selection (4th slot) so the client can
      // prefer Pinnacle's price wherever Pinnacle quoted the market.
      const pin = /pinnacle/i.test(bm.title || '');
      for (const mk of bm.markets || []) {
        for (const o of mk.outcomes || []) {
          const price = Number(o.price);
          if (!(price > 1.01) || price > 10000) continue;
          const ts = bm.last_update || ev.commence_time;
          if (mk.key === 'h2h') {
            const key = o.name === 'Draw' ? 'X' : o.name === ev.home_team ? '1' : o.name === ev.away_team ? '2' : null;
            if (!key) continue;
            if (!h2h[key] || price > h2h[key][0]) h2h[key] = [price, bm.title, ts, h2h[key] ? h2h[key][3] : 0];
            if (pin && price > (h2h[key][3] || 0)) h2h[key][3] = price;
          } else if (mk.key === 'totals') {
            const pt = Number(o.point);
            if (!(pt >= 0.5 && pt <= 4.5)) continue;
            const side = o.name === 'Over' ? 'o' : o.name === 'Under' ? 'u' : null;
            if (!side) continue;
            if (!totals[pt]) totals[pt] = {};
            if (!totals[pt][side] || price > totals[pt][side][0]) totals[pt][side] = [price, bm.title, ts, totals[pt][side] ? totals[pt][side][3] : 0];
            if (pin && price > (totals[pt][side][3] || 0)) totals[pt][side][3] = price;
          } else if (mk.key === 'btts') {
            const side = o.name === 'Yes' ? 'Y' : o.name === 'No' ? 'N' : null;
            if (!side) continue;
            if (!btts[side] || price > btts[side][0]) btts[side] = [price, bm.title, ts, btts[side] ? btts[side][3] : 0];
            if (pin && price > (btts[side][3] || 0)) btts[side][3] = price;
          }
        }
      }
    }
    if (books > 0 && (Object.keys(h2h).length || Object.keys(totals).length || Object.keys(btts).length)) {
      out.push({ id: ev.id, commence: ev.commence_time, home: ev.home_team, away: ev.away_team, h2h, totals, btts, books });
    }
  }
  return out;
}

function snapRow(sportKey, ev, market, selection, q) {
  return {
    event_id: ev.id,
    sport_key: sportKey,
    home_team: ev.home,
    away_team: ev.away,
    market,
    selection,
    bookmaker: q[1],
    decimal_odds: q[0],
    timestamp: q[2],
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch {}

    const sportKeys = Array.isArray(body.sportKeys)
      ? body.sportKeys.map(String).filter((k) => SPORT_RE.test(k)).slice(0, 12)
      : [];
    const ttlMinutes = Math.min(1440, Math.max(5, Number(body.ttlMinutes) || 30));
    const force = body.force === true;

    // Key rotation — try every configured odds key; the first one whose quota
    // is NOT exhausted serves the prices. 401 (quota exhausted / key inactive)
    // and 429 (throttled) move to the next key instead of dropping to model odds.
    // Keys come from TWO places: the platform secrets AND the admin PROVIDER KEYS
    // box (ProviderApiKey rows whose provider starts with 'the_odds_api' —
    // the_odds_api_1, _2, _3…), so fresh quota can be added from inside the app
    // with no redeploy. All keys rotate together; exhausted ones are skipped.
    let apiKeys = [];
    try {
      apiKeys = [...new Set([secrets.get('THE_ODDS_API_KEY'), secrets.get('ODDS_API_KEY')].filter(Boolean))];
    } catch {}
    try {
      const rows = await base44.asServiceRole.entities.ProviderApiKey.list();
      for (const r of Array.isArray(rows) ? rows : []) {
        if (/^the_odds_api/.test(String(r?.provider || '')) && r?.api_key) {
          apiKeys.push(String(r.api_key).trim());
        }
      }
      apiKeys = [...new Set(apiKeys)];
    } catch {}
    if (!apiKeys.length) {
      return Response.json({
        status: 'unavailable',
        reason: 'MISSING_KEY',
        missingKey: 'THE_ODDS_API_KEY',
        message: 'Real bookmaker odds are disabled — no provider key is configured. The engine refuses to invent prices.',
      });
    }
    if (!sportKeys.length) return Response.json({ status: 'ok', provider: 'The Odds API', sports: [] });

    // Keys that returned 401 during THIS invocation — quota exhausted / key
    // inactive. Remembered so later leagues skip straight to a live key
    // instead of hammering the dead one once per league.
    const deadKeys = new Set();
    const fetchSport = async (sportKey) => {
      if (/_srl$/.test(sportKey)) return { sportKey, status: 'error', reason: 'simulated (SRL) league — never used' };
      const cacheKey = `the-odds-api:${sportKey}:odds`;
      let cached = null;
      if (!force) {
        try {
          const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: cacheKey });
          cached = rows && rows[0] ? rows[0] : null;
          if (cached && cached.updated_date &&
              Date.now() - new Date(cached.updated_date).getTime() < ttlMinutes * 60000) {
            try {
              return { sportKey, cached: true, ...JSON.parse(cached.payload) };
            } catch {}
          }
        } catch {}
      }
      const oddsUrl = (markets, key) =>
        `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${encodeURIComponent(key)}` +
        `&regions=${REGIONS}&markets=${markets}&oddsFormat=decimal&dateFormat=iso&days=3`;
      let res = null;
      let keyUsed = 0;
      for (let i = 0; i < apiKeys.length; i++) {
        if (deadKeys.has(i)) continue;
        const isTennis = sportKey.startsWith('tennis_');
        let r;
        try {
          // tennis carries h2h only — the totals/btts markets do not exist there
          r = await fetch(oddsUrl(isTennis ? 'h2h' : MARKETS_FULL, apiKeys[i]));
          // btts not offered for this league/plan → retry once with the base set
          if (r.status === 422 && !isTennis) r = await fetch(oddsUrl(MARKETS_BASIC, apiKeys[i]));
        } catch (e) {
          return { sportKey, status: 'error', reason: 'provider unreachable' };
        }
        // 429 = THROTTLED — transient, unlike quota exhaustion: brief pause,
        // then one retry on the same key before moving to the next.
        if (r.status === 429) {
          await new Promise((w) => setTimeout(w, 600));
          try {
            r = await fetch(oddsUrl(isTennis ? 'h2h' : MARKETS_FULL, apiKeys[i]));
            if (r.status === 422 && !isTennis) r = await fetch(oddsUrl(MARKETS_BASIC, apiKeys[i]));
          } catch (e) {
            return { sportKey, status: 'error', reason: 'provider unreachable' };
          }
        }
        // 401 = quota exhausted / key inactive → remember dead, next key
        if (r.status === 401) { deadKeys.add(i); continue; }
        res = r;
        keyUsed = i;
        if (r.ok || r.status !== 429) break;
      }
      if (!res) {
        return { sportKey, status: 'error', reason: 'all odds keys exhausted' };
      }
      if (!res.ok) {
        return {
          sportKey,
          status: 'error',
          reason: res.status === 401 || res.status === 429
            ? 'all odds keys exhausted'
            : res.status === 404 ? 'league not covered by odds provider' : `provider error ${res.status}`,
        };
      }
      const raw = await res.json();
      const events = compactEvents(raw);
      const remaining = res.headers.get('x-requests-remaining');
      const payload = {
        status: 'ok',
        fetchedAt: new Date().toISOString(),
        creditsRemaining: remaining ? Number(remaining) : null,
        keyUsed,
        events,
      };
      // ODDS SNAPSHOTS — every fresh poll stores one row per (event, market,
      // selection) best price with its bookmaker and the provider's own quote
      // timestamp, preserving the full odds history for movement / STEAM /
      // DRIFT (computed in the odds-history function). Rows older than 7 days
      // are pruned on every fresh poll.
      try {
        const rows = [];
        for (const ev of events) {
          for (const [sel, q] of Object.entries(ev.h2h || {})) rows.push(snapRow(sportKey, ev, 'h2h', sel, q));
          for (const [pt, sides] of Object.entries(ev.totals || {})) {
            for (const [side, q] of Object.entries(sides || {})) rows.push(snapRow(sportKey, ev, 'totals', `${side === 'o' ? 'Over' : 'Under'} ${pt}`, q));
          }
          for (const [side, q] of Object.entries(ev.btts || {})) rows.push(snapRow(sportKey, ev, 'btts', side === 'Y' ? 'Yes' : 'No', q));
        }
        if (rows.length) await base44.asServiceRole.entities.OddsSnapshot.bulkCreate(rows.slice(0, 400));
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        await base44.asServiceRole.entities.OddsSnapshot.deleteMany({ timestamp: { $lt: cutoff } });
      } catch {}
      try {
        const str = JSON.stringify(payload);
        if (str.length < 28000) {
          if (cached) {
            await base44.asServiceRole.entities.ApiFootballCache.update(cached.id, { endpoint: 'the-odds-api', payload: str });
          } else {
            await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: cacheKey, endpoint: 'the-odds-api', payload: str });
          }
        }
      } catch {}
      return { sportKey, ...payload };
    };

    // SEQUENTIAL league pulls — a parallel burst of simultaneous provider
    // requests trips its throttle and every league reports "all odds keys
    // exhausted" even with quota remaining. One league at a time keeps the
    // REAL prices flowing; the engine still refuses to invent any price.
    const sports = [];
    for (const sk of sportKeys) {
      sports.push(await fetchSport(sk));
    }

    return Response.json({ status: 'ok', provider: 'The Odds API', sports });
  } catch (error) {
    return Response.json({ error: error.message, status: 'error' }, { status: 500 });
  }
}