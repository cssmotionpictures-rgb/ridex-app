// RIDEX MINGLE REGRESSION SUITES — privacy, matching, presence, calls.
// The critical privacy guarantees of the product are asserted here: nothing a
// user can obtain ever contains another user's coordinates, exact distance,
// movement data or ride data.
import { describe, it, expect } from "vitest";
import {
  zoneOf, bandOf, safeCard, eligibleDiscovery, aggregateZones, onlineStatusOf,
  matchKeyOf, isMutualLike, canCall, mergeMessages, messageRateOk,
  genderAgeCompatible, matchStrength, discoveryRangeKm, MIN_AGE,
} from "@/lib/mingle/core";

const me = { user_id: "u-me", display_name: "Ada", age: 28, gender: "female", seeking: "male", min_age: 25, max_age: 40, interests: "music, food", goal: "dating", status: "active", discovery_enabled: true, show_online_status: true };
const other = { user_id: "u-bola", display_name: "Bola", age: 30, gender: "male", seeking: "female", min_age: 20, max_age: 40, interests: "music", goal: "dating", status: "active", discovery_enabled: true, show_online_status: true };

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);
const pres = (uid, over = {}) => ({
  user_id: uid, status: "DISCOVERABLE", zone_lat: 6.52, zone_lng: 3.38,
  last_seen_at: new Date(NOW - 60000).toISOString(),
  expires_at: new Date(NOW + 10 * 60000).toISOString(), ...over,
});
const zoneMe = { zone_lat: 6.52, zone_lng: 3.39 };

describe("LOCATION PRIVACY — no coordinates or exact distance ever escape", () => {
  it("a discovery card contains no coordinate, distance-number or movement keys", () => {
    const card = safeCard(other, pres("u-bola"), 2.3, 70);
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/lat|lng|coord|distance|km|gps|route|pickup|dest/i);
    expect(card.band).toBe("NEARBY"); // a LABEL, never a number
    expect(Number(card.band)).toBeNaN();
  });

  it("the zone is coarse (~2km cell) and per-user jittered — no raw position persists, same address ≠ same zone point", () => {
    const a = zoneOf(6.5244, 3.3792, "user-a");
    const b = zoneOf(6.5244, 3.3792, "user-b");
    expect(zoneOf(6.5244, 3.3792, "user-a")).toEqual(a); // deterministic
    expect(a.zone_lat).not.toBe(b.zone_lat); // two people at one spot never share a leakable point
    expect(Math.abs(a.zone_lat - 6.5244)).toBeLessThan(0.05); // ~within one coarse cell
  });

  it("distance bands are labels only — 'VERY CLOSE' through 'IN YOUR CITY'", () => {
    expect(bandOf(0.4)).toBe("VERY CLOSE");
    expect(bandOf(2)).toBe("NEARBY");
    expect(bandOf(5)).toBe("A FEW KM AWAY");
    expect(bandOf(12)).toBe("WITHIN YOUR AREA");
    expect(bandOf(80)).toBe("IN YOUR CITY");
    expect(bandOf(-1)).toBe("IN YOUR CITY");
  });

  it("map aggregation draws only 2+ person areas — a lone person is never pinpointed", () => {
    const zones = aggregateZones([pres("u-a"), pres("u-b"), { ...pres("u-c", { zone_lat: 6.6, zone_lng: 3.4 }) }]);
    expect(zones).toHaveLength(1); // the lone zone (u-c) is hidden
    expect(zones[0].count).toBe(2);
    expect(zones[0].user_id).toBeUndefined(); // no identity is bound to a map area
  });
});

describe("PRESENCE — ephemeral, expiring, privacy-respecting", () => {
  it("expired presence is invisible to discovery (location data expires)", () => {
    const cards = eligibleDiscovery({
      viewer: me, viewerZone: zoneMe, profiles: [other],
      presences: [pres("u-bola", { expires_at: new Date(NOW - 60000).toISOString() })],
      myLikes: [], myMatches: [], blocksInvolved: [],
    });
    expect(cards).toHaveLength(0);
  });

  it("busy / in-call / paused users are never discoverable", () => {
    for (const status of ["BUSY", "IN_CALL", "PAUSED", "OFFLINE"]) {
      const cards = eligibleDiscovery({
        viewer: me, viewerZone: zoneMe, profiles: [other],
        presences: [pres("u-bola", { status })], myLikes: [], myMatches: [], blocksInvolved: [],
      });
      expect(cards).toHaveLength(0);
    }
  });

  it("online status respects the profile switch and never leaks a precise time", () => {
    expect(onlineStatusOf({ show_online_status: false }, pres("u-bola"), NOW)).toBeNull(); // hidden entirely
    expect(onlineStatusOf(other, pres("u-bola"), NOW)).toBe("ONLINE");
    expect(onlineStatusOf(other, pres("u-bola", { last_seen_at: new Date(NOW - 20 * 60000).toISOString() }), NOW)).toBe("RECENTLY_ACTIVE");
    expect(onlineStatusOf(other, pres("u-bola", { expires_at: new Date(NOW - 60000).toISOString() }), NOW)).toBe("OFFLINE");
  });
});

describe("MATCHING — consent and preference driven, never proximity-driven", () => {
  const eligible = (over = {}) => eligibleDiscovery({
    viewer: me, viewerZone: zoneMe, profiles: [other],
    presences: [pres("u-bola")], myLikes: [], myMatches: [], blocksInvolved: [],
    now: NOW, ...over,
  });

  it("a compatible adult within range is discovered with a strength score", () => {
    const cards = eligible();
    expect(cards).toHaveLength(1);
    expect(cards[0].strength).toBeGreaterThan(0);
    expect(cards[0].strength).toBeLessThanOrEqual(100);
  });

  it("proximity + gender alone NEVER match — incompatible preferences exclude even VERY CLOSE users", () => {
    expect(genderAgeCompatible(me, { ...other, gender: "male", seeking: "male" })).toBe(false); // he doesn't seek women
    expect(matchStrength(me, { ...other, seeking: "male" })).toBe(0);
    const cards = eligibleDiscovery({
      viewer: me, viewerZone: { zone_lat: 6.5245, zone_lng: 3.3792 },
      profiles: [{ ...other, seeking: "male" }], // near + right gender, wrong preference
      presences: [pres("u-bola", { zone_lat: 6.5245, zone_lng: 3.3792 })],
      myLikes: [], myMatches: [], blocksInvolved: [], now: NOW,
    });
    expect(cards).toHaveLength(0);
  });

  it("minors and non-opted-in users can never be discovered", () => {
    for (const bad of [{ age: 17 }, { status: "paused" }, { status: "deleted" }, { discovery_enabled: false }]) {
      const cards = eligibleDiscovery({
        viewer: me, viewerZone: zoneMe, profiles: [{ ...other, ...bad }],
        presences: [pres("u-bola")], myLikes: [], myMatches: [], blocksInvolved: [], now: NOW,
      });
      expect(cards).toHaveLength(0);
    }
    expect(discoveryRangeKm({ premium: false })).toBe(10);
    expect(discoveryRangeKm({ premium: true })).toBe(25);
  });

  it("already liked/passed, matched, and blocked-in-either-direction users are excluded", () => {
    const cases = [
      { myLikes: [{ user_id: "u-me", target_user_id: "u-bola", action: "PASS" }], myMatches: [], blocksInvolved: [] },
      { myLikes: [{ user_id: "u-me", target_user_id: "u-bola", action: "LIKE" }], myMatches: [], blocksInvolved: [] },
      { myLikes: [], myMatches: [{ id: "m", match_key: "x", user_a: "u-bola", user_b: "u-me", members: ["u-me", "u-bola"], status: "ACTIVE" }], blocksInvolved: [] },
      { myLikes: [], myMatches: [], blocksInvolved: [{ blocker_id: "u-me", blocked_id: "u-bola" }] }, // I blocked them
      { myLikes: [], myMatches: [], blocksInvolved: [{ blocker_id: "u-bola", blocked_id: "u-me" }] }, // they blocked me
    ];
    for (const c of cases) {
      const cards = eligibleDiscovery({
        viewer: me, viewerZone: zoneMe, profiles: [other],
        presences: [pres("u-bola")], myLikes: [], myMatches: [], blocksInvolved: [], now: NOW, ...c,
      });
      expect(cards).toHaveLength(0);
    }
  });

  it("mutual like produces exactly one deterministic match key from either side", () => {
    expect(matchKeyOf("u-bola", "u-me")).toBe(matchKeyOf("u-me", "u-bola"));
    expect(isMutualLike({ action: "LIKE" }, { action: "LIKE" })).toBe(true);
    expect(isMutualLike({ action: "LIKE" }, { action: "PASS" })).toBe(false);
    expect(isMutualLike(undefined, { action: "LIKE" })).toBe(false);
  });
});

describe("CALL AUTHORIZATION, DECLINE AND COOLDOWN", () => {
  it("blocked users cannot call; unmatched users cannot call", () => {
    expect(canCall({ matchStatus: "ACTIVE", blockedEither: true, callConsentAt: "x" }).ok).toBe(false);
    expect(canCall({ matchStatus: "UNMATCHED", blockedEither: false, callConsentAt: "x" }).ok).toBe(false);
  });

  it("calls require prior consent", () => {
    expect(canCall({ matchStatus: "ACTIVE", blockedEither: false, callConsentAt: "" }).ok).toBe(false);
  });

  it("a declined call starts a cooldown — repeated ringing is refused", () => {
    const g = canCall({ matchStatus: "ACTIVE", blockedEither: false, callConsentAt: "x", minutesSinceDecline: 3 });
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("cooldown");
    expect(canCall({ matchStatus: "ACTIVE", blockedEither: false, callConsentAt: "x", minutesSinceDecline: 30 }).ok).toBe(true);
  });
});

describe("MESSAGE SAFETY — dedupe and rate limits", () => {
  it("duplicate realtime deliveries never create duplicate messages", () => {
    const a = { id: "r1", client_id: "c1", body: "hi", created_at: "2026-09-11T12:00:00Z" };
    const b = { id: "r2", client_id: "c1", body: "hi", created_at: "2026-09-11T12:00:00Z" }; // retried delivery
    const c = { id: "r3", client_id: "c2", body: "there", created_at: "2026-09-11T12:01:00Z" };
    const merged = mergeMessages([a], [b, c]);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.body)).toEqual(["hi", "there"]); // chronological
  });

  it("more than 20 messages per minute is refused", () => {
    const now = Date.now();
    expect(messageRateOk(Array.from({ length: 20 }, () => now - 1000), now)).toBe(false);
    expect(messageRateOk(Array.from({ length: 5 }, () => now - 1000), now)).toBe(true);
    expect(messageRateOk([], now)).toBe(true);
  });
});

describe("RIDE DATA SEPARATION", () => {
  it("discovery output can never carry ride fields", () => {
    const card = safeCard({ ...other, pickup: "secret", dest: "secret", driver: "secret", fare: 5000 }, pres("u-bola"), 2, 60);
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/pickup|dest|driver|fare|ride|trip/i);
  });
});