import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { MONSTER_SPORTS, getMonsterCards, getMonsterDouble } from "@/lib/monsterEngine";
import MonsterDoubleCard from "@/components/monster/MonsterDoubleCard";
import MonsterPasteBox from "@/components/monsterpaste/MonsterPasteBox";
import PredictionCard from "@/components/monster/PredictionCard";
import VerifiedPoolBrowser from "@/components/monster/VerifiedPoolBrowser";
import MonsterRolloverDashboard from "@/components/sports/MonsterRolloverDashboard";

function fmt(n) {
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}m`;
  if (n >= 1000) return `₦${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function MonsterEngine() {
  const [sport, setSport] = React.useState("tennis"); // defaulting to the easiest sport to win
  const [cards, setCards] = React.useState([]);
  const [scanning, setScanning] = React.useState(true);
  const [double, setDouble] = React.useState(null);
  const [doubleLoading, setDoubleLoading] = React.useState(true);
  const [bankroll, setBankroll] = React.useState(() => Number(localStorage.getItem("ridex_pro_bankroll")) || 0);

  const loadSport = React.useCallback(async (key) => {
    setScanning(true);
    setCards([]);
    try {
      setCards(await getMonsterCards(key));
    } finally {
      setScanning(false);
    }
  }, []);

  React.useEffect(() => {
    loadSport(sport);
  }, [sport, loadSport]);

  React.useEffect(() => {
    getMonsterDouble()
      .then(setDouble)
      .catch(() => setDouble(null))
      .finally(() => setDoubleLoading(false));
    const onFocus = () => setBankroll(Number(localStorage.getItem("ridex_pro_bankroll")) || 0);
    window.addEventListener("storage", onFocus);
    return () => window.removeEventListener("storage", onFocus);
  }, []);

  const active = MONSTER_SPORTS.find((s) => s.key === sport);

  return (
    <div className="monster-bg rounded-2xl border border-white/5 p-3.5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-black mtext-cyan tracking-widest leading-none">MONSTER ENGINE</h1>
          <p className="text-[9px] font-bold text-[#8a99ad] tracking-[0.25em] mt-1">INTELLIGENT PREDICTION HUB</p>
        </div>
        <div className="mpill-green rounded-full px-3.5 py-1.5 text-[13px] font-black shrink-0">
          {bankroll ? fmt(bankroll) : "SET BANKROLL"}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {MONSTER_SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSport(s.key)}
            className={`px-4 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 border transition-colors ${
              sport === s.key ? "mtab-active" : "bg-[#161b26] border-transparent text-[#8a99ad] hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <MonsterPasteBox />

      <MonsterDoubleCard double={double} loading={doubleLoading} />

      <div className={`scene-${active.scene} rounded-2xl border border-white/5 px-4 py-3`}>
        <p className="text-[10px] font-black text-white/70 tracking-[0.18em] mb-1">{active.label} — WHAT THIS TAB DOES</p>
        <p className="text-[11px] text-white/80 leading-relaxed">{active.tagline}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold text-[#8a99ad] tracking-[0.15em] truncate">{sport.toUpperCase()} ANALYTICS RUNNING</p>
        <button
          onClick={() => loadSport(sport)}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00b0ff]/15 mtext-cyan text-[10px] font-bold shrink-0 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "SCANNING…" : "RESCAN"}
        </button>
      </div>

      {scanning ? (
        <div className="py-10 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mtext-cyan mb-2" />
          <p className="text-xs text-[#8a99ad] font-bold">Pulling live {active.label} fixtures from the verified feeds…</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="mglass rounded-xl px-4 py-8 text-center">
          <p className="text-xs text-[#8a99ad] font-bold mb-1">No verified {active.label} fixtures right now</p>
          <p className="text-[10px] text-white/40">The engine only deals games with scrutinized form on BOTH sides — nothing is invented to fill the grid.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c, i) => (
            <PredictionCard key={`${c.home}-${c.away}-${i}`} card={c} />
          ))}
        </div>
      )}

      <VerifiedPoolBrowser />

      <MonsterRolloverDashboard />

      <p className="text-[9px] text-white/35 leading-relaxed pt-1">
        Every probability is the engine's model estimate from verified form on both sides — tennis & basketball use the no-draw two-way model, football shows its one best 90%+ verified pick per game. Odds shown are exact model fair odds (1 ÷ probability), not bookmaker prices. Model probabilities, never guarantees.
      </p>
    </div>
  );
}