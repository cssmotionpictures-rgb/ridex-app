import { base44 } from "@/api/base44Client";

export const LEVELS = [
  { name: "New User", min: 0, color: "#9ca3af", emoji: "🌱", benefits: ["Welcome to Ride X Rewards"] },
  { name: "Bronze", min: 101, color: "#b08d57", emoji: "🥉", benefits: ["5% off your first ride"] },
  { name: "Silver", min: 501, color: "#c0c0c0", emoji: "🥈", benefits: ["5% off all rides", "Early access to drops"] },
  { name: "Gold", min: 1001, color: "#f7c948", emoji: "🥇", benefits: ["10% off rides & logistics", "1 free movie / month"] },
  { name: "Platinum", min: 5001, color: "#7fd8e0", emoji: "💠", benefits: ["15% off everything", "Priority dispatch", "1 free carwash / month"] },
  { name: "Diamond", min: 10001, color: "#b388ff", emoji: "💎", benefits: ["20% off everything", "VIP support", "Free movie + carwash / month", "Exclusive drops"] },
];

export const BADGES = [
  { key: "first_ride", name: "First Ride", emoji: "🏅", desc: "Booked your first ride", sticky: true, check: (p, s) => (s.rides || 0) >= 1 },
  { key: "movie_buff", name: "Movie Buff", emoji: "🎬", desc: "Watched 10 movies", check: (p) => (p.points || 0) >= 200 },
  { key: "road_warrior", name: "Road Warrior", emoji: "🚗", desc: "Completed 50 rides", sticky: true, check: (p, s) => (s.rides || 0) >= 50 },
  { key: "logistics_pro", name: "Logistics Pro", emoji: "📦", desc: "Sent 20 packages", sticky: true, check: (p, s) => (s.logistics || 0) >= 20 },
  { key: "equipment_expert", name: "Equipment Expert", emoji: "🏗️", desc: "Rented 10 machines", sticky: true, check: (p, s) => (s.equipment || 0) >= 10 },
  { key: "music_master", name: "Music Master", emoji: "🎵", desc: "Mastered 5 songs", check: (p) => (p.points || 0) >= 100 },
  { key: "top_seller", name: "Top Seller", emoji: "💰", desc: "Sold 10 items", sticky: true, check: (p, s) => (s.sold || 0) >= 10 },
  { key: "super_user", name: "Super User", emoji: "🏆", desc: "Booked 100+ services", sticky: true, check: (p, s) => (s.services || 0) >= 100 },
];

export const REWARDS = [
  { key: "free_ride", name: "Free Ride", pointsCost: 100, emoji: "🚗", desc: "One free ride up to ₦5,000" },
  { key: "free_movie", name: "Free Movie Unlock", pointsCost: 50, emoji: "🎬", desc: "Unlock any pay-per-view movie" },
  { key: "discount_5", name: "5% Discount", pointsCost: 25, emoji: "💸", desc: "5% off your next booking" },
  { key: "featured_listing", name: "Featured Listing", pointsCost: 100, emoji: "⭐", desc: "Feature your listing for 7 days" },
  { key: "free_master", name: "Free Music Master", pointsCost: 150, emoji: "🎵", desc: "One free AI song mastering" },
  { key: "vip_support", name: "VIP Support", pointsCost: 200, emoji: "👑", desc: "Priority support for 30 days" },
];

export const WEEKLY_THRESHOLD = 150;
export const CHECKIN_BASE = 10;
export const AD_POINTS = 20;
export const WEEKLY_BONUS = 75;

export function weekKey(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

export function getLevel(points) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if ((points || 0) >= l.min) lvl = l;
  return lvl;
}

export function getNextLevel(points) {
  return LEVELS.find((l) => l.min > (points || 0)) || null;
}

export function getProgress(points) {
  const cur = getLevel(points);
  const next = getNextLevel(points);
  if (!next) return { pct: 100, remaining: 0, cur, next };
  const pct = Math.min(100, Math.round(((points - cur.min) / (next.min - cur.min)) * 100));
  return { pct, remaining: next.min - points, cur, next };
}

export function recompute(p, stats) {
  const prev = new Set(p.badges || []);
  const earned = BADGES.filter((b) => {
    if (b.check(p, stats || {})) return true;
    if (b.sticky && prev.has(b.key)) return true;
    return false;
  }).map((b) => b.key);
  return { badges: earned, level: getLevel(p.points).name };
}

export async function getMyProfile() {
  const me = await base44.auth.me();
  const existing = await base44.entities.RewardProfile.filter({ created_by_id: me.id });
  if (existing.length) return existing[0];
  return await base44.entities.RewardProfile.create({
    points: 0, level: "New User", streak_days: 0, badges: [],
    weekly_points: 0, total_redeemed: 0,
    owner_name: me.full_name || "Member", week_key: weekKey(),
  });
}

export async function saveProfile(id, patch) {
  return await base44.entities.RewardProfile.update(id, patch);
}