// Shared team-name + season helpers for backend functions. Mirrors the pure
// logic in src/lib/oddsMath.js (kept in sync — backend code cannot import
// from src/).

const STRIP_TOKENS = new Set(["fc", "cf", "afc", "ac", "as", "sc", "bc", "if", "bk", "sk", "fk"]);

export function normalizeTeamName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // strip legal suffixes and founding years, but keep meaningful digits so
    // different fixtures never false-match
    .filter((t) => t && !STRIP_TOKENS.has(t) && !(/^(18|19|20)\d{2}$/.test(t) && t >= 1800))
    .join(" ")
    .trim();
}

export function teamsMatch(a, b) {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = x.split(" ");
  const ty = y.split(" ");
  const inter = tx.filter((t) => ty.includes(t)).length;
  return inter >= 2 && inter / Math.min(tx.length, ty.length) >= 0.6;
}

// European club seasons run Aug→May: from July the new season has started.
export function currentSeason(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= 7 ? y : y - 1;
}