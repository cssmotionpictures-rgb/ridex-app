import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from '../../shared/safeIntegration.ts';
import { applySideEffect, approverTypeFor, AUTO_APPROVED } from '../../shared/approvalEffects.ts';
import { anyAutoApproveOn } from '../../shared/automation.ts';

const NGN = (n) => Number(n || 0).toLocaleString();

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { feature_type, reference_id, title, amount, owner_id, owner_name, extra_data } = body || {};
    if (!feature_type || !title) {
      return Response.json({ error: 'feature_type and title are required' }, { status: 400 });
    }

    const refId = reference_id ? String(reference_id) : '';
    const approverType = approverTypeFor(feature_type);
    let isAuto = approverType === 'auto';
    // Global automation: when any platform auto-approve toggle is on, every
    // submission across every section auto-approves instantly — no human queue.
    if (!isAuto) isAuto = await anyAutoApproveOn(base44);
    const extra = extra_data || {};

    // Resolve the human approver for non-auto features.
    let resolvedOwnerId = owner_id || '';
    let resolvedOwnerName = owner_name || '';
    if (!isAuto) {
      if (feature_type === 'song_license') {
        try {
          const agencies = await base44.asServiceRole.entities.LicensingAgency.list();
          const agency = agencies.find((a) => a.status === 'active') || agencies[0];
          if (agency) {
            resolvedOwnerId = agency.user_id || '';
            resolvedOwnerName = agency.agency_name || 'Licensing Agency';
          }
        } catch (e) {}
      } else if (feature_type === 'collaboration' && refId) {
        try {
          const c = await base44.asServiceRole.entities.Collaboration.get(refId);
          resolvedOwnerId = c.provider_id || '';
          resolvedOwnerName = c.provider_name || '';
        } catch (e) {}
      } else if (feature_type === 'fan_club' && refId) {
        try {
          const fc = await base44.asServiceRole.entities.FanClub.get(refId);
          resolvedOwnerId = fc.creator_id || '';
          resolvedOwnerName = fc.artist_name || '';
        } catch (e) {}
      }
    }

    const status = isAuto ? 'approved' : 'pending';
    const submission = await base44.asServiceRole.entities.BatchSubmission.create({
      feature_type,
      approver_type: approverType,
      reference_id: refId,
      title,
      submitter_id: user.id,
      submitter_name: user.full_name || '',
      owner_id: resolvedOwnerId,
      owner_name: resolvedOwnerName,
      amount: Number(amount) || 0,
      status,
      approver_id: isAuto ? 'system' : '',
      approver_name: isAuto ? 'Auto-approved' : '',
      notes: '',
      extra_data: extra && typeof extra === 'object' ? JSON.stringify({ ...extra, user_id: extra.user_id || user.id }) : '',
    });

    // Auto-approved features activate instantly.
    if (isAuto) {
      try {
        const enrichedExtra = { ...(extra || {}), user_id: (extra && extra.user_id) || user.id };
        await applySideEffect(base44, feature_type, refId, 'approved', enrichedExtra);
      } catch (e) {
        console.log('auto side-effect failed:', e?.message || e);
      }
    }

    // Email notification to the routed approver (or all admins when admin-routed).
    let emailed = false;
    if (!isAuto) {
      const appUrl = 'https://app.ridex.com';
      const featureLabel = feature_type.replace(/_/g, ' ');
      try {
        if (resolvedOwnerId) {
          const owner = await base44.asServiceRole.entities.User.get(resolvedOwnerId);
          if (owner && owner.email) {
            let subject = `🔔 New Submission Requires Your Approval — ${feature_type}`;
            let bodyText = '';
            if (approverType === 'licensing_agency') {
              subject = `🎵 New Song License Request — Action Required`;
              bodyText = `Dear ${resolvedOwnerName},\n\nA new song license request has been submitted and requires your approval.\n\nSong Title: ${title}\nRequested By: ${user.full_name || '—'}\nAmount: NGN ${NGN(amount)}\n\nReview and approve/reject in the Ride X app:\n${appUrl}/approvals\n\n— Ride X Team`;
            } else if (approverType === 'provider') {
              subject = `📋 New Booking Request — Action Required`;
              bodyText = `Dear ${resolvedOwnerName},\n\nA new booking request has been submitted for your service.\n\nService: ${title}\nBooking By: ${user.full_name || '—'}\nAmount: NGN ${NGN(amount)}\n\nLog in to review and accept/reject:\n${appUrl}/approvals\n\n— Ride X Team`;
            } else if (approverType === 'artist') {
              subject = `🎤 New Fan Club Membership Request`;
              bodyText = `Dear ${resolvedOwnerName},\n\nA fan has requested to join your fan club.\n\nFan: ${user.full_name || '—'}\nFan Club: ${title}\nAmount: NGN ${NGN(amount)}\n\nLog in to review and approve/reject:\n${appUrl}/approvals\n\n— Ride X Team`;
            } else {
              bodyText = `Dear Admin,\n\nA new submission requires your approval.\n\nFeature: ${feature_type}\nTitle: ${title}\nSubmitter: ${user.full_name || '—'}\nAmount: NGN ${NGN(amount)}\n\nReview: ${appUrl}/approvals\n\n— Ride X Team`;
            }
            await safeEmail(base44, { to: owner.email, subject, body: bodyText });
            emailed = true;
          }
        } else {
          // Admin-routed: notify all admin users.
          const admins = await base44.asServiceRole.entities.User.list();
          const subject = `🔔 New Submission Requires Your Approval — ${feature_type}`;
          const bodyText = `Dear Admin,\n\nA new submission requires your approval.\n\nFeature: ${feature_type}\nTitle: ${title}\nSubmitter: ${user.full_name || '—'}\nAmount: NGN ${NGN(amount)}\n\nReview: ${appUrl}/approvals\n\n— Ride X Team`;
          for (const a of admins.filter((u) => u.role === 'admin' && u.email)) {
            try { await safeEmail(base44, { to: a.email, subject, body: bodyText }); emailed = true; } catch (e) {}
          }
        }
      } catch (e) {
        // Email only reaches registered users; failures fall back to the in-app queue.
      }
    }

    return Response.json({
      success: true,
      submission_id: submission.id,
      emailed,
      approver_type: approverType,
      message: isAuto ? 'Auto-approved and activated' : 'Submission created and routed for approval',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}