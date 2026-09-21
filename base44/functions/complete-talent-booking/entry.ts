import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Complete a talent booking — releases escrow to the artist.
// Only the client who booked (or an admin) can confirm completion.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const { booking_id } = b;
    if (!booking_id) return Response.json({ error: 'booking_id required' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.TalentBooking.get(booking_id);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    if (booking.client_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Only the client can confirm completion' }, { status: 403 });
    }

    await base44.asServiceRole.entities.TalentBooking.update(booking_id, {
      status: 'completed',
      escrow_status: 'released',
    });

    const earnings = await base44.asServiceRole.entities.TalentEarning.filter({ booking_id });
    for (const e of earnings) {
      await base44.asServiceRole.entities.TalentEarning.update(e.id, {
        status: 'paid',
        paid_at: new Date().toISOString(),
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('complete-talent-booking error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}