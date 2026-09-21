import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const BONUS_TIERS = [
  { tier: 'Bronze', customers: 5, drivers: 2, bonus: 10000 },
  { tier: 'Silver', customers: 15, drivers: 5, bonus: 40000 },
  { tier: 'Gold', customers: 50, drivers: 15, bonus: 100000 },
  { tier: 'Platinum', customers: 100, drivers: 30, bonus: 250000 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const rideId = (body?.ride_id || '').toString();
    if (!rideId) return Response.json({ error: 'ride_id required' }, { status: 400 });

    const ride = await base44.asServiceRole.entities.Ride.get(rideId).catch(() => null);
    if (!ride) return Response.json({ error: 'Ride not found' }, { status: 404 });
    if (ride.status !== 'completed') return Response.json({ ok: true, skipped: 'not completed' });

    const fare = ride.accepted_amount || ride.offer_amount || 0;
    const PLATFORM_COMMISSION = 0.10; // Ride X's 10% platform commission — all referral earnings come from this
    const results: any[] = [];
    const touchedReferrers = new Set<string>();

    // --- Customer side: 10% of first 5 rides within 60 days ---
    if (ride.created_by_id) {
      const custLinks = await base44.asServiceRole.entities.ReferralCustomer.filter({ customer_id: ride.created_by_id }, '-created_date', 5);
      const link = custLinks[0];
      if (link && link.status === 'active') {
        const ageDays = (Date.now() - new Date(link.created_date).getTime()) / 86400000;
        if (ageDays <= 60 && link.rides_completed < 5) {
          const referrer = await base44.asServiceRole.entities.Referrer.get(link.referrer_id).catch(() => null);
          if (referrer && referrer.status === 'approved') {
            const rate = referrer.custom_rates ? (referrer.commission_customer ?? 0.10) : 0.10;
            const amt = round2(fare * PLATFORM_COMMISSION * rate); // 10% of Ride X's 10%
            if (amt > 0) {
              await base44.asServiceRole.entities.ReferralCommission.create({
                referrer_id: referrer.id, type: 'customer', reference_id: ride.id, amount: amt, status: 'pending',
                description: `Customer ride ${ride.id.slice(0, 6)}`,
              });
              await base44.asServiceRole.entities.ReferralCustomer.update(link.id, {
                commission_earned: round2((link.commission_earned || 0) + amt),
                rides_completed: (link.rides_completed || 0) + 1,
              });
              await base44.asServiceRole.entities.Referrer.update(referrer.id, {
                pending_payout: round2((referrer.pending_payout || 0) + amt),
                total_earnings: round2((referrer.total_earnings || 0) + amt),
              });
              touchedReferrers.add(referrer.id);
              results.push({ customer: amt });
            }
          }
        }
      }
    }

    // --- Driver side: 15% of first-month driver earnings ---
    if (ride.driver_id) {
      const driver = await base44.asServiceRole.entities.Driver.get(ride.driver_id).catch(() => null);
      if (driver && driver.created_by_id) {
        const custLinks = await base44.asServiceRole.entities.ReferralCustomer.filter({ customer_id: driver.created_by_id }, '-created_date', 5);
        const custLink = custLinks[0];
        if (custLink) {
          const drvLinks = await base44.asServiceRole.entities.ReferralDriver.filter({ driver_id: ride.driver_id }, '-created_date', 5);
          let drvLink = drvLinks[0];
          if (!drvLink) {
            drvLink = await base44.asServiceRole.entities.ReferralDriver.create({
              referrer_id: custLink.referrer_id, driver_id: ride.driver_id, driver_name: driver.full_name, driver_phone: driver.phone,
              referral_code: custLink.referral_code, commission_earned: 0, rides_completed: 0, status: 'active',
              first_month_end: new Date(Date.now() + 30 * 86400000).toISOString(),
            });
            const r = await base44.asServiceRole.entities.Referrer.get(custLink.referrer_id).catch(() => null);
            if (r) await base44.asServiceRole.entities.Referrer.update(custLink.referrer_id, { total_drivers: (r.total_drivers || 0) + 1 });
          }
          const within = !drvLink.first_month_end || new Date() <= new Date(drvLink.first_month_end);
          if (within) {
            const referrer = await base44.asServiceRole.entities.Referrer.get(drvLink.referrer_id).catch(() => null);
            if (referrer && referrer.status === 'approved') {
              const rate = referrer.custom_rates ? (referrer.commission_driver ?? 0.15) : 0.15;
              const amt = round2(fare * PLATFORM_COMMISSION * rate); // 15% of Ride X's 10%
              if (amt > 0) {
                await base44.asServiceRole.entities.ReferralCommission.create({
                  referrer_id: referrer.id, type: 'driver', reference_id: ride.id, amount: amt, status: 'pending',
                  description: `Driver ride ${ride.id.slice(0, 6)}`,
                });
                await base44.asServiceRole.entities.ReferralDriver.update(drvLink.id, {
                  commission_earned: round2((drvLink.commission_earned || 0) + amt),
                  rides_completed: (drvLink.rides_completed || 0) + 1,
                });
                await base44.asServiceRole.entities.Referrer.update(referrer.id, {
                  pending_payout: round2((referrer.pending_payout || 0) + amt),
                  total_earnings: round2((referrer.total_earnings || 0) + amt),
                });
                touchedReferrers.add(referrer.id);
                results.push({ driver: amt });
              }
            }
          }
        }
      }
    }

    // --- Bonus tier check for touched referrers ---
    for (const rid of touchedReferrers) {
      const r = await base44.asServiceRole.entities.Referrer.get(rid).catch(() => null);
      if (!r || r.status !== 'approved') continue;
      const custs = r.total_customers || 0;
      const drvs = r.total_drivers || 0;
      const achieved = BONUS_TIERS.filter((t) => custs >= t.customers || drvs >= t.drivers);
      const top = achieved[achieved.length - 1];
      if (top && r.bonus_tier !== top.tier) {
        await base44.asServiceRole.entities.ReferralCommission.create({
          referrer_id: r.id, type: 'bonus', reference_id: '', amount: top.bonus, status: 'pending',
          description: `${top.tier} tier bonus`,
        });
        await base44.asServiceRole.entities.Referrer.update(r.id, {
          bonus_tier: top.tier,
          pending_payout: round2((r.pending_payout || 0) + top.bonus),
          total_earnings: round2((r.total_earnings || 0) + top.bonus),
        });
        results.push({ bonus: top.tier });
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}