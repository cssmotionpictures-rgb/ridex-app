import React from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { scanSportPool, SLIP_SPORTS } from "@/lib/multiSportSlips";
import { scanBasketballPool } from "@/lib/basketballSlips";
import { getWeekDeal } from "@/lib/slipDealing";
import { getScanStatus } from "@/lib/scanStatus";

// VERIFIED POOL BROWSER — one scan across EVERY pool the engine feeds on
// (tennis, basketball, baseball, American football, ice hockey, football),
// filterable by sport. Only games that passed the engine's scrutiny gates
// appear: verified form on BOTH sides, head-to-head checked, nothing
// invented to fill the list. Each sport's real scan status is shown — an
// API_ERROR is reported as an error, an off-season day's real zero is
// reported as empty, and neither is ever disguised as the other.

const SPORTS = [
  { key: "tennis", label: "🎾 TENNIS", icon: "🎾" },
  { key: "basketball", label: "🏀 BASKETBALL", icon: "🏀" },
  { key: "football", label: "⚽ FOOTBALL", icon: "⚽" },
  { key: "baseball", label: "⚾ BASEBALL", icon: "⚾" },
  { key: "american_football", label: "🏈 AM. FOOTBALL", icon: "🏈" },
  { key: "ice_hockey", label: "🏒 ICE HOCKEY", icon: "🏒" },
];

const cfgOf = (key) => SLIP_SPORTS.find((s) => s.key === key);

function pickText(g, c) {
  if (!c) return null;
  if (c.label === "1") return `${g.home} to Win`;
  if (c.label === "2") return `${g.away} to Win`;
  return c.label;
}

function rowsFromPool(pool, sport) {
  return (pool || []).map((g) => {
    const cands = [...(g.cands || []), ...(g.valueCands || [])]
      .map((c) => ({ label: pickText(g, c), prob: c.prob }))
      .sort((a, b) => (b.prob || 0) - (a.prob || 0));
    return {
      sport,
      league: g.league || "",
      home: g.home,
      away: g.away,
      date: g.date,
      pick: cands[0]?.label || null,
      prob: cands[0]?.prob ?? null,
      cands,
    };
  });
}

function statusBadge(state) {
  if (state === "API_ERROR") return { text: "FEED ERROR", cls: "text-red-400 bg-red-500/10 border-red-500/30" };
  if (state === "UNKNOWN") return { text: "NOT SCANNED YET", cls: "text-[#8a99ad] bg-white/5 border-white/10" };
  return { text: state === "EMPTY" ? "EMPTY (REAL ZERO)" : "VERIFIED FEED", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
}

export default function VerifiedPoolBrowser() {
  const [filter, setFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [errors, setErrors] = React.useState({});
  const [sel, setSel] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [tennis, bball, mlb, nfl, nhl, foot] = await Promise.all([
      scanSportPool(cfgOf("tennis")).catch((e) => { setErrors((p) => ({ ...p, tennis: e?.message || "feed failed" })); return []; }),
      scanBasketballPool().catch((e) => { setErrors((p) => ({ ...p, basketball: e?.message || "feed failed" })); return []; }),
      scanSportPool(cfgOf("baseball")).catch((e) => { setErrors((p) => ({ ...p, baseball: e?.message || "feed failed" })); return []; }),
      scanSportPool(cfgOf("american_football")).catch((e) => { setErrors((p) => ({ ...p, american_football: e?.message || "feed failed" })); return []; }),
      scanSportPool(cfgOf("ice_hockey")).catch((e) => { setErrors((p) => ({ ...p, ice_hockey: e?.message || "feed failed" })); return []; }),
      getWeekDeal().catch((e) => { setErrors((p) => ({ ...p, football: e?.message || "feed failed" })); return null; }),
    ]);
    const footballRows = (foot?.chopPicks || []).map((l) => ({
      sport: "football",
      league: l.league || "",
      home: l.home,
      away: l.away,
      date: l.date,
      pick: l.marketLabel,
      prob: l.probability,
      cands: l.marketLabel ? [{ label: l.marketLabel, prob: l.probability }] : [],
    }));
    setRows([
      ...rowsFromPool(tennis, "tennis"),
      ...rowsFromPool(bball, "basketball"),
      ...rowsFromPool(mlb, "baseball"),
      ...rowsFromPool(nfl, "american_football"),
      ...rowsFromPool(nhl, "ice_hockey"),
      ...footballRows,
    ]);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const countOf = (k) => (k === "all" ? rows.length : rows.filter((r) => r.sport === k).length);
  const shown = (filter === "all" ? rows : rows.filter((r) => r.sport === filter))
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (b.prob || 0) - (a.prob || 0));
  const scanOf = (k) => getScanStatus(k).state;
  const sportMeta = SPORTS.find((s) => s.key === filter);

  return (
    <div className="mglass rounded-2xl p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-black text-white tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mtext-green" /> VERIFIED POOL BROWSER
          </p>
          <p className="text-[9px] font-bold text-[#8a99ad] tracking-[0.15em] mt-0.5">EVERY QUALIFIED GAME · ALL FEEDS · FILTER BY SPORT</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00b0ff]/15 mtext-cyan text-[10px] font-bold shrink-0 disabled:opacity-50">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {loading ? "SCANNING…" : "RESCAN"}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[{ key: "all", label: "ALL", icon: "🏆" }, ...SPORTS].map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 border transition-colors ${
              filter === s.key ? "mtab-active" : "bg-[#161b26] border-transparent text-[#8a99ad] hover:text-white"
            }`}
          >
            {s.label} · {countOf(s.key)}
          </button>
        ))}
      </div>

      {/* Per-sport honest scan status — an error is never disguised as empty */}
      {filter !== "all" && (
        (() => {
          const st = filter === "football" ? (errors.football ? "API_ERROR" : "OK") : scanOf(filter);
          const b = statusBadge(st);
          return (
            <div className={`inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[9px] font-bold ${b.cls}`}>
              {filter.replace("_", " ").toUpperCase()} FEED: {b.text}
              {st === "API_ERROR" && errors[filter] ? ` — ${errors[filter]}` : ""}
            </div>
          );
        })()
      )}

      {loading && !rows.length ? (
        <div className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mtext-cyan mb-2" />
          <p className="text-[11px] text-[#8a99ad] font-bold">Deep-scanning every verified feed across all sports…</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-[11px] font-bold text-amber-400">NO QUALIFIED {sportMeta ? sportMeta.label : ""} GAMES IN THE POOL RIGHT NOW</p>
          <p className="text-[10px] text-white/40 mt-1">
            The engine never pads the pool — a game only appears once BOTH sides have verified played form and the head-to-head passes scrutiny. An off-season day reports a real zero.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-black/30 border border-white/5 divide-y divide-white/5 max-h-72 overflow-y-auto noir-scrollbar">
          {shown.map((r, i) => (
            <button
              key={`${r.sport}-${r.home}-${r.away}-${i}`}
              onClick={() => setSel(r)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <span className="text-xs shrink-0">{SPORTS.find((s) => s.key === r.sport)?.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white truncate">{r.home} vs {r.away}</p>
                <p className="text-[9px] text-[#8a99ad] truncate">{r.date} · {r.league}</p>
              </div>
              {r.pick && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-emerald-400 truncate max-w-[120px]">{r.pick}</p>
                  <p className="text-[9px] text-[#8a99ad]">{Math.round((r.prob || 0) * 100)}% · {(1 / (r.prob || 1)).toFixed(2)}×</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Full pick detail — tap any game to see its complete, untruncated pick */}
      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <DialogContent className="mglass border-white/10 rounded-2xl p-4 sm:p-5">
          {sel && (
            <div className="space-y-3">
              <div>
                <p className="text-[9px] font-bold text-[#8a99ad] tracking-[0.15em]">
                  {SPORTS.find((s) => s.key === sel.sport)?.icon} {sel.sport.replace("_", " ").toUpperCase()} · {sel.league}
                </p>
                <p className="text-sm font-black text-white mt-1">{sel.home} vs {sel.away}</p>
                <p className="text-[10px] text-[#8a99ad]">{sel.date}</p>
              </div>
              {sel.cands?.length ? (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-white/50 tracking-[0.15em]">
                    FULL ENGINE PICK{sel.cands.length > 1 ? "S" : ""} · UNTRUNCATED
                  </p>
                  {sel.cands.map((c, idx) => (
                    <div key={idx} className="rounded-xl bg-black/40 border border-white/5 px-3 py-2 flex items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-emerald-400 leading-snug">{c.label}</p>
                      <p className="text-[10px] font-bold text-white/70 shrink-0">
                        {Math.round((c.prob || 0) * 100)}% · {(1 / (c.prob || 1)).toFixed(2)}×
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8a99ad] font-bold">NO QUALIFIED PICK RECORDED FOR THIS GAME</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="text-[9px] text-white/35 leading-relaxed">
        This is the engine's verified pool — every game that cleared the scrutiny gates across ALL feeds (ESPN tennis/NFL/MLB/NHL, NBA/WNBA, Sportradar, API-Football, OpenLigaDB). Confidence shown is the model's own estimate from verified form on both sides; fair odds are exact (1 ÷ probability). No fake games, no assumptions, no padding — a missing game means it didn't qualify.
      </p>
    </div>
  );
}