import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// VERIFIED CORNER FEED — real corner-kick statistics from finished
// API-Football matches, per team, across the eight slip leagues. Every
// corner number downstream traces back to a tracked professional match —
// nothing is projected or guessed. The scan is progressive: finished matches
// never change, so each (league, date) is processed exactly once, and a
// bounded per-run budget (paced for the free plan) lets the map accumulate
// across invocations — the nightly cron plus on-demand runs — without ever
// bursting the daily quota.

const STATE_KEY = 'corner-stats:map';
const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 78, name: 'Bundesliga' },
  { id: 135, name: 'Serie A' },
  { id: 61, name: 'Ligue 1' },
  { id: 40, name: 'Championship' },
  { id: 94, name: 'Primeira Liga' },
  { id: 88, name: 'Eredivisie' },
];
const DONE_STATUSES = new Set(['FT', 'AET', 'PEN']);
const LOOKBACK_DAYS = 42;
const MAX_PER_TEAM = 5;
const MAX_BUDGET = 16;
const PACE_MS = 6000;
const MAX_PAYLOAD = 20000;

// Keep in sync with the client copy in src/lib/cornerFeed.js.
const STOP = new Set([
  'fc', 'cf', 'afc', 'ac', 'ca', 'sc', 'cd', 'ud', 'sd', 'calcio', 'club',
  'de', 'del', 'la', 'el', 'di', 'da', 'do', 'das', 'dos', 'e', 'en', 'the',
  'if', 'bk', 'sk', 'fk', 'pfc', 'vfl', 'vfb', 'tsv', 'tsg', 'fsv', 'fcs',
  'cs', 'csc', 'zs', 'aa', 'as', 'sp', 'og', 'ag', 'mfk', 'nk', 'a',
  '1', '04', '05', '07', '09', '1893', '1899', '1900', '2000',
]);

function normalizeName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .join(' ')
    .trim();
}

function dayKey(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// Real corner history per team — `f` = corners won per tracked match,
// `t` = total corners in that match. Capped to the most recent matches.
function record(teams: any, name: string, won: number, total: number) {
  const k = normalizeName(name);
  if (!k) return;
  if (!teams[k]) teams[k] = { n: name, f: [], t: [] };
  const e = teams[k];
  while (e.f.length >= MAX_PER_TEAM) { e.f.shift(); e.t.shift(); }
  e.f.push(won);
  e.t.push(total);
}

async function readState(base44: any) {
  const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: STATE_KEY }, '-created_date', 1);
  const rec = rows?.[0];
  try {
    const parsed = JSON.parse(rec?.payload || '');
    if (parsed && parsed.teams && parsed.processed) {
      return { processed: parsed.processed, doneFixtures: parsed.doneFixtures || {}, teams: parsed.teams };
    }
  } catch {}
  return { processed: {}, doneFixtures: {}, teams: {} };
}

async function writeState(base44: any, state: any) {
  // prune markers older than the lookback horizon — they can never return
  const cutoff = dayKey(60);
  for (const k of Object.keys(state.processed)) {
    const d = k.split('|')[1];
    if (d && d < cutoff) delete state.processed[k];
  }
  for (const [fid, d] of Object.entries(state.doneFixtures || {})) {
    if (String(d) < cutoff) delete state.doneFixtures[fid];
  }
  // entity payload fields cap well below 32KB — shrink before writing
  if (JSON.stringify(state).length > MAX_PAYLOAD) {
    for (const e of Object.values(state.teams)) {
      while (e.f.length > 3) { e.f.shift(); e.t.shift(); }
    }
  }
  const payload = JSON.stringify(state);
  const rows = await base44.asServiceRole.entities.ApiFootballCache.filter({ cache_key: STATE_KEY }, '-created_date', 1);
  if (rows?.[0]) {
    await base44.asServiceRole.entities.ApiFootballCache.update(rows[0].id, { payload });
  } else {
    await base44.asServiceRole.entities.ApiFootballCache.create({ cache_key: STATE_KEY, endpoint: 'corner-stats', payload });
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({})) || {};
    const budget = Math.max(1, Math.min(MAX_BUDGET, Number(body.budget) || MAX_BUDGET));

    const state = await readState(base44);
    let fresh = 0;
    let exhausted = false;
    let upstreamDown = false;
    let lastError = '';
    let recorded = 0;

    // All upstream traffic flows through the cached api-football proxy —
    // shared keys, shared pacing, zero duplicated key handling.
    const proxy = async (endpoint: string, params: Record<string, string>) => {
      let res: any;
      try {
        res = await base44.functions.invoke('api-football', { endpoint, params });
      } catch (e: any) {
        lastError = String(e?.response?.data?.error || e?.data?.error || e?.message || e);
        throw new Error(lastError);
      }
      const d = res?.data ?? res;
      if (!d || d.error) {
        lastError = String(d?.error || 'api-football proxy error');
        throw new Error(lastError);
      }
      if (d.cached === false) {
        fresh++;
        await new Promise((r) => setTimeout(r, PACE_MS));
      }
      return d.data;
    };

    // Newest dates first — the freshest matchdays always claim the budget.
    outer:
    for (let offset = 0; offset <= LOOKBACK_DAYS; offset++) {
      const dk = dayKey(offset);
      for (const lg of LEAGUES) {
        const pk = `${lg.id}|${dk}`;
        if (state.processed[pk]) continue;
        if (fresh >= budget) { exhausted = true; break outer; }

        let dayFixtures: any[] = [];
        try {
          const data = await proxy('fixtures', { league: String(lg.id), date: dk });
          dayFixtures = (data && Array.isArray(data.response)) ? data.response : [];
        } catch (e) {
          upstreamDown = true;
          exhausted = true;
          break outer; // transient upstream failure — a later run retries
        }
        state.processed[pk] = 1;

        const finished = dayFixtures.filter(
          (f) => DONE_STATUSES.has(String(f?.fixture?.status?.short || '').toUpperCase()) && f?.fixture?.id
        );
        for (const f of finished) {
          const fid = String(f.fixture.id);
          if (state.doneFixtures[fid]) continue;
          if (fresh >= budget) { exhausted = true; break outer; }
          try {
            const s = await proxy('fixtures/statistics', { fixture: fid });
            const rows = (s && Array.isArray(s.response)) ? s.response : [];
            const byTeam: Record<string, number> = {};
            for (const r of rows) {
              const ck = (r?.statistics || []).find((x) => /corner/i.test(String(x?.type || '')));
              const v = parseInt(String(ck?.value ?? ''), 10);
              if (!isNaN(v) && v >= 0 && r?.team?.name) byTeam[String(r.team.name)] = v;
            }
            const names = Object.keys(byTeam);
            if (names.length === 2) {
              const total = byTeam[names[0]] + byTeam[names[1]];
              record(state.teams, names[0], byTeam[names[0]], total);
              record(state.teams, names[1], byTeam[names[1]], total);
              recorded++;
            }
            state.doneFixtures[fid] = dk;
          } catch (e) {
            upstreamDown = true;
            exhausted = true;
            break outer; // fixture not marked done — a later run retries it
          }
        }
      }
    }

    if (upstreamDown) console.error('corner-stats upstream failure:', lastError);
    await writeState(base44, state);

    const teams = Object.values(state.teams).map((e: any) => {
      const n = e.f.length;
      const sumF = e.f.reduce((a: number, b: number) => a + b, 0);
      const sumT = e.t.reduce((a: number, b: number) => a + b, 0);
      return { name: e.n, n, avgFor: Number((sumF / n).toFixed(2)), avgTotal: Number((sumT / n).toFixed(2)) };
    });

    return Response.json({
      ok: true,
      teams,
      trackedFixtures: Object.keys(state.doneFixtures || {}).length,
      processedDays: Object.keys(state.processed || {}).length,
      recordedThisRun: recorded,
      budgetExhausted: exhausted,
      upstreamDown,
      upstreamError: upstreamDown ? lastError : '',
    });
  } catch (error) {
    console.error('corner-stats error:', (error as any)?.message || error);
    return Response.json({ error: (error as any)?.message || 'unknown' }, { status: 500 });
  }
}