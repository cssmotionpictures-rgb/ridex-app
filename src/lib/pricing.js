// All prices on Ride X are in NAIRA (₦), based on the August 2026 Nigerian market.

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// --- Currency ---
export const money = (n, currency = "NGN") =>
  `${currency === "NGN" ? "₦" : "$"}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const naira = money;

// --- Ride fare (Naira) ---
export const FUEL_PRICE = 1250;       // ₦/litre (petrol, pump)
export const RIDE_BASE_FARE = 500;    // flag-off
export const RIDE_DIST_RATE = FUEL_PRICE * 0.10; // ₦125/km
export const RIDE_TIME_RATE = 50;     // ₦/minute

export const LOCATION_MULTIPLIERS = {
  "Lagos Mainland": 1.0, "Lagos Island": 1.2, "Victoria Island": 1.25,
  "Lekki": 1.15, "Ajah": 1.15, "Ikeja": 1.0, "Abuja": 1.1,
  "Port Harcourt": 1.05, "Ibadan": 0.9,
};

export function trafficMultiplier(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 9) return 1.5;     // peak morning
  if (h >= 16 && h < 20) return 1.7;    // peak evening
  return 1.0;                           // off-peak
}

// Full Naira fare per the platform formula, rounded up to the nearest ₦50.
export function rideFare({ km, minutes, type = "economy", locationMult = 1.0, rideTypes }) {
  const typeMult = (rideTypes || []).find((t) => t.key === type)?.multiplier || 1;
  const mins = minutes ?? Math.round((km || 0) * 2.5);
  const raw =
    (RIDE_BASE_FARE + RIDE_DIST_RATE * (km || 0) + RIDE_TIME_RATE * mins) *
    (locationMult || 1) *
    trafficMultiplier() *
    typeMult;
  return Math.ceil(raw / 50) * 50;
}

// --- Logistics (Naira) ---
export function logisticsFare({ km, weightKg, speedMultiplier = 1.4 }) {
  const raw = (500 + 150 * (km || 0) + 50 * (weightKg || 0)) * speedMultiplier;
  return Math.ceil(raw / 50) * 50;
}

// --- Equipment operator ---
export const OPERATOR_DAILY = 100000; // ₦100,000/day

// --- Lowbed / flatbed transport for heavy equipment (NOT included in hire fee) ---
// Rate: ₦32,500 / km (charged separately from the hire fee).
export const LOWBED_PER_KM = 32500;
export const LOWBED_MIN_FEE = 150000;          // floor — never lower than ₦150,000
export function lowbedFee(km) {
  const raw = LOWBED_PER_KM * (km || 0);
  const rounded = Math.ceil(raw / 500) * 500;
  return Math.max(rounded, LOWBED_MIN_FEE);
}

// --- Caterpillar delivery ---
// Two ways to move a Caterpillar to site:
//  • Rubber-tyre machines (backhoe loaders, wheel loaders, graders, dump
//    trucks, forklifts, telehandlers, compactors) can drive themselves on
//    government roads. The first 1 km (≈15 min) is free, then 1 keg of diesel
//    is charged, plus 1 more keg per ≈1.33 km (20 min) of distance. Beyond
//    15 km a lowbed/flatbed is mandatory.
//  • Steel-track machines (excavators, bulldozers, skid steers) can't trek on
//    government roads — a lowbed/flatbed always carries them.
export const CATERPILLAR_TREK_SPEED_KMH = 4;     // rubber-tyre road speed (km/h)
export const TREK_FREE_KM = 1;                    // first 1 km (≈15 min) free
export const KM_PER_KEG = 4 / 3;                  // 1 keg per 20 min ≈ 1.33 km
export const DIESEL_PER_KEG = 50000;              // ₦/25 L keg
export const TREK_MAX_KM = 15;                    // beyond this → lowbed mandatory

export function caterpillarTransport(km, canTrek = false) {
  const d = Math.max(0, km || 0);
  if (d <= 0) return { mode: "none", kegs: 0, fee: 0, label: "Enter both addresses" };
  if (canTrek && d <= TREK_FREE_KM) return { mode: "trek", kegs: 0, fee: 0, label: "Trek on tyres (≤1 km) — no diesel charge" };
  if (canTrek && d <= TREK_MAX_KM) {
    const kegs = 1 + Math.floor((d - TREK_FREE_KM) / KM_PER_KEG);
    const fee = Math.ceil((kegs * DIESEL_PER_KEG) / 500) * 500;
    return { mode: "trek", kegs, fee, label: `Trek on tyres — ${kegs} keg(s) of diesel` };
  }
  return { mode: "lowbed", kegs: 0, fee: lowbedFee(d), label: `Lowbed/flatbed · ${Math.round(d)} km` };
}

// --- Marketplace ---
export const MARKET_LISTING_FEE = 500;
export const MARKET_COMMISSION = 0.10;
export const MARKET_DELIVERY_FEE = 1500;
export const BOOST_PRICES = { "1": 2500, "3": 7500, "7": 15000 };

// --- Movies ---
export const MOVIE_UNLOCK = 500;
export const MOVIE_SUBSCRIPTION = 5000;

// --- Sports (ad-free live football) ---
export const SPORTS_MEMBERSHIP = 5000; // ₦5,000 / 30 days

// --- AI Music Master ---
export const MASTER_DOWNLOAD = 10000;
export const MASTER_BUNDLE = 30000;

// --- Referral program (Naira) ---
export const MIN_PAYOUT = 20000;
export const REFERRAL_BONUS_TIERS = [
  { tier: "Bronze", customers: 5, drivers: 2, bonus: 10000 },
  { tier: "Silver", customers: 15, drivers: 5, bonus: 40000 },
  { tier: "Gold", customers: 50, drivers: 15, bonus: 100000 },
  { tier: "Platinum", customers: 100, drivers: 30, bonus: 250000 },
];

export function interpolate(from, to, progress) {
  return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
}

// --- Digital Product Marketplace ---
export const DIGITAL_LISTING_FEE = 500;
export const DIGITAL_COMMISSION = 0.20;
export const DIGITAL_FEATURED_FEE = 2500; // per day

// --- Collaboration Marketplace ---
export const COLLAB_COMMISSION = 0.15;
export const COLLAB_FEATURED_FEE = 5000; // per day

// --- Song Licensing ---
export const LICENSE_COMMISSIONS = { sync: 0.15, mechanical: 0.15, exclusive: 0.10 };

// --- Fan Club tiers ---
export const FAN_CLUB_TIERS = [
  { tier: "Fan Club", price: 2500, benefits: "Exclusive content, early access" },
  { tier: "Premium", price: 5000, benefits: "All Fan Club perks + merch discounts + live streams" },
  { tier: "VIP", price: 10000, benefits: "All Premium perks + community + meet & greets" },
];

// --- Gamification VIP Tiers ---
export const VIP_TIERS = [
  { tier: "Bronze", price: 2500, perks: ["Exclusive content", "Early access"] },
  { tier: "Silver", price: 5000, perks: ["Bronze perks", "Ad-free experience"] },
  { tier: "Gold", price: 10000, perks: ["Silver perks", "Priority support", "Premium content"] },
  { tier: "Platinum", price: 25000, perks: ["Gold perks", "VIP events", "Personal manager"] },
];