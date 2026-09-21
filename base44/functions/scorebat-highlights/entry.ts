import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ScoreBat's free highlights API. Browser fetches are now CORS-blocked, so we
// fetch server-side here and return a slim list with the embed iframe src
// pre-extracted — the frontend plays it directly in the in-app sandboxed player.
// v1 is the deprecated-but-still-serving free endpoint (the base /video-api/ now
// returns an HTML docs page). v1 returns a JSON array, last updated 2026-04-27.
const SCOREBAT_API = "https://www.scorebat.com/video-api/v1/";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const res = await fetch(SCOREBAT_API, {
      headers: { 'User-Agent': 'RideX/1.0 (+highlights)', 'Accept': 'application/json' },
    });
    if (!res.ok) return Response.json({ error: 'ScoreBat API ' + res.status }, { status: 502 });

    const data = await res.json();
    const items = (Array.isArray(data) ? data : []).map((h) => {
      const videos = (h.videos || []).map((v) => {
        const m = (v.embed || '').match(/src=['"]([^'"]+)['"]/i);
        return { title: v.title, src: m ? m[1] : '' };
      }).filter((v) => v.src);
      return {
        title: h.title,
        thumbnail: h.thumbnail,
        date: h.date,
        competition: h.competition, // string or { name } — frontend normalises
        videos,
      };
    }).filter((h) => h.videos.length > 0);

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}