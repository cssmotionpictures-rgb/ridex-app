import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Records a completed sponsor-ad play: decrements the sponsor's remaining
// budget, increments plays/revenue, auto-expires when the budget runs out,
// and logs an AdEvent for revenue reporting. Runs as the service role so
// anonymous app users can report plays without write permissions on the
// SponsorAd entity.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const adId = (body?.ad_id || body?.adId || '').toString();
    if (!adId) return Response.json({ error: 'ad_id required' }, { status: 400 });

    const ad = await base44.asServiceRole.entities.SponsorAd.get(adId).catch(() => null);
    if (!ad) return Response.json({ error: 'Sponsor ad not found' }, { status: 404 });
    if (ad.status !== 'active') return Response.json({ ok: true, skipped: 'not active' });

    const price = Number(ad.price_per_play) || 0;
    const remaining = Math.max(0, (Number(ad.remaining_budget) || Number(ad.budget) || 0) - price);

    const update: any = {
      plays: (Number(ad.plays) || 0) + 1,
      revenue: (Number(ad.revenue) || 0) + price,
      remaining_budget: remaining,
    };
    if (remaining <= 0) update.status = 'expired';

    await base44.asServiceRole.entities.SponsorAd.update(adId, update);

    await base44.asServiceRole.entities.AdEvent.create({
      ad_type: 'rewarded',
      event: 'complete',
      movie_title: `Sponsor: ${ad.sponsor || ad.name}`,
      revenue: price,
      settled_to_opay: true,
    }).catch(() => {});

    return Response.json({ ok: true, revenue: price, remaining_budget: remaining });
  } catch (error) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}