import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from "../../shared/safeIntegration.ts";

// Admin replies to a curator's out-of-band response. Saves the reply on the
// submission (curator_reply + replied_at) and attempts email delivery to the
// curator's address. NOTE: the platform email integration always reaches
// registered app users; a curator that is NOT a registered user only succeeds
// on a paid plan with the app enabled for external email. The honest delivery
// result is returned so the admin knows whether it actually went out.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const submissionId = body?.submission_id;
    const message = (body?.message || '').trim();
    if (!submissionId) return Response.json({ error: 'submission_id required' }, { status: 400 });
    if (!message) return Response.json({ error: 'message required' }, { status: 400 });

    const sub = await base44.asServiceRole.entities.CuratorSubmission.get(submissionId).catch(() => null);
    if (!sub) return Response.json({ error: 'submission not found' }, { status: 404 });

    const curator = sub.curator_id
      ? await base44.asServiceRole.entities.Curator.get(sub.curator_id).catch(() => null)
      : null;
    const curatorEmail = curator?.email || '';

    const senderName = user.full_name || 'RIDE X Admin';
    const subject = `RIDE X — Reply re: "${sub.song_title || 'your submission'}" for ${sub.curator_name || curator?.name || 'curator'}`;
    const text =
      `Hi ${curator?.name || sub.curator_name || 'Curator'},\n\n` +
      `Thank you for your response on the submission below.\n\n` +
      `Artist: ${sub.artist_name || '—'}\n` +
      `Song: ${sub.song_title || '—'}\n` +
      `Genre: ${sub.genre || '—'}\n` +
      `Audio: ${sub.audio_url || '—'}\n\n` +
      `Your response on file:\n${sub.curator_reply || '(none logged)'}\n\n` +
      `--- Our reply ---\n${message}\n--- End reply ---\n\n` +
      `Best regards,\n${senderName}\nRIDE X · www.ridexongo.com`;

    let delivery = 'no_email';
    let deliveryError = '';
    if (curatorEmail) {
      try {
        const _e = await safeEmail(base44, { to: curatorEmail, subject, body: text, from_name: senderName });
        if (_e.ok) {
          delivery = 'sent';
        } else {
          delivery = 'failed';
          deliveryError = (_e.error || 'failed').slice(0, 300);
        }
      } catch (e) {
        delivery = 'failed';
        deliveryError = (e?.message || 'failed').slice(0, 300);
      }
    }

    await base44.asServiceRole.entities.CuratorSubmission.update(submissionId, {
      curator_reply: message,
      replied_at: new Date().toISOString(),
    }).catch(() => {});

    return Response.json({
      ok: true,
      submission_id: submissionId,
      curator_email: curatorEmail || null,
      delivery,
      delivery_error: deliveryError,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}