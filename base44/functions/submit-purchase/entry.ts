import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getShopItem, computePurchase, BOOSTER_BATTLES_GRANTED, CHARACTER_UNLOCK_COST } from '../../shared/gameShop.ts';

// Server-authoritative shop purchase. The client requests an item; the SERVER
// validates the item exists, checks affordability server-side (never trusts the
// client's claimed SP), applies the reward to the player's GameProfile, and
// returns the new balance. Closes the same security hole as submit-combat-result
// — a malicious client cannot grant itself unlimited SP, premium, or boosters.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const itemId = String(body.itemId || '').trim();
    const characterId = Number(body.characterId);

    // --- character unlock path ---
    if (Number.isInteger(characterId) && characterId >= 1 && characterId <= 17) {
      const profiles = await base44.entities.GameProfile.filter({ created_by_id: user.id });
      if (!profiles || !profiles.length)
        return Response.json({ error: 'Profile not found' }, { status: 404 });
      const profile = profiles[0];
      const unlocked = (profile.unlocked_characters || '1,2,3,4,5').split(',').map(Number);
      if (unlocked.includes(characterId))
        return Response.json({ ok: false, error: 'Already unlocked' }, { status: 200 });
      // tier lookup — mirror CharacterRoster cost map
      const tierMap: Record<number, string> = { 6: 'Villain', 16: 'Legend', 17: 'Legend' };
      const tier = tierMap[characterId] || 'Orisa';
      const cost = CHARACTER_UNLOCK_COST[tier] ?? 500;
      const currentSp = profile.spirit_points || 0;
      if (currentSp < cost)
        return Response.json({ ok: false, error: 'Not enough Spirit Points' }, { status: 200 });
      await base44.entities.GameProfile.update(profile.id, {
        unlocked_characters: [...unlocked, characterId].join(','),
        spirit_points: currentSp - cost,
      });
      return Response.json({ ok: true, characterId, spiritPoints: currentSp - cost });
    }

    const item = getShopItem(itemId);
    if (!item) return Response.json({ error: 'Invalid item' }, { status: 400 });

    // --- load the player's profile (user-scoped) ---
    const profiles = await base44.entities.GameProfile.filter({ created_by_id: user.id });
    if (!profiles || !profiles.length)
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profile = profiles[0];

    const currentSp = profile.spirit_points || 0;
    const isPremium = !!profile.premium;

    const result = computePurchase(item, currentSp, isPremium);
    if (!result.ok) return Response.json({ ok: false, error: result.reason }, { status: 200 });

    const patch: Record<string, number | boolean> = { ...result.patch };
    if (item.booster) {
      patch.booster_battles = (profile.booster_battles || 0) + BOOSTER_BATTLES_GRANTED;
    }

    await base44.entities.GameProfile.update(profile.id, patch);

    return Response.json({
      ok: true,
      itemId: item.id,
      spiritPoints: patch.spirit_points as number,
      premium: patch.premium ?? isPremium,
      boosterBattles: patch.booster_battles ?? (profile.booster_battles || 0),
      spCost: result.spCost,
      spGain: result.spGain,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}