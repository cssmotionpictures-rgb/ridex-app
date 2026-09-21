import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findOfficialEmailCached, sendDirectEmail, esc } from "../../shared/officialEmailSearch.ts";
import { autoApproveOn } from '../../shared/automation.ts';

// Auto-Submit to Talent — runs after a client pays to book an artist.
// Creates the booking (escrow held), creates a pending earning for the
// artist (80%), increments the artist's booking count, auto-confirms if the
// artist has auto-accept enabled, and best-effort emails the artist.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const { artist_id, event_type, event_date, event_time, duration_hours, project_details, promoter_company, rider_committed } = b;
    if (!artist_id || !event_date) return Response.json({ error: 'artist_id and event_date required' }, { status: 400 });

    const artist = await base44.asServiceRole.entities.TalentArtist.get(artist_id);
    if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 });

    const price = Number(artist.booking_price) || 0;
    const artist_earnings = Math.round(price / 1.2);
    const platform_commission = price - artist_earnings;
    // Global automation on → always auto-confirm the booking (100% success),
    // even for artists without the per-profile auto-accept flag.
    const autoTalent = await autoApproveOn(base44, 'auto_approve_talent');
    const status = artist.auto_accept_enabled || autoTalent ? 'confirmed' : 'pending';

    const booking = await base44.entities.TalentBooking.create({
      client_id: user.id,
      client_name: user.full_name || '',
      artist_id,
      artist_name: artist.stage_name || artist.full_name || '',
      talent_type: artist.talent_type,
      event_type: event_type || 'concert',
      event_date,
      event_time: event_time || '',
      duration_hours: Number(duration_hours) || 1,
      project_details: project_details || '',
      promoter_company: promoter_company || '',
      rider_committed: !!rider_committed,
      price,
      platform_commission,
      artist_earnings,
      status,
      escrow_status: 'held',
    });

    await base44.asServiceRole.entities.TalentEarning.create({
      artist_id,
      artist_name: booking.artist_name,
      booking_id: booking.id,
      amount: artist_earnings,
      status: 'pending',
    });

    await base44.asServiceRole.entities.TalentArtist.update(artist_id, {
      total_bookings: (artist.total_bookings || 0) + 1,
    });

    // DIRECT DELIVERY to the artist's real inbox — their linked user account
    // email first; for catalog-only artists, a live web search finds their
    // official booking contact (cached on the artist profile so each artist
    // is only searched once). Sent through the app's own email channel.
    let artistEmail = '';
    if (artist.user_id) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id: artist.user_id });
        artistEmail = (users && users[0]?.email) || '';
      } catch {}
    }
    if (!artistEmail) artistEmail = (artist.contact_email || '').trim();
    if (!artistEmail) {
      const found = await findOfficialEmailCached(
        base44,
        `talent:${artist_id}`,
        `the official booking contact email address of ${booking.artist_name}, a Nigerian ${artist.talent_type || 'performing artist'}`
      ).catch(() => null);
      if (found?.email) {
        artistEmail = found.email;
        await base44.asServiceRole.entities.TalentArtist.update(artist_id, { contact_email: artistEmail }).catch(() => {});
      }
    }
    if (artistEmail) {
      try {
        const rowHtml = (label, value) =>
          `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;white-space:nowrap">${esc(label)}</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(value)}</td></tr>`;
        const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto">
          <div style="background:#0d0d12;padding:16px 20px;border-radius:12px 12px 0 0">
            <p style="margin:0;color:#f7c948;font-weight:bold">RIDE X TALENT</p>
            <p style="margin:4px 0 0;color:#9ca3af;font-size:12px">A new booking request was submitted to you</p>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 20px">
            <p style="font-size:15px;margin:0 0 4px">Hi ${esc(booking.artist_name)},</p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${esc(user.full_name || 'A client')} booked you for a ${esc(event_type || 'performance')} through the Ride X talent agency${status === 'confirmed' ? ' — the booking is auto-confirmed and payment is held in escrow' : ''}.</p>
            <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:14px">
              ${rowHtml('Event date', event_date)}
              ${event_time ? rowHtml('Event time', event_time) : ''}
              ${rowHtml('Duration', Number(duration_hours || 1) + ' hour(s)')}
              ${promoter_company ? rowHtml('Promoter / company', promoter_company) : ''}
              ${rowHtml('Client', user.full_name || '—')}
              ${rowHtml('Booking fee', '₦' + Number(price || 0).toLocaleString('en-NG'))}
              ${rowHtml('Your earnings (net of 20% agency commission)', '₦' + Number(artist_earnings || 0).toLocaleString('en-NG'))}
            </table>
            <p style="font-size:13px;font-weight:bold;margin:0 0 6px">Project details</p>
            <div style="font-size:13px;line-height:1.65;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fafafa">${esc(project_details || '—')}</div>
            <p style="font-size:12px;color:#6b7280;margin:14px 0 0">${status === 'confirmed' ? 'Confirm production details with the client directly.' : 'Confirm this booking in your Ride X artist dashboard within 24 hours.'}</p>
          </div>
        </body></html>`;
        const res = await sendDirectEmail({
          to: artistEmail,
          subject: `New booking — ${booking.artist_name}`,
          body: html,
          from_name: "RIDE X Talent",
        });
        if (!res.ok) throw new Error(res.error || 'email failed');
      } catch (e) {
        console.error('talent artist email failed:', e.message);
      }
    }

    return Response.json({ booking, auto_confirmed: status === 'confirmed' });
  } catch (error) {
    console.error('auto-submit-talent-booking error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}