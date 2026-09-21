import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Respond to an Influencer Match — accept or reject.
// Accept: marks match accepted, creates an InfluencerEarning (80% of submission fee),
// updates the influencer's total_earnings, and sets the submission "live".
// Reject: marks match rejected with optional feedback.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { match_id, action, feedback } = body;
    if (!match_id) return Response.json({ error: 'match_id required' }, { status: 400 });
    if (!['accept', 'reject'].includes(action)) return Response.json({ error: 'action must be accept or reject' }, { status: 400 });

    const match = await base44.entities.InfluencerMatch.get(match_id);
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const inf = await base44.entities.Influencer.get(match.influencer_id);
    if (!inf || inf.user_id !== user.id) return Response.json({ error: 'You can only respond to your own matches' }, { status: 403 });

    const now = new Date().toISOString();

    if (action === 'accept') {
      await base44.entities.InfluencerMatch.update(match_id, { status: 'accepted', responded_at: now });

      const submission = await base44.asServiceRole.entities.InfluencerSubmission.get(match.submission_id).catch(() => null);
      const amount = Math.round((submission?.price || 0) * 0.8);

      await base44.entities.InfluencerEarning.create({
        influencer_id: inf.id,
        influencer_name: inf.full_name || inf.username,
        submission_id: match.submission_id,
        submission_title: match.submission_title || submission?.title || '',
        amount,
        status: 'pending',
      });

      await base44.entities.Influencer.update(inf.id, { total_earnings: (inf.total_earnings || 0) + amount });

      if (submission) {
        await base44.asServiceRole.entities.InfluencerSubmission.update(submission.id, { status: 'live' });
      }

      return Response.json({ ok: true, earned: amount });
    }

    await base44.entities.InfluencerMatch.update(match_id, { status: 'rejected', responded_at: now, feedback: feedback || '' });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('respond-influencer-match error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}