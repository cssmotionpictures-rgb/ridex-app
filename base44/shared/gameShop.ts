// Server-authoritative shop catalog + purchase validation for
// "The Forgotten Ones". Mirrors src/lib/forgottenOnesData.js SHOP_ITEMS so the
// backend never trusts the client's claimed price/sp — it recomputes from the
// same catalog. Any change to the client shop MUST be mirrored here.

export interface ShopItem {
  id: string;
  label: string;
  price: number;   // NGN (real-money items) — for record/audit only here
  sp: number;      // Spirit Points granted (SP packs)
  booster?: boolean;
  premium?: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "sp500",    label: "Spirit Points x500",                    price: 500,    sp: 500 },
  { id: "sp1500",   label: "Spirit Points x1,500",                   price: 1000,   sp: 1500 },
  { id: "sp4000",   label: "Spirit Points x4,000",                   price: 2500,   sp: 4000 },
  { id: "sp10000",  label: "Spirit Points x10,000",                  price: 5000,   sp: 10000 },
  { id: "booster",  label: "Booster Pack (2x XP for 5 battles)",      price: 1000,   sp: 0,     booster: true },
  { id: "premium",  label: "Premium Subscription (Unlock All + Ad-Free)", price: 10000, sp: 0,  premium: true },
];

// Booster costs Spirit Points (in-game currency), not real money.
export const BOOSTER_SP_COST = 1000;
export const BOOSTER_BATTLES_GRANTED = 5;
export const PREMIUM_SP_BONUS = 500;

// Character unlock costs by tier (Spirit Points). Mirrors CharacterRoster.jsx.
export const CHARACTER_UNLOCK_COST: Record<string, number> = {
  Hero: 0,
  Orisa: 500,
  Legend: 800,
  Villain: 800,
};

export function getShopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((i) => i.id === id) || null;
}

// Compute the authoritative profile patch for a purchase. Returns null if the
// purchase is invalid (unknown item, unaffordable, already owned). The caller
// is responsible for loading the profile and applying the patch atomically.
export function computePurchase(
  item: ShopItem,
  currentSp: number,
  isPremium: boolean
): { ok: true; patch: Record<string, number | boolean>; spCost: number; spGain: number } | { ok: false; reason: string } {
  if (item.premium) {
    if (isPremium) return { ok: false, reason: "You already have Premium" };
    return {
      ok: true,
      patch: { premium: true, spirit_points: currentSp + PREMIUM_SP_BONUS },
      spCost: 0,
      spGain: PREMIUM_SP_BONUS,
    };
  }
  if (item.booster) {
    if (currentSp < BOOSTER_SP_COST) return { ok: false, reason: "Not enough Spirit Points" };
    return {
      ok: true,
      patch: { spirit_points: currentSp - BOOSTER_SP_COST },
      spCost: BOOSTER_SP_COST,
      spGain: 0,
    };
  }
  // SP pack — real-money purchase. In production a Paystack payment reference
  // confirms payment before this grants SP. Here the server grants it
  // authoritatively (closing the client-side hole) and the price is audited.
  return {
    ok: true,
    patch: { spirit_points: currentSp + item.sp },
    spCost: 0,
    spGain: item.sp,
  };
}