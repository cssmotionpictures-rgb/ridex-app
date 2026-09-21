// GLOBAL PREDICTION PARSER — conservative and rule-based. Users paste messy
// results from ANY RIDE X prediction section; this parser extracts what can be
// extracted with confidence and marks everything else UNRESOLVED with the exact
// reason. Nothing ambiguous is ever guessed — unresolved lines are shown back
// to the user instead of being settled on an interpretation.

const MAX_TEAM_WORDS = 4;

const RESULT_WORDS = /\b(won|win|winner|lost|loss|void|push|cancelled)\b/i;
const RESULT_TICKS = /[✓✔✅]|❌|✗/;

function removeFirst(re, s) {
  const m = re.exec(s);
  if (!m) return { s, hit: null };
  return { s: s.slice(0, m.index) + " " + s.slice(m.index + m[0].length), hit: m };
}

function marketHintOf(s) {
  const t = ` ${s.toLowerCase()} `;
  const ou = /\b(over|under|o|u)\s*\.?\s*([1-4]\.\d)\b/.exec(t);
  if (ou) return { key: `${ou[1][0] === "u" ? "U" : "O"}${ou[2]}`, label: `${ou[1][0] === "u" ? "Under" : "Over"} ${ou[2]}` };
  if (/btts|both teams/.test(t)) return /no\b/.test(t) ? { key: "BTTS_N", label: "BTTS No" } : { key: "BTTS_Y", label: "BTTS Yes" };
  if (/\bdnb\b|draw no bet/.test(t)) return /away|\b2\b/.test(t) ? { key: "DNB2", label: "DNB Away" } : { key: "DNB1", label: "DNB Home" };
  if (/\b1x\b/.test(t)) return { key: "1X", label: "Double Chance 1X" };
  if (/\bx2\b/.test(t)) return { key: "X2", label: "Double Chance X2" };
  if (/\b12\b/.test(t) || /double chance/.test(t)) return { key: "12", label: "Double Chance 12" };
  if (/home win|\bhome\b/.test(t) && !/under|unavailable/.test(t)) return { key: "1", label: "Home Win" };
  if (/away win|\baway\b/.test(t)) return { key: "2", label: "Away Win" };
  if (/\bdraw\b/.test(t)) return { key: "X", label: "Draw" };
  return null;
}

function sourceGuessOf(raw) {
  const t = raw.toLowerCase();
  if (/win ?raba/.test(t)) return "win-raba";
  if (/big ?hammer|hammer/.test(t)) return "big-hammer";
  if (/kala/.test(t)) return "kala";
  if (/rollover/.test(t)) return "rollover";
  if (/monster/.test(t)) return "monster";
  if (/banku/.test(t)) return "banku";
  if (/morning/.test(t)) return "morning-scan";
  if (/evening/.test(t)) return "evening-scan";
  return "";
}

function words(s) {
  return String(s || "")
    .replace(/[^\p{L}\p{N} '&.-]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-•*]+|[.\-]+$/g, ""))
    .filter((w) => w && !/^\d+$/.test(w));
}

export function parseLine(raw) {
  const out = { raw, home: "", away: "", score: null, marketHint: null, resultHint: "", odds: 0, date: "", sourceGuess: sourceGuessOf(raw), resolved: false, reason: "" };
  let work = String(raw || "").trim();

  const dm = /(\d{4}-\d{2}-\d{2})/.exec(work);
  if (dm) { out.date = dm[1]; work = work.replace(dm[0], " "); }

  const tick = RESULT_TICKS.exec(work);
  if (tick) { out.resultHint = /❌|✗/.test(tick[0]) ? "lost" : "won"; work = work.replace(tick[0], " "); }
  const rw = removeFirst(RESULT_WORDS, work);
  if (rw.hit) { out.resultHint = String(rw.hit[1]).toLowerCase().replace(/winner|win$/, "won").replace("loss", "lost"); work = rw.s; }

  const om = /@\s*(\d{1,2}\.\d{1,2})/.exec(work) || /\((\d{1,2}\.\d{1,2})\)/.exec(work);
  if (om) { out.odds = Number(om[1]); work = work.replace(om[0], " "); }
  else {
    const sm = /(?:^|\s)(\d{1,2}\.\d{2})(?=\s|$)/.exec(work);
    if (sm && Number(sm[1]) >= 1.01 && Number(sm[1]) <= 50) { out.odds = Number(sm[1]); work = work.replace(sm[0], " "); }
  }

  const mh = marketHintOf(work);
  if (mh) {
    out.marketHint = mh;
    work = work.replace(new RegExp(mh.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    work = work.replace(/\b(over|under|o|u)\s*\.?\s*[1-4]\.\d\b/i, " ").replace(/\b(btts|both teams( to score)?|no|yes|dnb|draw no bet|double chance|home|away|draw|win)\b/gi, " ");
  }

  // Score detection — capture the text BEFORE and AFTER the score at match
  // time, so team extraction never uses stale offsets.
  const sc = /(?:^|[\s([])(\d{1,2})\s*[-–—:]\s*(\d{1,2})(?=[\s)\]]|$)/.exec(work);
  let before = work;
  let after = "";
  if (sc) {
    const h = Number(sc[1]);
    const a = Number(sc[2]);
    if (h <= 20 && a <= 20) {
      out.score = [h, a];
      before = work.slice(0, sc.index + 1);
      after = work.slice(sc.index + sc[0].length);
    }
  }

  const sep = /\s+(?:vs\.?|v\.?|versus)\s+/i.exec(work);
  if (sep) {
    const left = words(work.slice(0, sep.index)).slice(-MAX_TEAM_WORDS);
    const right = words(work.slice(sep.index + sep[0].length)).slice(0, MAX_TEAM_WORDS);
    out.home = left.join(" ");
    out.away = right.join(" ");
  } else if (out.score) {
    out.home = words(before).slice(-MAX_TEAM_WORDS).join(" ");
    out.away = words(after).slice(0, MAX_TEAM_WORDS).join(" ");
  } else {
    out.reason = "no score and no vs-separator — teams cannot be identified with confidence";
    return out;
  }
  if (!out.home || !out.away) {
    out.reason = !out.score ? "no final score in the line — nothing to settle" : "could not extract both team names";
    return out;
  }
  if (!out.score) { out.reason = "teams identified but no score — pending, nothing settled"; return out; }
  out.resolved = true;
  return out;
}

export function parseResultsText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[-=_*·•~.]+$/.test(l))
    .map(parseLine);
}