// SPOKEN LIVE-SCORE COMMENTARY — the announcer speaks the scoring player's
// name when the data feed carries it (API-Football goal events carry the real
// scorer's name for the major soccer leagues) and shouts the sport's real
// term — GOAL for soccer and ice hockey, touchdown for American football,
// basket for basketball, set for tennis, try for rugby — always with the
// real live scoreline. Nothing is ever invented: no player name in the feed
// → the team is announced with the real score.

// Pick the clearest English voice available (Google/Natural/Premium first)
// so the announcer always sounds crisp, never a robotic default.
let foundVoice = null;
function pickVoice() {
  try {
    if (foundVoice) return foundVoice;
    const voices = window.speechSynthesis.getVoices() || [];
    const score = (v) =>
      (/en[-_]?(us|gb)/i.test(v.lang || "") ? (/google|natural|premium|enhanced|neural/i.test(v.name || "") ? 3 : 2) : 0);
    foundVoice = voices.map((v) => ({ v, s: score(v) + (/^en/i.test(v.lang || "") ? 0.1 : 0) })).sort((a, b) => b.s - a.s)[0]?.v || null;
    return foundVoice;
  } catch {
    return null;
  }
}

export function speak(text, { rate = 1.02, pitch = 1.12, volume = 1 } = {}) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    const v = pickVoice();
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

// The sport's stadium-shout, fired with excitement before the detail call.
const SHOUT = {
  soccer: "GOOOAL!",
  ice_hockey: "GOOOAL!",
  basketball: "YESSS! WHAT A BASKET!",
  american_football: "TOUCHDOWWWN!",
  baseball: "AND THAT'S A RUN!",
  tennis: "BIG SET!",
  rugby: "TRRRY!",
};

// Announce a score the way a commentator does: an excited SHOUT first, then
// the clear detail line — scorer's name and real scoreline.
export function announceScore(call) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const v = pickVoice();
    const shout = new SpeechSynthesisUtterance(SHOUT[call.sport] || "SCORE!");
    shout.rate = 1.15;
    shout.pitch = 1.42;
    shout.volume = 1;
    const detail = new SpeechSynthesisUtterance(scoreCall(call));
    detail.rate = 1.04;
    detail.pitch = 1.08;
    detail.volume = 1;
    if (v) { shout.voice = v; detail.voice = v; }
    synth.speak(shout);
    synth.speak(detail);
    return true;
  } catch {
    return false;
  }
}

// The sport's real scoring call, built from the real live scoreline.
//   side  — which side scored ("home" | "away")
//   delta — how many points/runs/goals the score jumped by
//   player— the scorer's real name when the feed carries it
export function scoreCall({ sport, home, away, hs, as, side, delta, player }) {
  const team = side === "home" ? home : away;
  const scoreline = `${home} ${hs}, ${away} ${as}`;
  const scorer = player ? `${player} for ` : "";
  switch (sport) {
    case "soccer":
      return `GOAL! ${scorer}${team}! ${scoreline}`;
    case "ice_hockey":
      return `GOAL! ${scorer}${team}! ${scoreline}`;
    case "basketball":
      return `${team} score — ${delta >= 3 ? "three pointer" : delta === 2 ? "basket" : delta === 1 ? "free throw" : "points"}! ${player ? `${player}. ` : ""}${scoreline}`;
    case "american_football":
      return `${delta >= 6 ? `TOUCHDOWN ${team}!` : delta === 3 ? `Field goal, ${team}!` : `${team} add points!`} ${player ? `${player}. ` : ""}${scoreline}`;
    case "baseball":
      return `${delta >= 2 ? `${delta} runs for ${team}!` : `A run for ${team}!`} ${scoreline}`;
    case "tennis":
      return `${team} takes the set! ${scoreline}`;
    case "rugby":
      return `TRY! ${scorer}${team}! ${scoreline}`;
    default:
      return `${team} score! ${scoreline}`;
  }
}