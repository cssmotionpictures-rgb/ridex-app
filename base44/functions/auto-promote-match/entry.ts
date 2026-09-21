import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Auto-Promote matching engine.
// Scores approved curators against a track (genre + BPM-in-Afrobeats-range + key)
// and returns the pool sorted by score. ₦30,000 per selected curator — the artist
// chooses how many and which ones on the frontend.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const { title, artist, genres, bpm, key, audio_url, cover_url } = b;
    if (!title) return Response.json({ error: 'title required' }, { status: 400 });

    const PER_CURATOR = 30000;
    const CAP = 100;
    const AFRO = [95, 125];
    const COMMON_KEYS = ['C', 'G', 'D', 'A', 'E'];

    const score = (track, curator) => {
      let s = 0;
      const tGenres = (track.genres || []).map((g) => g.toLowerCase());
      const cGenres = (curator.genres || '').toLowerCase().split(',').map((g) => g.trim()).filter(Boolean);
      if (!cGenres.length || !tGenres.length) s += 30;
      else if (cGenres.some((g) => tGenres.some((x) => x.includes(g) || g.includes(x)))) s += 50;
      else s += 10;
      const bpmVal = Number(track.bpm) || 0;
      if (bpmVal >= AFRO[0] && bpmVal <= AFRO[1]) s += 30;
      else if (bpmVal && Math.min(Math.abs(bpmVal - AFRO[0]), Math.abs(bpmVal - AFRO[1])) <= 5) s += 20;
      else s += 5;
      if (track.key && COMMON_KEYS.includes(String(track.key).toUpperCase())) s += 20;
      else s += 10;
      return Math.min(s, 100);
    };

    const curators = await base44.asServiceRole.entities.Curator.filter({ status: 'approved' });
    const scored = curators
      .map((c) => ({ c, s: score({ genres, bpm, key }, c) }))
      .sort((a, b) => b.s - a.s);

    const matched = scored.slice(0, CAP).map(({ c, s }) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      followers: c.follower_count || 0,
      plays: c.plays || 0,
      score: s,
      auto_approve: !!c.auto_approve,
      genres: c.genres || '',
      is_standby: !!c.is_standby,
    }));

    return Response.json({
      matched,
      count: matched.length,
      per_curator: PER_CURATOR,
      total_fee: PER_CURATOR * matched.length,
      track: { title, artist, genres, bpm, key, audio_url, cover_url },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}