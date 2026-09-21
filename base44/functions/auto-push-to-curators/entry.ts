import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { waitUntil } from 'base44:runtime';
import { autoApproveOn } from '../../shared/automation.ts';
import { notifyCuratorsOfSubmission } from '../../shared/curatorEmail.ts';

// Auto-Push Songs to Curators — admin-only.
// Finds PAID songs (PromotionPackage with active/completed status OR MusicDistribution
// with fee_paid > 0 and release_status pending/distributing), matches them to approved
// Curators by genre, and auto-creates CuratorSubmission records (pending) — skipping
// any artist/song/curator combo that already has a submission.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    // Global automation on → every submission auto-approves, even for curators
    // without the per-curator Boost flag.
    const autoCurators = await autoApproveOn(base44, 'auto_approve_curators');

    // --- 1. Gather paid songs ---
    // PromotionPackage: paid promotion campaigns
    const promos = await base44.asServiceRole.entities.PromotionPackage.filter({ status: 'active' });
    // Also include completed promos that may not have been pushed yet
    const completedPromos = await base44.asServiceRole.entities.PromotionPackage.filter({ status: 'completed' });
    const allPromos = [...promos, ...completedPromos];

    // MusicDistribution: paid distribution (fee_paid > 0, not yet fully live everywhere)
    const distros = await base44.asServiceRole.entities.MusicDistribution.list('-created_date', 200);
    const paidDistros = distros.filter((d) => d.fee_paid > 0 && (d.release_status === 'pending' || d.release_status === 'distributing'));

    // Build a unified "paid song" list: { artist_name, song_title, genre, audio_url, tier, source, user_id, user_email }
    const paidSongs = [];
    for (const p of allPromos) {
      paidSongs.push({
        artist_name: p.artist_name,
        song_title: p.song_title,
        genre: (p.notes || '').toLowerCase(),
        audio_url: p.song_url || '',
        tier: p.tier,
        source: 'promotion',
        user_id: p.user_id,
        user_email: p.user_email,
      });
    }
    for (const d of paidDistros) {
      paidSongs.push({
        artist_name: d.artist_name,
        song_title: d.song_title,
        genre: (d.platforms || '').toLowerCase(),
        audio_url: d.audio_url || '',
        tier: 'distribution',
        source: 'distribution',
        user_id: d.user_id,
        user_email: d.user_email,
      });
    }

    if (!paidSongs.length) {
      return Response.json({ paid_songs: 0, curators_matched: 0, submissions_created: 0, skipped: 0 });
    }

    // --- 2. Load approved curators ---
    const curators = await base44.asServiceRole.entities.Curator.filter({ status: 'approved' });
    if (!curators.length) {
      return Response.json({ paid_songs: paidSongs.length, curators_matched: 0, submissions_created: 0, skipped: 0 });
    }

    // --- 3. Existing submissions to de-duplicate ---
    const existingSubs = await base44.asServiceRole.entities.CuratorSubmission.list('-created_date', 500);
    const dupKey = new Set(existingSubs.map((s) => `${(s.curator_id || '')}|${(s.artist_name || '').toLowerCase().trim()}|${(s.song_title || '').toLowerCase().trim()}`));

    // --- 4. Match by genre and build submissions ---
    const toCreate = [];
    let skipped = 0;
    for (const song of paidSongs) {
      const songGenres = (song.genre || '').split(/[,\s/]+/).map((g) => g.trim()).filter(Boolean);
      for (const curator of curators) {
        const curatorGenres = (curator.genres || '').toLowerCase().split(',').map((g) => g.trim()).filter(Boolean);
        // Match if curator lists no genres (generalist) OR any genre overlaps
        const genreMatch = !curatorGenres.length || !songGenres.length || curatorGenres.some((g) => songGenres.some((s) => s.includes(g) || g.includes(s)));
        if (!genreMatch) continue;

        const key = `${curator.id}|${song.artist_name.toLowerCase().trim()}|${song.song_title.toLowerCase().trim()}`;
        if (dupKey.has(key)) { skipped++; continue; }
        dupKey.add(key);

        toCreate.push({
          curator_id: curator.id,
          curator_name: curator.name,
          artist_name: song.artist_name,
          song_title: song.song_title,
          audio_url: song.audio_url,
          genre: songGenres[0] || curatorGenres[0] || '',
          submitted_by_id: song.user_id || '',
          submitted_by_name: song.artist_name,
          fee_paid: curator.is_free ? 0 : (curator.submission_fee || 0),
          status: curator.auto_approve || autoCurators ? 'accepted' : 'pending',
          curator_review: curator.auto_approve || autoCurators ? 'Routed to curator — placement pending on their platform' : '',
        });
      }
    }

    const created = toCreate.length ? await base44.asServiceRole.entities.CuratorSubmission.bulkCreate(toCreate) : [];
    // Best-effort: email each routed curator on creation (background — never blocks the response).
    waitUntil(notifyCuratorsOfSubmission(base44, created).catch(() => {}));

    return Response.json({
      paid_songs: paidSongs.length,
      curators_matched: curators.length,
      submissions_created: created.length,
      skipped,
    });
  } catch (error) {
    console.error('auto-push-to-curators error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}