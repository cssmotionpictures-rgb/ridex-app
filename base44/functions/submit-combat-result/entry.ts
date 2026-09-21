import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  EPISODES,
  LEVELS_PER_EPISODE,
  computeWinReward,
  applyXp,
  isLevelReachable,
  MIN_WIN_DURATION_MS,
  MIN_GAP_BETWEEN_BATTLES_MS,
} from '../../shared/gameRewards.ts';

// Server-authoritative combat result submission.
// The client reports the outcome of a fight; the SERVER recomputes the
// legitimate XP/SP from the episode/level/combo (never trusts client-claimed
// numbers), validates reachability + anti-farm timing, updates the player's
// GameProfile, and logs an audit GameMatch record.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const episodeId = Number(body.episodeId);
    const level = Number(body.level);
    const result = body.result === 'lose' ? 'lose' : 'win';
    const combo = Math.max(0, Math.min(50, Number(body.combo) || 0));
    const durationMs = Math.max(0, Number(body.durationMs) || 0);
    const characterId = Math.max(1, Math.min(17, Number(body.characterId) || 1));

    // --- input validation ---
    if (!Number.isInteger(episodeId) || episodeId < 1 || episodeId > EPISODES.length)
      return Response.json({ error: 'Invalid episode' }, { status: 400 });
    if (!Number.isInteger(level) || level < 1 || level > LEVELS_PER_EPISODE)
      return Response.json({ error: 'Invalid level' }, { status: 400 });
    if (result === 'win' && durationMs < MIN_WIN_DURATION_MS)
      return Response.json({ error: 'Suspiciously fast win' }, { status: 400 });

    // --- load the player's profile (user-scoped; RLS read is open) ---
    const profiles = await base44.entities.GameProfile.filter({ created_by_id: user.id });
    if (!profiles || !profiles.length)
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profile = profiles[0];

    // --- anti-farm rate limit: gap between submissions ---
    const recent = await base44.entities.GameMatch.filter({ created_by_id: user.id }, '-created_date', 1);
    if (recent && recent.length) {
      const last = new Date(recent[0].created_date).getTime();
      if (Date.now() - last < MIN_GAP_BETWEEN_BATTLES_MS)
        return Response.json({ error: 'Too many battles, slow down' }, { status: 429 });
    }

    const completedArr = (profile.completed_levels || '').split(',').filter(Boolean);
    const completedSet = new Set(completedArr);
    const isPremium = !!profile.premium;

    let xpAwarded = 0;
    let spAwarded = 0;
    let levelCompleted = false;
    let rejectionReason = '';
    const boosterActive = result === 'win' && (profile.booster_battles || 0) > 0;

    if (result === 'win') {
      const reachable = isLevelReachable(episodeId, level, completedSet, isPremium);
      if (!reachable) {
        rejectionReason = 'Level not reachable';
      } else {
        const r = computeWinReward(episodeId, level, combo, boosterActive);
        xpAwarded = r.xp;
        spAwarded = r.sp;
        const key = `${episodeId}-${level}`;
        if (!completedSet.has(key)) {
          levelCompleted = true;
          completedArr.push(key);
        }
      }
    }

    // --- build the authoritative profile update ---
    const patch: Record<string, number | string | boolean> = {
      spirit_points: (profile.spirit_points || 0) + spAwarded,
      battles_won: result === 'win' ? (profile.battles_won || 0) + 1 : (profile.battles_won || 0),
      battles_lost: result === 'lose' ? (profile.battles_lost || 0) + 1 : (profile.battles_lost || 0),
    };
    if (levelCompleted) {
      patch.completed_levels = completedArr.join(',');
      patch.highest_episode = Math.max(profile.highest_episode || 1, episodeId);
    }
    let newLevel = profile.level || 1;
    let leveled = 0;
    if (result === 'win' && xpAwarded > 0) {
      const lv = applyXp(xpAwarded, profile.level || 1, profile.xp || 0);
      patch.xp = lv.xp;
      patch.level = lv.level;
      newLevel = lv.level;
      leveled = lv.leveled;
    }
    if (boosterActive) {
      patch.booster_battles = Math.max(0, (profile.booster_battles || 0) - 1);
    }

    await base44.entities.GameProfile.update(profile.id, patch);

    // --- audit log ---
    await base44.entities.GameMatch.create({
      user_id: user.id,
      character_id: characterId,
      episode_id: episodeId,
      level,
      result,
      combo,
      duration_ms: durationMs,
      xp_awarded: xpAwarded,
      sp_awarded: spAwarded,
      level_completed: levelCompleted,
      booster_used: boosterActive,
      validated: !rejectionReason,
      rejection_reason: rejectionReason,
    });

    if (rejectionReason) {
      return Response.json({ ok: false, error: rejectionReason, xp: 0, sp: 0 }, { status: 200 });
    }

    return Response.json({
      ok: true,
      result,
      xp: xpAwarded,
      sp: spAwarded,
      levelCompleted,
      newLevel,
      leveled,
      boosterRemaining: (patch.booster_battles as number) ?? (profile.booster_battles || 0),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}