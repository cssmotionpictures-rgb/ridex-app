import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { autoApproveOn } from '../../shared/automation.ts';

// Auto-Promote auto-approve — approves every pending Auto-Promote submission
// whose 60-minute window has elapsed. Run on page load or on a schedule.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();
    const pending = await base44.asServiceRole.entities.CuratorSubmission.filter({ status: 'pending' });
    // Global automation on → approve ALL pending submissions instantly
    // (backstop for any created before the toggle took effect). Otherwise only
    // those whose 60-minute auto-approve window has elapsed.
    const autoCurators = await autoApproveOn(base44, 'auto_approve_curators');
    const due = autoCurators
      ? pending
      : pending.filter((s) => s.auto_approve_at && s.auto_approve_at <= now);

    if (!due.length) return Response.json({ approved: 0, checked: pending.length });

    await base44.asServiceRole.entities.CuratorSubmission.bulkUpdate(
      due.map((s) => ({ id: s.id, status: 'accepted', curator_review: 'Auto-approved by RIDE X Auto-Promote' }))
    );
    return Response.json({ approved: due.length, checked: pending.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}