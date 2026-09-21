import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Auto-Promote reject — a curator rejects a submission within the 60-minute window.
// The curator is penalized (rejection_count++, Boost/auto_approve revoked) and a
// standby replacement curator is assigned to the same batch.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const { submission_id } = b;
    if (!submission_id) return Response.json({ error: 'submission_id required' }, { status: 400 });

    const sub = await base44.asServiceRole.entities.CuratorSubmission.get(submission_id);
    if (!sub) return Response.json({ error: 'submission not found' }, { status: 404 });
    if (sub.status !== 'pending') return Response.json({ error: 'submission not pending' }, { status: 400 });

    const AUTO_MS = 60 * 60 * 1000;
    const created = new Date(sub.created_date).getTime();
    if (Date.now() - created >= AUTO_MS) {
      return Response.json({ error: 'Auto-approval timer expired. Track is locked.' }, { status: 400 });
    }

    // Penalize curator
    const curator = await base44.asServiceRole.entities.Curator.get(sub.curator_id);
    if (curator) {
      await base44.asServiceRole.entities.Curator.update(sub.curator_id, {
        rejection_count: (curator.rejection_count || 0) + 1,
        auto_approve: false,
      });
    }

    await base44.asServiceRole.entities.CuratorSubmission.update(submission_id, {
      status: 'rejected',
      curator_review: 'Rejected by curator — replacement assigned',
    });

    // Find a replacement curator not already in this batch
    const batchSubs = await base44.asServiceRole.entities.CuratorSubmission.filter({ promote_batch_id: sub.promote_batch_id || '' });
    const usedIds = new Set(batchSubs.map((s) => s.curator_id));
    const candidates = (await base44.asServiceRole.entities.Curator.filter({ status: 'approved' }))
      .filter((c) => !usedIds.has(c.id))
      .sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));

    let replacement = null;
    if (candidates.length) {
      const c = candidates[0];
      replacement = await base44.entities.CuratorSubmission.create({
        curator_id: c.id,
        curator_name: c.name,
        artist_name: sub.artist_name,
        song_title: sub.song_title,
        audio_url: sub.audio_url,
        genre: sub.genre,
        submitted_by_id: sub.submitted_by_id,
        submitted_by_name: sub.submitted_by_name,
        fee_paid: 0,
        status: 'pending',
        auto_approve_at: sub.auto_approve_at,
        match_score: 0,
        track_bpm: sub.track_bpm || 0,
        track_key: sub.track_key || '',
        is_standby: true,
        promote_batch_id: sub.promote_batch_id || '',
        curator_review: 'Standby replacement',
      });
    }

    return Response.json({
      success: true,
      rejected: sub.curator_name,
      replacement: replacement ? replacement.curator_name : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}