import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Auto-Create Weekly Competitions — admin-only.
// Creates two competitions for the current ISO week if they don't already exist:
//   1) Predict & Win (points-based sports prediction leaderboard)
//   2) Fan Contest (themed community contest with voting)
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    // ISO week key (e.g. 2026-W33)
    const now = new Date();
    const year = now.getUTCFullYear();
    const tmp = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    const weekKey = `${year}-W${String(week).padStart(2, '0')}`;

    // Check existing competitions for this week
    const existing = await base44.asServiceRole.entities.Competition.filter({ week_key: weekKey });
    const havePredict = existing.some((c) => c.competition_type === 'predict_win');
    const haveFan = existing.some((c) => c.competition_type === 'fan_contest');

    const startDate = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()));
    const endDate = new Date(startDate.getTime() + 7 * 86400000);

    const toCreate = [];
    if (!havePredict) {
      toCreate.push({
        title: `Predict & Win — Week ${week}`,
        competition_type: 'predict_win',
        theme: `Weekly sports prediction leaderboard — ${weekKey}`,
        week_key: weekKey,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        prize_coins: 5000,
        prize_description: '5,000 Ride X coins + exclusive badge for the top predictor',
        rules: 'Pick match outcomes each matchday. 3 pts for correct score, 1 pt for correct result. Highest weekly total wins. Free to enter — no real money.',
        status: 'active',
        auto_created: true,
      });
    }
    if (!haveFan) {
      const themes = [
        'Best Afrobeats Dance Video',
        'Fan Art Showcase',
        'Sing-Your-Song Cover Challenge',
        'Concert Moment Photo Contest',
        'Freestyle Rap Bar Challenge',
      ];
      const theme = themes[week % themes.length];
      toCreate.push({
        title: `Fan Contest — ${theme}`,
        competition_type: 'fan_contest',
        theme,
        week_key: weekKey,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        prize_coins: 3000,
        prize_description: '3,000 Ride X coins + featured spotlight on the app',
        rules: 'Submit a short video or photo matching the theme. Community votes decide the winner. One entry per user. Keep it clean and original.',
        status: 'active',
        auto_created: true,
      });
    }

    const created = toCreate.length ? await base44.asServiceRole.entities.Competition.bulkCreate(toCreate) : [];

    return Response.json({
      week_key: weekKey,
      created: created.map((c) => ({ id: c.id, title: c.title, type: c.competition_type })),
      skipped: 2 - toCreate.length,
    });
  } catch (error) {
    console.error('auto-create-competition error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}