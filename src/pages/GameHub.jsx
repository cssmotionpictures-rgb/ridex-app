import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useGameProfile } from "@/hooks/useGameProfile";
import { CHARACTERS, EPISODES } from "@/lib/forgottenOnesData";

// Find the next available (episode, level) for the player to fight.
function findNextBattle(profile) {
  const completed = new Set((profile?.completed_levels || "").split(",").filter(Boolean));
  const isPremium = profile?.premium;
  for (const ep of EPISODES) {
    if (!ep.free && !isPremium) continue;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const key = `${ep.id}-${lvl}`;
      if (completed.has(key)) continue;
      const prevDone = lvl === 1 ? true : completed.has(`${ep.id}-${lvl - 1}`);
      const prevEpDone = ep.id === 1 ? true : completed.has(`${ep.id - 1}-20`);
      if (prevDone && prevEpDone) return { ep: ep.id, lvl };
    }
  }
  return { ep: EPISODES[0].id, lvl: 1 };
}
import { useToast } from "@/components/ui/use-toast";
import { Swords, Users, Trophy, ShoppingBag, Gift, Crown, Play, Wifi, Gamepad2, Box } from "lucide-react";
import { Link } from "react-router-dom";
import GameHeader from "@/components/game/GameHeader";
import CampaignMap from "@/components/game/CampaignMap";
import CharacterRoster from "@/components/game/CharacterRoster";
import CharacterSelect from "@/components/game/CharacterSelect";
import RealTimeArena from "@/components/game/RealTimeArena";
import RealTimeArena3D from "@/components/game/RealTimeArena3D";
import DailyRewards from "@/components/game/DailyRewards";
import GameLeaderboard from "@/components/game/GameLeaderboard";
import GameShop from "@/components/game/GameShop";
import CinematicBackdrop from "@/components/game/CinematicBackdrop";
import CharacterMontage from "@/components/game/CharacterMontage";
import GameLogo from "@/components/game/GameLogo";
import OnlineArena from "@/components/game/OnlineArena";
import GameCenter from "@/components/game/GameCenter";
import FighterSelect from "@/components/game/FighterSelect";
import CompetitionLeaderboard from "@/components/game/CompetitionLeaderboard";
import GameEvents from "@/components/game/GameEvents";
import ScheduledMatches from "@/components/game/ScheduledMatches";

const TABS = [
  { key: "play", label: "Play", icon: Play },
  { key: "characters", label: "Characters", icon: Users },
  { key: "select", label: "Fighters", icon: Crown },
  { key: "fbx", label: "3D Fighter", icon: Box },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "shop", label: "Store", icon: ShoppingBag },
  { key: "online", label: "Online", icon: Wifi },
  { key: "arcade", label: "Arcade", icon: Gamepad2 },
];

export default function GameHub() {
  const { profile, loading, save, claimDaily, activeCharacter, reload } = useGameProfile();
  const { toast } = useToast();
  const [tab, setTab] = useState("play");
  const [battle, setBattle] = useState(null);
  // The 3D arena is always playable: it spawns built-in fighters immediately and
  // loads a real GLB on top if one is set. No asset gate, no credits required.
  const [use3D] = useState(true);
  const arcadeRef = useRef(null);
  const scrollToArcade = () => setTimeout(() => arcadeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);

  if (loading) {
    return (
      <div className="relative flex items-center justify-center py-32">
        <CinematicBackdrop />
        <div className="relative z-10 w-8 h-8 border-4 border-[#c5a059]/30 border-t-[#d97757] rounded-full animate-spin" />
      </div>
    );
  }
  if (!profile) {
    return <div className="text-center py-20 text-[#8a6d3b]">Unable to load your game profile. Please sign in.</div>;
  }

  const handleWin = async (result) => {
    // Server-authoritative: the server recomputes XP/SP and updates the profile.
    // The client never trusts its own reward math.
    try {
      const [epId, lvl] = result.key.split("-").map(Number);
      const res = await base44.functions.invoke("submit-combat-result", {
        episodeId: epId,
        level: lvl,
        result: "win",
        combo: result.combo || 0,
        durationMs: result.durationMs || 0,
        characterId: profile.active_character_id || 1,
      });
      const data = res.data || {};
      if (!data.ok && data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      if (data.leveled > 0) toast({ title: `Level Up! You are now Lv ${data.newLevel}`, className: "border-[#d97757]" });
      toast({ title: `Victory! +${data.xp} XP · +${data.sp} SP${data.levelCompleted ? " · Level cleared" : ""}` });
      await reload(); // pull the authoritative profile from the server
    } catch (e) {
      toast({ title: "Could not record victory", variant: "destructive" });
    }
  };

  const handleLose = async () => {
    try {
      await base44.functions.invoke("submit-combat-result", {
        episodeId: battle.ep,
        level: battle.lvl,
        result: "lose",
        combo: 0,
        durationMs: 0,
        characterId: profile.active_character_id || 1,
      });
      await reload();
    } catch (e) {
      // non-critical
    }
  };

  const handleClaimDaily = async () => {
    const reward = await claimDaily();
    if (reward) toast({ title: `Daily reward claimed · +${reward} SP` });
    else toast({ title: "Already claimed today", variant: "destructive" });
  };

  const handleSelectCharacter = async (c) => {
    await save({ active_character_id: c.id });
    toast({ title: `${c.name} set as active fighter` });
  };

  const handleSelectReference = async (ref) => {
    const maxId = (CHARACTERS || []).length || 15;
    if (ref.id > maxId) {
      toast({ title: `${ref.name} — coming soon`, variant: "destructive" });
      return;
    }
    await save({ active_character_id: ref.id });
    toast({ title: `${ref.name} selected as your fighter` });
  };

  const handleSelectFighter = async (key, name) => {
    await save({ active_fighter_key: key });
    toast({ title: `${name} set as your 3D fighter` });
  };

  const handleUnlockCharacter = async (c, cost) => {
    // Server-authoritative: the server validates affordability + applies the unlock.
    try {
      const res = await base44.functions.invoke("submit-purchase", { characterId: c.id });
      const data = res.data || {};
      if (!data.ok && data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      toast({ title: `Unlocked ${c.name}!` });
      await reload();
    } catch (e) {
      toast({ title: "Unlock failed", variant: "destructive" });
    }
  };

  const handleBuy = async (item) => {
    // Server-authoritative: the server validates the item, checks affordability,
    // and applies the reward. The client never writes SP/premium/booster directly.
    try {
      const res = await base44.functions.invoke("submit-purchase", { itemId: item.id });
      const data = res.data || {};
      if (!data.ok && data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      if (item.premium) toast({ title: "Premium unlocked! All 240 levels + 500 SP bonus" });
      else if (item.booster) toast({ title: "Booster active — 2x XP for 5 battles!" });
      else toast({ title: `Purchased +${item.sp} Spirit Points` });
      await reload();
    } catch (e) {
      toast({ title: "Purchase failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Cinematic hero */}
      <div className="relative rounded-3xl overflow-hidden noir-frame">
        <CharacterMontage />
        <div className="relative z-10 px-5 py-8 sm:px-8 sm:py-10 flex flex-col items-center text-center gap-4">
          <GameLogo />
          <p className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#8a6d3b]">
            A Spiritual Drama · Historical Epic · Family Saga
          </p>
          <p className="text-xs sm:text-sm text-[#d1a985] max-w-xl italic font-medium">
            They were not destroyed. They were erased. Now, they must be remembered.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={() => { const b = findNextBattle(profile); setBattle({ ep: b.ep, lvl: b.lvl }); }} className="btn-noir-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5">
              <Play className="w-4 h-4" /> Continue Journey
            </button>
            <button onClick={handleClaimDaily} className="btn-noir-ghost px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5">
              <Gift className="w-4 h-4" /> Claim Daily
            </button>
            <Link to="/game/babatunde-test" className="btn-noir-ghost px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5">
              <Box className="w-4 h-4" /> 3D Test
            </Link>
          </div>
        </div>
        <div className="ornate-divider relative z-10 mx-5 sm:mx-8 mb-2" />
      </div>

      <GameHeader profile={profile} />

      {/* Game Arcade — prominent entry point */}
      <button
        onClick={() => { setTab("arcade"); scrollToArcade(); }}
        className="w-full relative overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-r from-primary/15 via-card to-card p-4 flex items-center gap-4 text-left card-lift"
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
          <Gamepad2 className="w-7 h-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">Ride X Arcade</p>
          <h3 className="text-lg font-extrabold text-foreground leading-tight">Game Arcade — Play Free In-App</h3>
          <p className="text-xs text-muted-foreground">Action, shooting, racing & more — watch a short ad, play instantly.</p>
        </div>
        <span className="shrink-0 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold">Play ▸</span>
      </button>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
                tab === t.key ? "noir-tab-active" : "bg-[#0c0907] text-[#8a6d3b] border border-[#c5a059]/15"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "play" && (
        <div className="space-y-5">
          <GameEvents />
          <ScheduledMatches />
          <div className="grid md:grid-cols-2 gap-5">
            <DailyRewards profile={profile} onClaim={handleClaimDaily} />
            <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c5a059]/60 to-transparent" />
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-[#c5a059]" />
                <h3 className="font-bold text-[#d1a985] tracking-wide">Your Rank</h3>
              </div>
              <p className="text-2xl font-extrabold bronze-text font-heading capitalize tracking-wide">
                {profile.level >= 180 ? "Ancestral God" : profile.level >= 120 ? "Orisa Champion" : profile.level >= 60 ? "Warrior Elite" : profile.level >= 25 ? "Spirit Adept" : "Seeker"}
              </p>
              <p className="text-xs text-[#8a6d3b] mt-1">Level {profile.level} · {profile.battles_won || 0} battles won</p>
              <div className="mt-3 space-y-1.5 text-[11px]">
                <p className="flex items-center gap-1.5 text-[#d1a985]"><span className="w-2 h-2 rotate-45 bg-[#f0d9a8]" /> Ancestral God — Lv 180+ — 1000 SP/mo</p>
                <p className="flex items-center gap-1.5 text-[#c5a059]"><span className="w-2 h-2 rotate-45 bg-[#d1a985]" /> Orisa Champion — Lv 120+ — 500 SP/mo</p>
                <p className="flex items-center gap-1.5 text-[#6a5a3b]"><span className="w-2 h-2 rotate-45 bg-[#8a6d3b]" /> Warrior Elite — Lv 60+ — 250 SP/mo</p>
              </div>
            </div>
          </div>
          <CampaignMap profile={profile} onStartBattle={(ep, lvl) => setBattle({ ep, lvl })} />
        </div>
      )}

      {tab === "characters" && (
        <CharacterRoster profile={profile} onSelect={handleSelectCharacter} onUnlock={handleUnlockCharacter} />
      )}

      {tab === "select" && (
        <CharacterSelect profile={profile} onSelect={handleSelectReference} />
      )}

      {tab === "fbx" && (
        <FighterSelect profile={profile} onSelect={handleSelectFighter} />
      )}

      {tab === "leaderboard" && (
        <div className="space-y-5">
          <GameLeaderboard me={profile} />
          <CompetitionLeaderboard me={profile} />
        </div>
      )}

      {tab === "shop" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <GameShop profile={profile} onBuy={handleBuy} />
          <DailyRewards profile={profile} onClaim={handleClaimDaily} />
        </div>
      )}

      {tab === "online" && <OnlineArena profile={profile} />}

      {tab === "arcade" && <GameCenter ref={arcadeRef} />}

      {battle && (
        use3D ? (
          <RealTimeArena3D
            episodeId={battle.ep}
            level={battle.lvl}
            profile={profile}
            onWin={handleWin}
            onLose={handleLose}
            onExit={() => setBattle(null)}
          />
        ) : (
          <RealTimeArena
            episodeId={battle.ep}
            level={battle.lvl}
            profile={profile}
            onWin={handleWin}
            onLose={handleLose}
            onExit={() => setBattle(null)}
          />
        )
      )}
    </div>
  );
}