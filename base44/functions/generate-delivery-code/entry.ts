import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from '../../shared/safeIntegration.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const logistics_id = body?.logistics_id;
    if (!logistics_id) return Response.json({ error: 'logistics_id is required' }, { status: 400 });

    const record = await base44.asServiceRole.entities.LogisticsRequest.get(logistics_id);
    if (!record) return Response.json({ error: 'Delivery not found' }, { status: 404 });
    if (record.created_by_id && record.created_by_id !== user.id) {
      return Response.json({ error: 'Only the booker can generate the delivery code' }, { status: 403 });
    }

    const receiver_email = (record.receiver_email || user.email || '').trim();
    if (!receiver_email) return Response.json({ error: 'No receiver email on file' }, { status: 400 });

    // Generate a 6-digit confirmation code.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await base44.asServiceRole.entities.LogisticsRequest.update(logistics_id, { delivery_code: code });

    // Email the code to the receiver (registered app users only).
    let emailed = false;
    let email_error = null;
    try {
      await safeEmail(base44, {
        to: receiver_email,
        subject: `RIDE X delivery code for ${record.tracking_number || logistics_id}`,
        body:
          `Hello,\n\nYour package is on the way with RIDE X Logistics!\n\n` +
          `Tracking number: ${record.tracking_number || logistics_id}\n` +
          `Track it live any time at: https://ridex-all-go.base44.app/track?number=${record.tracking_number || logistics_id}\n` +
          `Delivery address: ${record.delivery_address || ''}\n\n` +
          `Your delivery confirmation code is: ${code}\n\n` +
          `Please give this code to the driver when your package arrives. The driver will enter it to confirm delivery.\n\n` +
          `Thank you for using RIDE X.`
      });
      emailed = true;
    } catch (e) {
      email_error = e?.message || String(e);
    }

    return Response.json({
      ok: true,
      emailed,
      email_error,
      receiver_email,
      code: emailed ? undefined : code
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}