import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { safeEmail } from '../../shared/safeIntegration.ts';

// Replacement guarantee — runs when an artist declines a booking.
// 1) Applies a reputation penalty to the declining artist (rejected count up,
//    acceptance rate down, premium placement revoked below 80%).
// 2) Voids the declining artist's pending earning for the booking.
// 3) Finds a same-tier, same-talent-type replacement artist and reassigns the
//    booking (auto-confirming if the replacement has auto-accept on).
// 4) If no replacement exists, cancels the booking and refunds the client's escrow.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const { booking_id } = await req.json().catch(() => ({}));
    if (!booking_id) return Response.json({ error: 'booking_id required' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.TalentBooking.get(booking_id);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    if (booking.status === 'cancelled') return Response.json({ error: 'Booking already cancelled' }, { status: 400 });

    const declining = await base44.asServiceRole.entities.TalentArtist.get(booking.artist_id).catch(() => null);

    // 1) Reputation penalty on the declining artist
    if (declining) {
      const total = declining.total_bookings || 0;
      const rejected = (declining.rejected_bookings || 0) + 1;
      const accepted = Math.max(0, total - rejected);
      const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 100;
      const patch = {
        rejected_bookings: rejected,
        acceptance_rate: acceptanceRate,
        premium_placement: acceptanceRate >= 80 ? (declining.premium_placement || false) : false,
        rating: acceptanceRate < 80 ? Math.max(0, (declining.rating || 5) - 0.5) : (declining.rating || 5),
      };
      await base44.asServiceRole.entities.TalentArtist.update(declining.id, patch).catch((e) => console.error('penalty update failed:', e.message));
    }

    // 2) Void the declining artist's pending earning for this booking
    const oldEarnings = await base44.asServiceRole.entities.TalentEarning.filter({ booking_id: booking.id });
    for (const e of oldEarnings) {
      if (e.status === 'pending') {
        await base44.asServiceRole.entities.TalentEarning.delete(e.id).catch(() => {});
      }
    }

    // 3) Find a replacement — same talent_type + same tier, active, exclude declining artist
    let replacement = null;
    if (declining) {
      const candidates = await base44.asServiceRole.entities.TalentArtist.filter({
        talent_type: booking.talent_type, status: 'active',
      });
      replacement = candidates
        .filter((a) => a.id !== declining.id && a.tier === declining.tier)
        .sort((a, b) => (b.auto_accept_enabled ? 1 : 0) - (a.auto_accept_enabled ? 1 : 0) || (b.rating || 0) - (a.rating || 0))[0];
    }

    if (replacement) {
      const newStatus = replacement.auto_accept_enabled ? 'confirmed' : 'pending';
      await base44.asServiceRole.entities.TalentBooking.update(booking.id, {
        artist_id: replacement.id,
        artist_name: replacement.stage_name || replacement.full_name || '',
        status: newStatus,
        escrow_status: 'held',
      });
      await base44.asServiceRole.entities.TalentEarning.create({
        artist_id: replacement.id,
        artist_name: replacement.stage_name || replacement.full_name || '',
        booking_id: booking.id,
        amount: booking.artist_earnings,
        status: 'pending',
      });
      await base44.asServiceRole.entities.TalentArtist.update(replacement.id, {
        total_bookings: (replacement.total_bookings || 0) + 1,
      });
      if (replacement.user_id) {
        try {
          const users = await base44.asServiceRole.entities.User.filter({ id: replacement.user_id });
          const au = users && users[0];
          if (au && au.email) {
            await safeEmail(base44, {
              to: au.email,
              subject: `🎤 Replacement booking — ${replacement.stage_name}`,
              body: `Hi ${replacement.stage_name},\n\nA booking for ${booking.event_type} on ${booking.event_date} was reassigned to you after the original artist declined.\n\nYour earnings (80%): \u20a6${(booking.artist_earnings || 0).toLocaleString()}\n\n${newStatus === 'confirmed' ? 'Auto-confirmed.' : 'Confirm in your Ride X artist dashboard within 24 hours.'}\n\nRide X Team`,
            });
          }
        } catch (e) { console.error('replacement email failed:', e.message); }
      }
      return Response.json({ replaced: true, replacement_artist: replacement.stage_name || replacement.full_name });
    }

    // 4) No replacement — cancel and refund
    await base44.asServiceRole.entities.TalentBooking.update(booking.id, {
      status: 'cancelled',
      escrow_status: 'refunded',
    });
    return Response.json({ replaced: false });
  } catch (error) {
    console.error('reassign-talent-booking error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}