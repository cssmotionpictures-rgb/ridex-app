// RIDEX MINGLE CORE — the privacy-first matching engine (pure functions only).
// The map knows enough to help people discover compatible people. It never
// knows — and never reveals — enough to track anyone:
//  - exact GPS is snapped to a ~2km coarse zone BEFORE it ever leaves the browser
//  - discovery exposes distance BANDS ("NEARBY"), never numbers or coordinates
//  - map rendering is aggregate-only: an area is drawn only when 2+ compatible
//    people share it, so no individual can ever be pinpointed
import { haversineKm } from "@/lib/pricing";

export const MIN_AGE = 18;
export const PRESENCE_TTL_MIN = 15;
export const FREE_RANGE_KM = 10;
export const PREMIUM_RANGE_KM = 25; // MINGLE PLUS — expanded discovery
export const CALL_COOLDOWN_MIN = 10;
export const MAX_MESSAGES_PER_MIN = 20;
const ZONE_CELL_KM = 2;

// Coarse privacy zone: snap to a ~2km grid, then a deterministic per-user
// jitter inside the cell. The raw position NEVER persists anywhere.
export function zoneOf(lat, lng, userId) {
  const latStep = ZONE_CELL_KM / 111;
  const lngStep = ZONE_CELL_KM / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const cellLat = Math.floor(lat / latStep) * latStep;
  const cellLng = Math.floor(lng / lngStep) * lngStep;
  let h = 7;
  const s = String(userId || "x");
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 100003;
  return {
    zone_lat: cellLat + ((h % 50) / 125) * latStep, // stays inside the cell
    zone_lng: cellLng + (((h >> 4) % 50) / 125) * lngStep,
  };
}

// Distance bands — human labels only, never a trackable number
const BANDS = [
  { max: 1, label: "VERY CLOSE" },
  { max: 3, label: "NEARBY" },
  { max: 8, label: "A FEW KM AWAY" },
  { max: 25, label: "WITHIN YOUR AREA" },
];
export const bandOf = (km) =>
  Number.isFinite(km) && km >= 0 ? BANDS.find((b) => km <= b.max)?.label || "IN YOUR CITY" : "IN YOUR CITY";

export const discoveryRangeKm = (profile) => (profile?.premium ? PREMIUM_RANGE_KM : FREE_RANGE_KM);

// A male and a female near each other is NOT a match. Preferences must be
// compatible in BOTH directions and both must be adults inside each other's
// age window — proximity never overrides consent and preference.
export function genderAgeCompatible(viewer, cand) {
  if (!viewer || !cand) return false;
  const seesSeek = viewer.seeking === "everyone" || viewer.seeking === cand.gender;
  const seenBy = cand.seeking === "everyone" || cand.seeking === viewer.gender;
  const ageOkV = cand.age >= (viewer.min_age || MIN_AGE) && cand.age <= (viewer.max_age || 99);
  const ageOkC = viewer.age >= (cand.min_age || MIN_AGE) && viewer.age <= (cand.max_age || 99);
  return seesSeek && seenBy && ageOkV && ageOkC;
}

export function matchStrength(viewer, cand) {
  if (!genderAgeCompatible(viewer, cand)) return 0; // proximity + gender alone NEVER match
  const vi = String(viewer.interests || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ci = String(cand.interests || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const shared = ci.filter((i) => vi.includes(i)).length;
  let s = 40 + Math.min(4, shared) * 10;
  if (viewer.goal && cand.goal && String(viewer.goal).toLowerCase() === String(cand.goal).toLowerCase()) s += 15;
  return Math.min(100, s);
}

// The ONLY profile shape discovery ever exposes — no coordinates, no exact
// distance, no ride data, no account identifiers, no timestamps of movement.
export function safeCard(p, pres, distKm, strength) {
  return {
    user_id: p.user_id,
    display_name: p.display_name,
    age: p.age,
    gender: p.gender,
    interests: p.interests || "",
    goal: p.goal || "",
    bio: p.bio || "",
    photo_url: p.photo_url || "",
    area_label: pres?.area_label || p.area_label || "",
    band: bandOf(distKm),
    strength,
    show_online_status: !!p.show_online_status,
  };
}

// Nearby Now — run the full eligibility chain on everyone opted in, return
// privacy-safe cards ranked by match strength.
export function eligibleDiscovery({ viewer, viewerZone, profiles, presences, myLikes, myMatches, blocksInvolved, now = Date.now() }) {
  const actedOn = new Set((myLikes || []).map((l) => l.target_user_id));
  const matched = new Set();
  (myMatches || []).forEach((m) => (m.members || []).forEach((x) => matched.add(x)));
  const blocked = new Set((blocksInvolved || []).map((b) => b.blocked_id));
  const blockedMe = new Set((blocksInvolved || []).map((b) => b.blocker_id));
  const presByUser = new Map((presences || []).map((p) => [p.user_id, p]));
  const range = discoveryRangeKm(viewer);
  const out = [];
  for (const p of profiles || []) {
    if (!p || p.user_id === viewer.user_id) continue;
    if (p.status !== "active" || !p.discovery_enabled) continue;
    if ((p.age || 0) < MIN_AGE || (viewer.age || 0) < MIN_AGE) continue; // adults only, always
    if (actedOn.has(p.user_id)) continue; // already liked/passed
    if (matched.has(p.user_id)) continue; // already matched
    if (blocked.has(p.user_id) || blockedMe.has(p.user_id)) continue; // block hides in BOTH directions
    if (!genderAgeCompatible(viewer, p)) continue;
    const pres = presByUser.get(p.user_id);
    if (!pres || !pres.expires_at || new Date(pres.expires_at).getTime() < now) continue; // presence self-expires
    if (!["AVAILABLE", "DISCOVERABLE"].includes(pres.status)) continue; // busy/in-call/paused users are invisible
    const dist = viewerZone
      ? haversineKm([viewerZone.zone_lat, viewerZone.zone_lng], [pres.zone_lat, pres.zone_lng])
      : Infinity;
    if (!Number.isFinite(dist) || dist > range) continue;
    out.push(safeCard(p, pres, dist, matchStrength(viewer, p)));
  }
  return out.sort((a, b) => b.strength - a.strength);
}

// Aggregate map areas — an area is drawn ONLY when 2+ compatible people share
// it, so a single person's zone can never be pinpointed on the map.
export function aggregateZones(presences) {
  const cells = new Map();
  for (const p of presences || []) {
    const key = `${Number(p.zone_lat).toFixed(2)}:${Number(p.zone_lng).toFixed(2)}`;
    const c = cells.get(key) || { lat: 0, lng: 0, count: 0 };
    c.lat += p.zone_lat;
    c.lng += p.zone_lng;
    c.count += 1;
    cells.set(key, c);
  }
  return [...cells.values()]
    .filter((c) => c.count >= 2)
    .map((c) => ({ lat: c.lat / c.count, lng: c.lng / c.count, count: c.count, radiusKm: 2 }));
}

// Online status — respect the profile's privacy switch; never a precise timestamp
export function onlineStatusOf(profile, presence, now = Date.now()) {
  if (!profile?.show_online_status) return null; // fully hidden when OFF
  if (!presence || !presence.expires_at || new Date(presence.expires_at).getTime() < now) return "OFFLINE";
  const mins = (now - new Date(presence.last_seen_at || presence.expires_at).getTime()) / 60000;
  if (["AVAILABLE", "DISCOVERABLE"].includes(presence.status) && mins < 2) return "ONLINE";
  if (mins < 30) return "RECENTLY_ACTIVE";
  return "OFFLINE";
}

export const matchKeyOf = (a, b) => `mingle|${[a, b].sort().join("|")}`;
export const isMutualLike = (myLike, theirLikeTowardMe) => myLike?.action === "LIKE" && theirLikeTowardMe?.action === "LIKE";

// Call authorization — unmatched, blocked, non-consenting and recently
// declined callers are all stopped BEFORE a room is ever created.
export function canCall({ matchStatus, blockedEither, callConsentAt, minutesSinceDecline }) {
  if (matchStatus !== "ACTIVE") return { ok: false, reason: "Only active matches can call." };
  if (blockedEither) return { ok: false, reason: "Blocked users cannot call." };
  if (!callConsentAt) return { ok: false, reason: "Accept the call-privacy consent first." };
  if (Number.isFinite(minutesSinceDecline) && minutesSinceDecline < CALL_COOLDOWN_MIN) {
    return { ok: false, reason: `Call cooldown — try again in ${Math.ceil(CALL_COOLDOWN_MIN - minutesSinceDecline)} min.` };
  }
  return { ok: true, reason: "" };
}

// Duplicate realtime deliveries can never create duplicate messages
export function mergeMessages(existing, incoming) {
  const byId = new Map();
  for (const m of [...(existing || []), ...(incoming || [])]) {
    const k = m.client_id || m.id;
    if (!byId.has(k)) byId.set(k, m);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at || a.created_date || 0) - new Date(b.created_at || b.created_date || 0)
  );
}

// Basic anti-spam: bounded messages per minute per user
export function messageRateOk(sentAts, now = Date.now()) {
  return (sentAts || []).filter((t) => now - t < 60000).length < MAX_MESSAGES_PER_MIN;
}