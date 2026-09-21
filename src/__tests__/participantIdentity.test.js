import { describe, it, expect, beforeEach } from "vitest";
import {
  registerParticipantIdentities,
  resolveParticipantDisplay,
  getVerifiedIdentity,
  identityConflicts,
  isAnonymousParticipantLabel,
} from "@/lib/participantIdentity";

// PARTICIPANT IDENTITY RESOLUTION — display-only enrichment. The provider id
// is the identity key and NEVER changes; the human-readable name is a display
// field resolved from verified payloads; nothing is ever guessed.

beforeEach(() => {
  localStorage.clear();
});

describe("anonymous label detection", () => {
  it("detects legacy anonymous provider-id labels", () => {
    expect(isAnonymousParticipantLabel("Player 2293-2699")).toBe(true);
    expect(isAnonymousParticipantLabel("Player 3540-10685")).toBe(true);
    expect(isAnonymousParticipantLabel("Player 2012")).toBe(true);
  });

  it("never flags real participant names as anonymous", () => {
    expect(isAnonymousParticipantLabel("Jacob Fearnley")).toBe(false);
    expect(isAnonymousParticipantLabel("Christian Harrison / Neal Skupski")).toBe(false);
    expect(isAnonymousParticipantLabel("Unknown Player")).toBe(false);
    expect(isAnonymousParticipantLabel("")).toBe(false);
  });
});

describe("name resolution from provider payloads", () => {
  it("resolves a real provider participant name by id", () => {
    registerParticipantIdentities([{ providerId: "9001-9002", name: "Luisa Stefani / Neal Skupski" }]);
    expect(getVerifiedIdentity("9001-9002")).toBe("Luisa Stefani / Neal Skupski");
  });

  it("keeps the provider id unchanged as the identity key", () => {
    registerParticipantIdentities([{ providerId: "9001-9002", name: "Luisa Stefani / Neal Skupski" }]);
    // the id is still the lookup key — resolution adds a display name, never a new identity
    expect(getVerifiedIdentity("9001-9002")).not.toBeNull();
    expect(getVerifiedIdentity("9999-9999")).toBeNull();
  });

  it("resolves both participants of one fixture independently — selection stays attached to the right participant", () => {
    registerParticipantIdentities([
      { providerId: "9100-9101", name: "Alpha Pair" },
      { providerId: "9200-9201", name: "Beta Pair" },
    ]);
    expect(getVerifiedIdentity("9100-9101")).toBe("Alpha Pair");
    expect(getVerifiedIdentity("9200-9201")).toBe("Beta Pair");
    // Home/Away ordering is preserved — each id resolves to its own name, no swapping
    const home = resolveParticipantDisplay("Player 9100-9101");
    const away = resolveParticipantDisplay("Player 9200-9201");
    expect(home).toBe("Alpha Pair");
    expect(away).toBe("Beta Pair");
  });

  it("resolves the verified seed identities (US Open doubles records)", () => {
    expect(getVerifiedIdentity("2293-2699")).toBe("Christian Harrison / Neal Skupski");
    expect(getVerifiedIdentity("3540-10685")).toBe("Harri Heliovaara / Henry Patten");
  });
});

describe("display resolution", () => {
  it("replaces an anonymous label with the verified name", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "Real Name A" }]);
    expect(resolveParticipantDisplay("Player 111-222")).toBe("Real Name A");
  });

  it("resolves anonymous labels embedded in market labels (historical records)", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "Real Name A" }]);
    expect(resolveParticipantDisplay("Player 111-222 to Win")).toBe("Real Name A to Win");
  });

  it("displays Unknown Player when no verified name exists — never a fabricated identity", () => {
    expect(resolveParticipantDisplay("Player 555-555")).toBe("Unknown Player");
    expect(resolveParticipantDisplay("Player 555-555 to Win")).toBe("Unknown Player to Win");
  });

  it("passes real names and plain strings through unchanged", () => {
    expect(resolveParticipantDisplay("Jacob Fearnley")).toBe("Jacob Fearnley");
    expect(resolveParticipantDisplay("Arsenal vs Chelsea")).toBe("Arsenal vs Chelsea");
    expect(resolveParticipantDisplay("Over 2.5")).toBe("Over 2.5");
    expect(resolveParticipantDisplay("")).toBe("");
    expect(resolveParticipantDisplay(null)).toBe("");
  });
});

describe("cache / provider-failure behaviour", () => {
  it("a cached verified name survives a temporary provider failure (no re-registration needed)", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "Real Name A" }]);
    // provider outage → no new registrations arrive; the cached identity still resolves
    expect(resolveParticipantDisplay("Player 111-222")).toBe("Real Name A");
  });

  it("a known name is never replaced by an anonymous label again", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "Real Name A" }]);
    // a later feed returning only an id must not register an anonymous "name"
    registerParticipantIdentities([{ providerId: "111-222", name: "Player 111-222" }]);
    expect(getVerifiedIdentity("111-222")).toBe("Real Name A");
  });

  it("anonymous and placeholder names are never registered", () => {
    registerParticipantIdentities([
      { providerId: "333-444", name: "Player 333-444" },
      { providerId: "555-666", name: "Unknown Player" },
      { providerId: "777-888", name: "  " },
    ]);
    expect(getVerifiedIdentity("333-444")).toBeNull();
    expect(getVerifiedIdentity("555-666")).toBeNull();
    expect(getVerifiedIdentity("777-888")).toBeNull();
  });
});

describe("identity conflict safety", () => {
  it("flags a conflicting identity rather than guessing — the last verified name is kept", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "First Verified" }]);
    registerParticipantIdentities([{ providerId: "111-222", name: "Second Verified" }]);
    expect(getVerifiedIdentity("111-222")).toBe("Second Verified"); // last verified wins
    const conflicts = identityConflicts();
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].providerId).toBe("111-222");
    expect(conflicts[0].was).toBe("First Verified");
    expect(conflicts[0].now).toBe("Second Verified");
  });

  it("re-registering the SAME verified name records no conflict", () => {
    registerParticipantIdentities([{ providerId: "111-222", name: "Real Name A" }]);
    registerParticipantIdentities([{ providerId: "111-222", name: "real name a" }]);
    expect(identityConflicts().length).toBe(0);
  });

  it("never maps one participant onto another through fuzzy similarity — identity is keyed by provider id only", () => {
    registerParticipantIdentities([
      { providerId: "111-222", name: "Jacob Fearnley" },
      { providerId: "111-223", name: "Jacob Fernley" }, // a different id is a different person
    ]);
    expect(getVerifiedIdentity("111-222")).toBe("Jacob Fearnley");
    expect(getVerifiedIdentity("111-223")).toBe("Jacob Fernley");
    expect(resolveParticipantDisplay("Player 111-222")).toBe("Jacob Fearnley");
    expect(resolveParticipantDisplay("Player 111-223")).toBe("Jacob Fernley");
  });
});

describe("data integrity — display enrichment only", () => {
  it("resolution never rewrites a stored record's identity fields", () => {
    const stored = { id: "rec-1", fixture_id: "espn-182904", home: "Player 2293-2699", market_label: "Player 2293-2699 to Win" };
    // the stored record is untouched — only the RENDERED string changes
    const renderedHome = resolveParticipantDisplay(stored.home);
    const renderedLabel = resolveParticipantDisplay(stored.market_label);
    expect(stored.home).toBe("Player 2293-2699"); // record unchanged
    expect(stored.fixture_id).toBe("espn-182904"); // stable ids unchanged
    expect(renderedHome).toBe("Christian Harrison / Neal Skupski");
    expect(renderedLabel).toBe("Christian Harrison / Neal Skupski to Win");
  });
});