import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// One-off maintenance: reset every influencer's booking_price to 0 so the
// realistic tier-based flat fees in src/pages/Influencers.jsx (INF_FEE) apply.
// The old per-follower pricing produced absurd values (e.g. ₦5.3B for Ronaldo)
// and is no longer used. Admin-only — invoke once from the dashboard.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const all = await base44.asServiceRole.entities.Influencer.list('-follower_count', 500);
    const toReset = all.filter((i) => Number(i.booking_price) !== 0);
    const updates = toReset.map((i) => ({ id: i.id, booking_price: 0 }));

    let updated = 0;
    for (let i = 0; i < updates.length; i += 100) {
      await base44.asServiceRole.entities.Influencer.bulkUpdate(updates.slice(i, i + 100));
      updated += Math.min(100, updates.length - i);
    }

    return Response.json({ updated, total: all.length, note: 'All booking prices reset to 0 — tier flat fees now apply.' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}