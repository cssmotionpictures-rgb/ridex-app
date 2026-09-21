// SHARED PARTICIPANT IDENTITY RESOLUTION — the ONE path every RIDE X surface
// uses to turn provider participant ids into customer-facing names.
//
// IDENTITY RULES:
//   * The provider participant id is the IDENTITY KEY (internal metadata,
//     deterministic matching) — it is NEVER displayed to customers.
//   * The human-readable name is a DISPLAY FIELD resolved from verified
//     provider payloads. A name is NEVER guessed, never inferred from an id,
//     and never fuzzy-matched between two different people.
//   * If no verified name exists anywhere → "Unknown Player" (an honest
//     unknown, never a raw provider id).
//   * If the provider returns a CONFLICTING name for the same id, the last
//     VERIFIED name is kept and the conflict is recorded for internal
//     diagnostics — never silently switched, never guessed.
//
// Verified identities persist in localStorage, so a temporary provider
// outage never replaces a known name with "Player {id}" — the cached
// verified identity keeps rendering.

const MAP_KEY = "rx-participant-identity";
const CONFLICTS_KEY = "rx-participant-identity-conflicts";

// Bare anonymous label exactly as the legacy fallback produced it
// ("Player 2293-2699" — a provider participant id, never a name).
const ANON_BARE_RE = /^Player\s+(\d[\d-]*)$/;
// Anonymous labels embedded inside longer display strings
// (e.g. market labels like "Player 2293-2699 to Win").
const ANON_GLOBAL_RE = /\bPlayer\s+(\d[\d-]*)/g;

// VERIFIED SEED — identities resolved directly from the authoritative ESPN
// provider payload (US Open 2026 doubles pairings, verified 2026-09-10) for
// records that were stored before the source fix landed. These are the
// provider's own roster display names, not invented or web-searched names.
const VERIFIED_SEED = [
  { providerId: "2293-2699", name: "Christian Harrison / Neal Skupski", provenance: "ESPN provider payload · US Open 2026 · Men's Doubles" },
  { providerId: "3540-10685", name: "Harri Heliovaara / Henry Patten", provenance: "ESPN provider payload · US Open 2026 · Men's Doubles" },
  { providerId: "1375-2732", name: "Gabriela Dabrowski / Luisa Stefani", provenance: "ESPN provider payload · US Open 2026 · Women's Doubles" },
  { providerId: "6724-6723", name: "Ashlyn Krueger / Robin Montgomery", provenance: "ESPN provider payload · US Open 2026 · Women's Doubles" },
  { providerId: "279-3548", name: "Simone Bolelli / Andrea Vavassori", provenance: "ESPN provider payload · US Open 2026 · Men's Doubles" },
];

const norm = (s) => String(s || "").toLowerCase().trim();

let seeding = false;
// Idempotent per map state: the seed identities are re-registered whenever
// the map is missing them (fresh device, cleared storage) — never just once
// per process, so resolution survives storage resets.
function ensureSeed() {
  if (seeding) return;
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(MAP_KEY)) || {}; } catch {}
  if (raw[VERIFIED_SEED[0].providerId]) return; // already seeded
  seeding = true; // register → readMap → ensureSeed must not recurse
  try {
    registerParticipantIdentities(VERIFIED_SEED);
  } finally {
    seeding = false;
  }
}

function readMap() {
  ensureSeed();
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY)) || {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {}
}

function readConflicts() {
  try {
    return JSON.parse(localStorage.getItem(CONFLICTS_KEY)) || [];
  } catch {
    return [];
  }
}

function recordConflict(providerId, was, now) {
  const list = readConflicts();
  list.push({
    providerId,
    was,
    now,
    at: new Date().toISOString(),
  });
  try {
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify(list.slice(-100)));
  } catch {}
}

// Register verified participant identities from an authoritative provider
// payload. Anonymous/placeholder names are never registered — an unverified
// identity stays unknown rather than being "confirmed" by a placeholder.
export function registerParticipantIdentities(entries) {
  const map = readMap();
  for (const e of entries || []) {
    const providerId = String(e?.providerId || "").trim();
    const name = String(e?.name || "").trim();
    if (!providerId || !name) continue;
    if (isAnonymousParticipantLabel(name) || norm(name) === "unknown player") continue;
    const existing = map[providerId];
    if (existing && norm(existing.name) !== norm(name)) {
      // IDENTITY CONFLICT — the last verified identity wins, the disagreement
      // is flagged for internal diagnostics. Never a silent switch, never a
      // fuzzy guess between the two.
      recordConflict(providerId, existing.name, name);
    }
    map[providerId] = {
      name,
      provenance: String(e?.provenance || ""),
      verifiedAt: new Date().toISOString(),
    };
  }
  writeMap(map);
}

// The verified display name for one provider participant id — null when no
// verified identity exists (the id itself is never returned as a name).
export function getVerifiedIdentity(providerId) {
  const entry = readMap()[String(providerId || "").trim()];
  return entry?.name || null;
}

// IDENTITY CONFLICTS — internal/admin diagnostics only, never customer-facing.
export function identityConflicts() {
  return readConflicts();
}

export function isAnonymousParticipantLabel(value) {
  return ANON_BARE_RE.test(String(value || "").trim());
}

// Resolve a display string to its customer-facing form:
//   * a bare anonymous label ("Player 2293-2699") → the verified name, or
//     "Unknown Player" when no verified identity exists;
//   * an anonymous label embedded in a longer string (market labels like
//     "Player 2293-2699 to Win") → resolved inside the string;
//   * every other string passes through UNCHANGED — real names, team names
//     and any text without an anonymous label are never rewritten.
// The provider id itself is never shown; an unverifiable identity displays
// "Unknown Player", never a fabricated name.
export function resolveParticipantDisplay(value) {
  const s = value == null ? "" : String(value);
  if (!s) return s;
  const bare = ANON_BARE_RE.exec(s.trim());
  if (bare) return getVerifiedIdentity(bare[1]) || "Unknown Player";
  if (!/\bPlayer\s+\d/.test(s)) return s;
  return s.replace(ANON_GLOBAL_RE, (match, id) => getVerifiedIdentity(id) || "Unknown Player");
}