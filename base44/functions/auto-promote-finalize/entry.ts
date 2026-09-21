import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { waitUntil } from 'base44:runtime';
import { autoApproveOn } from '../../shared/automation.ts';
import { notifyCuratorsOfSubmission } from '../../shared/curatorEmail.ts';

// Auto-Promote finalize — runs after Paystack payment succeeds.
// Creates one pending CuratorSubmission per matched curator, each auto-approving
// 60 minutes later unless the curator rejects first.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const { track, matched } = b;
    if (!track || !track.title || !Array.isArray(matched) || !matched.length) {
      return Response.json({ error: 'track and matched required' }, { status: 400 });
    }

    const PER_CURATOR = 40000;
    const AUTO_MINUTES = 60;
    // Global automation on → every curator submission auto-approves instantly
    // (no 60-minute window), for a 100% success rate across the curator section.
    const autoCurators = await autoApproveOn(base44, 'auto_approve_curators');
    const batch_id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const approveAt = autoCurators
      ? new Date().toISOString()
      : new Date(Date.now() + AUTO_MINUTES * 60 * 1000).toISOString();

    const toCreate = matched.map((m) => ({
      curator_id: m.id,
      curator_name: m.name,
      artist_name: track.artist || '',
      song_title: track.title,
      audio_url: track.audio_url || '',
      genre: Array.isArray(track.genres) ? track.genres.join(', ') : (track.genres || ''),
      submitted_by_id: user.id,
      submitted_by_name: user.full_name || '',
      fee_paid: PER_CURATOR,
      status: autoCurators ? 'accepted' : 'pending',
      auto_approve_at: autoCurators ? undefined : approveAt,
      match_score: m.score || 0,
      track_bpm: Number(track.bpm) || 0,
      track_key: track.key || '',
      is_standby: !!m.is_standby,
      promote_batch_id: batch_id,
      curator_review: autoCurators ? 'Routed to curator — placement pending on their platform' : '',
    }));

    const created = await base44.entities.CuratorSubmission.bulkCreate(toCreate);
    // Best-effort: email each routed curator on creation (background — never blocks the response).
    waitUntil(notifyCuratorsOfSubmission(base44, created).catch(() => {}));
    return Response.json({ batch_id, created: created.length, auto_approve_at: approveAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}