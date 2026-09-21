import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { applySideEffect } from '../../shared/approvalEffects.ts';

// Approve or reject a pending BatchSubmission and execute its side effect.
// Admins can decide any submission; the routed owner (provider/artist/licensing
// agency) can decide the ones routed to them.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { submission_id, action, notes } = body || {};
    if (!submission_id || !action) {
      return Response.json({ error: 'submission_id and action are required' }, { status: 400 });
    }
    if (!['approved', 'rejected'].includes(action)) {
      return Response.json({ error: 'action must be approved or rejected' }, { status: 400 });
    }

    const sub = await base44.asServiceRole.entities.BatchSubmission.get(String(submission_id));
    if (sub.status !== 'pending') {
      return Response.json({ error: 'Submission already decided', status: sub.status }, { status: 400 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = sub.owner_id && sub.owner_id === user.id;
    if (!isAdmin && !isOwner) {
      return Response.json({ error: 'Not authorized to decide this submission' }, { status: 403 });
    }

    await base44.asServiceRole.entities.BatchSubmission.update(String(submission_id), {
      status: action,
      approver_id: user.id,
      approver_name: user.full_name || '',
      notes: notes || '',
    });

    if (action === 'approved') {
      let extra = {};
      try { extra = sub.extra_data ? JSON.parse(sub.extra_data) : {}; } catch (e) {}
      try {
        await applySideEffect(base44, sub.feature_type, sub.reference_id, 'approved', extra);
      } catch (e) {
        console.log('side-effect failed:', e?.message || e);
      }
    }

    return Response.json({ success: true, status: action, submission_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}