import React from "react";
import { ClipboardPaste, Loader2, TriangleAlert } from "lucide-react";
import { analyzePaste } from "@/lib/monsterPaste/pasteFlow";
import MonsterPasteResults from "./MonsterPasteResults";

// PASTE BETTING GAMES — paste any betting-site fixture text and MONSTER
// parses, matches, analyzes and ranks it automatically. No manual formatting.
const EXAMPLE = "Arsenal vs Chelsea\nMan City vs Liverpool\nBarcelona vs Real Madrid\nHome 1.85 / Draw 3.60 / Away 4.20";

const Chip = ({ label, value, tone = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tone || "border-white/10 bg-white/5 text-[#8a99ad]"}`}>
    {label}: <b className="text-white">{value}</b>
  </span>
);

export default function MonsterPasteBox() {
  const [text, setText] = React.useState("");
  const [phase, setPhase] = React.useState("idle"); // idle | building | done | error
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  const analyze = async () => {
    if (!text.trim() || phase === "building") return;
    setPhase("building");
    setError("");
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await analyzePaste({
        text,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError(String(e?.message || e));
      setPhase("error");
    }
  };

  const s = result?.stats;

  return (
    <div className="mdouble-frame">
      <div className="mdouble-inner rounded-[14px] p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 mtext-green shrink-0" />
          <p className="text-xs font-black text-white tracking-[0.14em]">PASTE BETTING GAMES</p>
          <span className="text-[9px] text-[#8a99ad] tracking-wider hidden sm:inline">— COPIED FIXTURES & MARKETS, ANALYZED AUTOMATICALLY</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Paste fixtures from any betting site — no formatting needed.\n\ne.g.\n${EXAMPLE}`}
          rows={5}
          className="w-full rounded-xl border border-white/10 bg-[#0b0e14] p-3 text-xs text-white placeholder:text-white/25 leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#00e676]/50 resize-y min-h-[110px]"
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] text-white/40 leading-snug">
            The parser extracts games, kickoff times and prices automatically. Games that cannot be verified in the RIDE X pool are rejected honestly — never analyzed from invented data.
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={!text.trim() || phase === "building"}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#00e676] px-4 py-2 text-[11px] font-black text-[#0b0e14] disabled:opacity-40"
          >
            {phase === "building" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
            {phase === "building" ? "ANALYZING…" : "ANALYZE GAMES"}
          </button>
        </div>

        {phase === "building" && (
          <p className="text-[10px] mtext-cyan font-bold">
            {progress.total ? `Scanning the verified fixture pool — ${progress.done}/${progress.total} leagues…` : "Parsing the paste…"}
          </p>
        )}
        {phase === "error" && (
          <p className="text-[10px] text-rose-300 font-bold inline-flex items-start gap-1.5">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Analysis temporarily unavailable — {error}. Nothing was fabricated; try again shortly.
          </p>
        )}

        {phase === "done" && s && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Chip label="GAMES DETECTED" value={s.gamesDetected} />
            <Chip label="MARKETS DETECTED" value={s.marketsDetected} />
            <Chip label="DUPLICATES REMOVED" value={s.duplicatesRemoved} />
            <Chip label="MATCHED" value={s.gamesMatched} tone="border-[#00e676]/40 bg-[#00e676]/10 text-[#00e676]" />
            <Chip label="REVIEW NEEDED" value={s.gamesReview} tone={s.gamesReview ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : ""} />
            <Chip label="NOT IN VERIFIED POOL" value={s.gamesNotFound} tone={s.gamesNotFound ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : ""} />
            <Chip label="QUALIFIED PICKS" value={s.picksQualified} tone={s.picksQualified ? "border-[#00b0ff]/40 bg-[#00b0ff]/10 mtext-cyan" : ""} />
          </div>
        )}

        {phase === "done" && result && <MonsterPasteResults result={result} />}
      </div>
    </div>
  );
}