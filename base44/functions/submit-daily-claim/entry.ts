import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Server-authoritative daily reward claim for "The Forgotten Ones".
// The client can request a daily claim; the SERVER validates that the
// player hasn't already claimed today, recomputes the streak-based reward,
// and atomically updates the profile. The client never writes SP directly.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Lagos timezone "today" (UTC+1) — matches the app's user timezone.
    const now = new Date();
    const lagos = new Date(now.getTime() + 60 * 60 * 1000);
    const today = lagos.toISOString().slice(0, 10);

    const profiles = await base44.entities.GameProfile.filter({ created_by_id: user.id });
    if (!profiles || !profiles.length)
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profile = profiles[0];

    // --- idempotency: already claimed today? ---
    if (profile.last_daily_claim === today)
      return Response.json({ ok: false, error: 'Already claimed today' }, { status: 200 });

    // --- streak-based reward (mirrors useGameProfile claimDaily) ---
    const streak = profile.login_streak || 1;
    const reward = 50 + Math.min(streak * 5, 100);

    await base44.entities.GameProfile.update(profile.id, {
      spirit_points: (profile.spirit_points || 0) + reward,
      last_daily_claim: today,
    });

    return Response.json({
      ok: true,
      reward,
      spiritPoints: (profile.spirit_points || 0) + reward,
      streak,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}