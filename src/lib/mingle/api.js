// RIDEX MINGLE API — the data layer. Every write is scoped by server-side RLS
// so a user can only ever write their own profile/presence/likes, only message
// conversations they are a participant in, and only call their own matches.
// Exact GPS is coarsened to a privacy zone INSIDE the browser before anything
// is stored — the server never receives a raw coordinate for Mingle.
import { base44 } from "@/api/base44Client";
import { existingKeySet } from "@/lib/idempotency";
import * as core from "./core";

const nowIso = () => new Date().toISOString();

export async function getMyProfile(me) {
  const rows = await base44.entities.MingleProfile.filter({ user_id: me.id }).catch(() => []);
  return rows?.[0] || null;
}

export async function createProfile(me, data) {
  const age = Number(data.age);
  if (!Number.isFinite(age) || age < core.MIN_AGE) throw new Error("Mingle is for adults (18+) only.");
  const p = await base44.entities.MingleProfile.create({
    user_id: me.id,
    display_name: data.display_name?.trim() || "Mingle member",
    age,
    gender: data.gender,
    seeking: data.seeking,
    min_age: Number(data.min_age) || core.MIN_AGE,
    max_age: Number(data.max_age) || 99,
    interests: data.interests || "",
    goal: data.goal || "",
    bio: data.bio || "",
    photo_url: data.photo_url || "",
    area_label: data.area_label || "",
    discovery_enabled: true,
    show_online_status: true,
    status: "active",
  });
  return p;
}

export async function updateProfile(profileId, patch) {
  return base44.entities.MingleProfile.update(profileId, patch);
}

// Upsert my ephemeral presence. `coords` is the user's OWN live position — it
// is coarsened to a zone here and never stored or sent raw. Pass coords=null
// to remove proximity discovery while keeping the profile.
export async function heartbeat(me, { coords, status = "DISCOVERABLE", areaLabel = "" }) {
  const rows = await base44.entities.MinglePresence.filter({ user_id: me.id }).catch(() => []);
  const existing = rows?.[0];
  if (!coords || !["AVAILABLE", "DISCOVERABLE", "BUSY", "IN_CALL"].includes(status)) {
    if (existing) await base44.entities.MinglePresence.delete(existing.id).catch(() => {});
    return null;
  }
  const zone = core.zoneOf(coords[0], coords[1], me.id);
  const row = {
    user_id: me.id,
    status,
    zone_lat: zone.zone_lat,
    zone_lng: zone.zone_lng,
    area_label: areaLabel,
    last_seen_at: nowIso(),
    expires_at: new Date(Date.now() + core.PRESENCE_TTL_MIN * 60000).toISOString(),
  };
  if (existing) return base44.entities.MinglePresence.update(existing.id, row);
  return base44.entities.MinglePresence.create(row);
}

export async function setPresenceStatus(me, status) {
  const rows = await base44.entities.MinglePresence.filter({ user_id: me.id }).catch(() => []);
  if (rows?.[0]) return base44.entities.MinglePresence.update(rows[0].id, { status, last_seen_at: nowIso() });
  return null;
}

// Record LIKE/PASS, idempotent per target. A mutual LIKE creates exactly one
// match (deterministic match_key, existence-checked before create).
export async function recordLike(me, targetId, action) {
  const mine = await base44.entities.MingleLike.filter({ user_id: me.id, target_user_id: targetId }).catch(() => []);
  if (mine?.length) await base44.entities.MingleLike.update(mine[0].id, { action, created_at: nowIso() });
  else await base44.entities.MingleLike.create({ user_id: me.id, target_user_id: targetId, action, created_at: nowIso() });

  if (action !== "LIKE") return { matched: false };
  const theirs = await base44.entities.MingleLike.filter({ user_id: targetId, target_user_id: me.id }).catch(() => []);
  if (theirs?.[0]?.action === "LIKE") {
    const m = await createMatch(me.id, targetId);
    return { matched: true, match: m.row, created: m.created };
  }
  return { matched: false };
}

export async function createMatch(userIdA, userIdB) {
  const key = core.matchKeyOf(userIdA, userIdB);
  const have = await existingKeySet("MingleMatch", "match_key", [key]);
  if (have.has(key)) {
    const rows = await base44.entities.MingleMatch.filter({ match_key: key }).catch(() => []);
    return { row: rows?.[0] || null, created: false };
  }
  const [a, b] = [userIdA, userIdB].sort();
  const row = await base44.entities.MingleMatch.create({
    match_key: key,
    user_a: a,
    user_b: b,
    members: [a, b],
    status: "ACTIVE",
    created_at: nowIso(),
  });
  return { row, created: true };
}

// Nearby Now — fetch everything, run the privacy-preserving eligibility chain.
export async function loadDiscovery(me, profile, myZone) {
  const [profiles, presences, myLikes, myMatches, blocksByMe, blocksOnMe] = await Promise.all([
    base44.entities.MingleProfile.filter({ status: "active" }, null, 300).catch(() => []),
    base44.entities.MinglePresence.filter({}, "-last_seen_at", 500).catch(() => []),
    base44.entities.MingleLike.filter({ user_id: me.id }).catch(() => []),
    base44.entities.MingleMatch.filter({}).catch(() => []), // RLS: only my matches are readable
    base44.entities.MingleBlock.filter({ blocker_id: me.id }).catch(() => []),
    base44.entities.MingleBlock.filter({ blocked_id: me.id }).catch(() => []),
  ]);
  const blocksInvolved = [...(blocksByMe || []), ...(blocksOnMe || [])];
  const cards = core.eligibleDiscovery({
    viewer: profile,
    viewerZone: myZone,
    profiles,
    presences,
    myLikes,
    myMatches,
    blocksInvolved,
  });
  return { cards, presences: presences || [], profiles: profiles || [] };
}

// Aggregated map areas from the compatible presence pool — never individual markers
export function zonesOfCompatible(cards, presences) {
  const ids = new Set(cards.map((c) => c.user_id));
  return core.aggregateZones((presences || []).filter((p) => ids.has(p.user_id)));
}

export async function loadMatches(me) {
  return base44.entities.MingleMatch.filter({}, "-created_date", 200).catch(() => []);
}

export async function loadMessages(matchId) {
  return base44.entities.MingleMessage.filter({ match_id: matchId }, "created_date", 500).catch(() => []);
}

export function subscribeMessages(cb) {
  return base44.entities.MingleMessage.subscribe(cb);
}
export function subscribePresence(cb) {
  return base44.entities.MinglePresence.subscribe(cb);
}
export function subscribeMatches(cb) {
  return base44.entities.MingleMatch.subscribe(cb);
}
export function subscribeLikes(cb) {
  return base44.entities.MingleLike.subscribe(cb);
}
export function subscribeMeetups(cb) {
  return base44.entities.MingleMeetup.subscribe(cb);
}

export async function sendMessage(match, me, { body, type = "text", attachmentUrl = "", clientId = "" }) {
  if (match?.status !== "ACTIVE") throw new Error("This conversation is no longer active.");
  return base44.entities.MingleMessage.create({
    match_id: match.id,
    members: match.members,
    sender_id: me.id,
    client_id: clientId || `${me.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body,
    type,
    attachment_url: attachmentUrl,
    created_at: nowIso(),
  });
}

export async function markMessagesRead(messages, me) {
  const unread = (messages || []).filter((m) => m.sender_id !== me.id && !m.read_at);
  if (!unread.length) return;
  await base44.entities.MingleMessage.bulkUpdate(unread.map((m) => ({ id: m.id, read_at: nowIso() })));
}

export async function reactToMessage(message, me, emoji) {
  let reactions = {};
  try { reactions = JSON.parse(message.reactions_json || "{}"); } catch { reactions = {}; }
  reactions[me.id] = reactions[me.id] === emoji ? "" : emoji;
  return base44.entities.MingleMessage.update(message.id, { reactions_json: JSON.stringify(reactions) });
}

export async function uploadChatImage(file) {
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
  return file_url;
}

// Blocking hides both sides immediately and freezes every conversation
export async function blockUser(me, targetId, reason = "") {
  const rows = await base44.entities.MingleBlock.filter({ blocker_id: me.id, blocked_id: targetId }).catch(() => []);
  if (!rows?.length) await base44.entities.MingleBlock.create({ blocker_id: me.id, blocked_id: targetId, reason, created_at: nowIso() });
  const mine = await loadMatches(me);
  const affected = (mine || []).filter((m) => (m.members || []).includes(targetId));
  if (affected.length) {
    await base44.entities.MingleMatch.bulkUpdate(affected.map((m) => ({ id: m.id, status: "BLOCKED", unmatched_by: me.id })));
  }
  return affected.length;
}

export async function unmatch(me, match) {
  return base44.entities.MingleMatch.update(match.id, { status: "UNMATCHED", unmatched_by: me.id });
}

export const REPORT_CATEGORIES = [
  "HARASSMENT", "SCAM", "IMPERSONATION", "SEXUAL_HARASSMENT",
  "THREATS", "UNWANTED_CONTACT", "INAPPROPRIATE_CONTENT", "OTHER",
];

export async function reportUser(me, { targetId, category, context, detail }) {
  return base44.entities.MingleReport.create({
    reporter_id: me.id,
    reported_id: targetId,
    category,
    context,
    detail: detail || "",
    status: "OPEN",
    created_at: nowIso(),
  });
}

// Meetups — both users must agree before GET A RIDEX appears
export async function proposeMeetup(me, match, { venueName, venueType, areaLabel, note }) {
  return base44.entities.MingleMeetup.create({
    match_id: match.id,
    members: match.members,
    proposer_id: me.id,
    venue_name: venueName,
    venue_type: venueType || "cafe",
    area_label: areaLabel || "",
    note: note || "",
    status: "PROPOSED",
    proposed_at: nowIso(),
  });
}

export async function respondMeetup(meetupId, status) {
  return base44.entities.MingleMeetup.update(meetupId, { status, responded_at: nowIso() });
}

export async function loadMeetups(me) {
  return base44.entities.MingleMeetup.filter({}, "-proposed_at", 100).catch(() => []);
}

// Call authorization inputs — decline history drives the cooldown
export async function callGuardInputs(me, targetId, match, myBlocks, blocksOnMe, profile) {
  const rooms = await base44.entities.CallRoom
    .filter({ caller_id: me.id, callee_id: targetId }, "-updated_date", 10)
    .catch(() => []);
  const declined = (rooms || []).filter((r) => r.status === "declined" && r.updated_date);
  const minutesSinceDecline = declined.length
    ? (Date.now() - new Date(declined[0].updated_date).getTime()) / 60000
    : undefined;
  const blockedEither = [...(myBlocks || []), ...(blocksOnMe || [])].some(
    (b) => b.blocker_id === targetId || b.blocked_id === targetId
  );
  return core.canCall({
    matchStatus: match?.status,
    blockedEither,
    callConsentAt: profile?.call_consent_at,
    minutesSinceDecline,
  });
}