import React, { useMemo, useState, forwardRef } from "react";
import { Search, Dices, Gamepad2, Crown, Lock, Infinity as InfinityIcon } from "lucide-react";
import ArcadePaywall from "@/components/game/ArcadePaywall";
import ArcadePlayer from "@/components/game/ArcadePlayer";
import AdGate from "@/components/game/AdGate";
import { ARCADE_GAMES, ARCADE_CATEGORIES } from "@/lib/arcadeGames";

// Free model: 3 ad-supported plays, then payment is requested (paywall).
// Premium subscribers skip ads and play unlimited.
const FREE_PLAYS = 3;
const SUB_KEY = "arcade_sub";
const playsKey = () => `arcade_plays_${new Date().toISOString().slice(0, 10)}`;
const readSub = () => { try { const s = JSON.parse(localStorage.getItem(SUB_KEY) || "null"); if (s && s.exp > Date.now()) return s; } catch {} return null; };
const readPlays = () => Number(localStorage.getItem(playsKey()) || "0");

const BADGE_STYLE = {
  hot: "bg-red-500/20 text-red-300 border-red-500/40",
  new: "bg-sky-500/20 text-sky-300 border-sky-500/40",
};

const GameCenter = forwardRef(function GameCenter(_props, ref) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState(readSub);
  const [plays, setPlays] = useState(readPlays);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, setPending] = useState(null); // game waiting on ad
  const [active, setActive] = useState(null); // game currently playing

  const subscribed = !!sub;
  const playsLeft = Math.max(0, FREE_PLAYS - plays);

  const filtered = useMemo(
    () => ARCADE_GAMES.filter((g) => (cat === "all" || g.category === cat) && (!search || g.name.toLowerCase().includes(search.toLowerCase()))),
    [search, cat]
  );

  const play = (g) => {
    if (subscribed) { setActive(g); return; }
    if (plays < FREE_PLAYS) {
      // Watch 1 ad, then play (free levels 1–3)
      setPending(g);
    } else {
      // From the 4th play → request payment
      setPayOpen(true);
    }
  };

  const onAdDone = () => {
    const g = pending;
    setPending(null);
    if (!g) return;
    const n = readPlays() + 1;
    localStorage.setItem(playsKey(), String(n));
    setPlays(n);
    setActive(g);
  };

  const random = () => { if (ARCADE_GAMES.length) play(ARCADE_GAMES[Math.floor(Math.random() * ARCADE_GAMES.length)]); };

  return (
    <div ref={ref} className="space-y-4 scroll-mt-4">
      {/* Access status banner */}
      <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ${subscribed ? "bg-primary/10 border-primary/40 text-primary" : "bg-secondary/60 border-border/60 text-muted-foreground"}`}>
        {subscribed ? <InfinityIcon className="w-4 h-4 shrink-0" /> : <Gamepad2 className="w-4 h-4 shrink-0" />}
        <span>
          {subscribed
            ? "Arcade Premium active — no ads, unlimited play."
            : <>Free plays left: <b className="text-foreground">{playsLeft}/{FREE_PLAYS}</b> · watch a short ad per game. After 3, upgrade to keep playing.</>}
        </span>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search games…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring">
          {ARCADE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button onClick={random} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap">
          <Dices className="w-4 h-4" /> Random
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {filtered.map((g, i) => (
          <button key={g.slug + i} onClick={() => play(g)} className="relative rounded-2xl border border-border/60 bg-card p-3 text-center card-lift">
            {g.badge && <span className={`absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${BADGE_STYLE[g.badge] || ""}`}>{g.badge.toUpperCase()}</span>}
            {!subscribed && <Lock className="absolute top-2 left-2 w-3 h-3 text-muted-foreground/60" />}
            <span className="text-3xl block mb-1">{g.icon || "🎮"}</span>
            <span className="text-xs font-semibold leading-tight line-clamp-2">{g.name}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide mt-1 block">{ARCADE_CATEGORIES.find((c) => c.key === g.category)?.label || g.category}</span>
          </button>
        ))}
      </div>

      {!subscribed && (
        <button onClick={() => setPayOpen(true)} className="w-full rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-semibold py-2.5 flex items-center justify-center gap-2">
          <Crown className="w-4 h-4" /> Go Premium — skip ads & unlimited games
        </button>
      )}

      <ArcadePaywall open={payOpen} onClose={() => setPayOpen(false)} />
      {pending && <AdGate game={pending} onDone={onAdDone} onPremium={() => { setPending(null); setPayOpen(true); }} onClose={() => setPending(null)} />}
      {active && <ArcadePlayer game={active} onClose={() => setActive(null)} />}
    </div>
  );
});

export default GameCenter;