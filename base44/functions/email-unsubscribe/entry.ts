import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Public unsubscribe — reached from the unsubscribe link inside every email.
// Marks the subscriber (and any matching business contact) opted_out so they
// are skipped by all future broadcasts. Keeps the record for de-duplication.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const email = (url.searchParams.get('email') || '').toLowerCase().trim();
    if (!email) return new Response('Missing email', { status: 400 });

    const subs = await base44.asServiceRole.entities.EmailSubscriber.filter({ email }, undefined, 1);
    if (subs.length) {
      await base44.asServiceRole.entities.EmailSubscriber.update(subs[0].id, { opted_out: true });
    }
    const biz = await base44.asServiceRole.entities.BusinessEmail.filter({ email }, undefined, 1);
    if (biz.length) {
      await base44.asServiceRole.entities.BusinessEmail.update(biz[0].id, { opted_out: true });
    }

    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
      `<body style="font-family:Arial,sans-serif;background:#0d0d12;color:#f5f1e6;text-align:center;padding:60px 20px">` +
      `<h2 style="color:#f7c948">You have been unsubscribed</h2>` +
      `<p>We're sorry to see you go. You will no longer receive Ride X emails at this address.</p>` +
      `</body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error: any) {
    return new Response('Error processing unsubscribe', { status: 500 });
  }
}