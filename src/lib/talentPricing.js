// Ride X talent booking — tier base fees are the Ride X price (what the client pays).
// 20% platform commission is built in: artist earns price / 1.2, platform keeps the rest.
// Real LOCAL Nigerian show booking fees — confirmed Aug 2026 via online verification.
export const TALENT_COMMISSION = 0.20;

export const TALENT = {
  musician: [
    { tier: "mega_star", label: "Global Mega-Star", price: 100000000, example: "Burna Boy" },
    { tier: "superstar", label: "International Superstar", price: 50000000, example: "Davido" },
    { tier: "a_list", label: "National A-List", price: 15000000, example: "Fireboy DML" },
    { tier: "mid", label: "Mid-Tier Artist", price: 5000000, example: "Odumodublvck" },
    { tier: "rising", label: "Rising Artist", price: 750000, example: "Khaid" },
    { tier: "emerging", label: "Emerging Artist", price: 300000, example: "New Talent" },
  ],
  actor: [
    { tier: "mega_star", label: "Global Movie Star", price: 40000000, example: "Richard Mofe-Damijo" },
    { tier: "a_list", label: "Nollywood A-List", price: 5000000, example: "Zubby Michael" },
    { tier: "mid", label: "Nollywood Mid-Tier", price: 1500000, example: "Established" },
    { tier: "emerging", label: "Emerging Actor", price: 300000, example: "New Talent" },
  ],
  comedian: [
    { tier: "mega_star", label: "International Headliner", price: 50000000, example: "Kevin Hart" },
    { tier: "a_list", label: "Nigerian Top Comedian", price: 2000000, example: "Broda Shaggi" },
    { tier: "mid", label: "Mid-Tier Comedian", price: 750000, example: "Club Headliner" },
    { tier: "emerging", label: "Emerging Comedian", price: 150000, example: "New Act" },
  ],
  dancer: [
    { tier: "mega_star", label: "International Headliner", price: 10000000, example: "Jabbawockeez" },
    { tier: "a_list", label: "Nigerian Top Dancer", price: 1500000, example: "Poco Lee" },
    { tier: "mid", label: "Mid-Tier Dancer", price: 500000, example: "Experienced" },
    { tier: "emerging", label: "Emerging Dancer", price: 100000, example: "New Talent" },
  ],
  dj: [
    { tier: "mega_star", label: "Global Mega-DJ", price: 15000000, example: "Martin Garrix" },
    { tier: "superstar", label: "International Superstar DJ", price: 5000000, example: "DJ Maphorisa" },
    { tier: "a_list", label: "Nigerian Top DJ", price: 2000000, example: "DJ Spinall" },
    { tier: "mid", label: "Mid-Tier DJ", price: 750000, example: "Club Resident" },
    { tier: "emerging", label: "Emerging DJ", price: 100000, example: "New DJ" },
  ],
};

export const TALENT_TYPES = Object.keys(TALENT);

export function splitTalentPrice(price) {
  const artist = Math.round(Number(price || 0) / 1.2);
  return { artist, platform: Number(price || 0) - artist };
}

// Resolve the booking price for an artist: use their stored booking_price, or
// fall back to the tier base price from TALENT.
export function talentPriceFor(artist) {
  const bp = Number(artist?.booking_price) || 0;
  if (bp > 0) return bp;
  const tiers = TALENT[artist?.talent_type] || [];
  const t = tiers.find((x) => x.tier === artist?.tier);
  return t?.price || 0;
}