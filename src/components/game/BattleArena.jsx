import React, { useState, useEffect, useRef, useCallback } from "react";
import { CHARACTERS, getLevelEnemy, EPISODES, enemyArchetype, CHARACTER_IMAGES, ENEMY_IMAGES, getLevelStory, getLevelScene, difficultyForEpisode } from "@/lib/forgottenOnesData";
import { X, Maximize2, Minimize2, Skull, Radio } from "lucide-react";
import { useGamepad } from "@/hooks/useGamepad";
import GamepadControls from "@/components/game/GamepadControls";
import { base44 } from "@/api/base44Client";
import FighterPortrait from "@/components/game/FighterPortrait";
import SceneBackdrop from "@/components/game/SceneBackdrop";
import StoryDialogue from "@/components/game/StoryDialogue";
import LiveCommentary from "@/components/game/LiveCommentary";

const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const uid = () => Math.random().toString(36).slice(2, 9);

export default function BattleArena({ episodeId, level, profile, onWin, onLose, onExit }) {
  const character = CHARACTERS.find((c) => c.id === (profile?.active_character_id || 1)) || CHARACTERS[0];
  const enemyInit = getLevelEnemy(episodeId, level);
  const ep = EPISODES.find((e) => e.id === episodeId);
  const scene = getLevelScene(episodeId, level);
  const story = getLevelStory(episodeId, level);
  const difficulty = difficultyForEpisode(episodeId);

  const playerImage = CHARACTER_IMAGES[character.id] || "";
  const enemyImage = ENEMY_IMAGES[enemyInit.name] || "";

  const playerFighter = { skin: character.skin, garb: character.color, garb2: "#1a0d08", aura: character.color, weapon: character.weapon || "none", spectral: false };
  const enemyFighter = enemyArchetype(enemyInit.name, enemyInit.isBoss);

  const pLvl = profile?.level || 1;
  const playerMaxHP = character.hp + (pLvl - 1) * 8;
  const playerATK = character.atk + (pLvl - 1) * 2;
  const playerPower = Math.min(1, (pLvl - 1) / 60);
  const enemyPower = Math.min(1, level / 20);

  const [playerHP, setPlayerHP] = useState(playerMaxHP);
  const [playerSP, setPlayerSP] = useState(50);
  const [enemyHP, setEnemyHP] = useState(enemyInit.hp);
  const [log, setLog] = useState([`A ${enemyInit.name} emerges from the dark…`]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(null);
  const [items, setItems] = useState(2);
  const [fx, setFx] = useState({ shield: 0, buff: 0, evade: 0, double: false, weaken: false, gold: false });
  const [enemyStunned, setEnemyStunned] = useState(false);

  // Cinematic phases
  const [phase, setPhase] = useState("story");
  const [showFight, setShowFight] = useState(false);

  // Combat visual state
  const [pAnim, setPAnim] = useState("");
  const [eAnim, setEAnim] = useState("");
  const [shake, setShake] = useState(false);
  const [sparks, setSparks] = useState([]);
  const [floaters, setFloaters] = useState([]);
  const [flash, setFlash] = useState("");

  // Combo / power-surge / KO
  const comboRef = useRef(0);
  const [combo, setCombo] = useState(0);
  const [surge, setSurge] = useState(false);
  const [ko, setKo] = useState(false);
  const [critFlash, setCritFlash] = useState(false);

  // Live broadcast (spectator commentary on screen)
  const [me, setMe] = useState(null);
  const [live, setLive] = useState(false);
  const liveRoom = me ? `live:${me.id}` : "";

  // Fullscreen
  const arenaRef = useRef(null);
  const [isFs, setIsFs] = useState(false);

  const addLog = (line) => setLog((l) => [...l.slice(-30), line]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const beginVs = () => {
    setPhase("vs");
    setTimeout(() => { setPhase("fight"); setShowFight(true); }, 2000);
    setTimeout(() => setShowFight(false), 3100);
  };

  useEffect(() => {
    const el = arenaRef.current;
    if (el && document.fullscreenEnabled) {
      el.requestFullscreen?.().then(() => setIsFs(true)).catch(() => {});
    }
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement && document.fullscreenElement === arenaRef.current) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else arenaRef.current?.requestFullscreen?.().catch(() => {});
  };

  const toggleLive = async () => {
    if (!me) return;
    const next = !live;
    setLive(next);
    try {
      const ex = await base44.entities.GamePresence.filter({ user_id: me.id });
      if (ex[0]) await base44.entities.GamePresence.update(ex[0].id, { status: next ? "in_battle" : "online" });
    } catch {}
  };

  useEffect(() => () => {
    if (live && me) {
      base44.entities.GamePresence.filter({ user_id: me.id })
        .then((ex) => { if (ex[0]) base44.entities.GamePresence.update(ex[0].id, { status: "online" }).catch(() => {}); })
        .catch(() => {});
    }
  }, [live, me]);

  const bumpCombo = useCallback(() => {
    const nc = comboRef.current + 1;
    comboRef.current = nc;
    setCombo(nc);
    if (nc > 0 && nc % 5 === 0) {
      setSurge(true);
      setTimeout(() => setSurge(false), 1300);
      addLog(`⚡ POWER SURGE! Combo x${nc} — your fighter's power is rising!`);
    }
  }, []);
  const breakCombo = useCallback(() => { comboRef.current = 0; setCombo(0); }, []);

  const burstSparks = useCallback((side, isCrit) => {
    const x = side === "player" ? 62 + rand(-6, 6) : 38 + rand(-6, 6);
    const y = 42 + rand(-6, 6);
    const n = isCrit ? 9 : 5;
    const arr = Array.from({ length: n }).map(() => ({
      id: uid(), x: x + rand(-4, 4), y: y + rand(-4, 4), foe: side !== "player",
      sx: `${rand(-60, 60)}px`, sy: `${rand(-60, 30)}px`,
    }));
    setSparks((s) => [...s, ...arr]);
    setTimeout(() => setSparks((s) => s.filter((k) => !arr.find((a) => a.id === k.id))), 600);
  }, []);

  const addFloater = (side, text, color) => {
    const f = { id: uid(), side, text, color };
    setFloaters((l) => [...l, f]);
    setTimeout(() => setFloaters((l) => l.filter((k) => k.id !== f.id)), 1100);
  };
  const doShake = () => { setShake(true); setTimeout(() => setShake(false), 380); };
  const doFlash = (side) => { setFlash(side); setTimeout(() => setFlash(""), 360); };
  const doCritFlash = () => { setCritFlash(true); setTimeout(() => setCritFlash(false), 500); };

  const enemyTurn = async (newHP, newFx, newStunned) => {
    setBusy(true);
    await sleep(700);
    if (newStunned) {
      addLog(`${enemyInit.name} is stunned — loses the turn.`);
      setEnemyStunned(false);
      setBusy(false);
      return;
    }
    let dmg = rand(Math.round(enemyInit.atk * 0.8), Math.round(enemyInit.atk * 1.1));
    const crit = dmg > enemyInit.atk * 1.0;
    if (newFx.weaken) { dmg = Math.round(dmg * 0.5); }
    if (newFx.shield > 0) {
      addLog(`${enemyInit.name} strikes — your Shield absorbs it.`);
      setFx((f) => ({ ...f, shield: f.shield - 1 }));
      setBusy(false);
      return;
    }
    if (newFx.evade > 0) {
      addLog(`${enemyInit.name} swings — you sidestep cleanly.`);
      setFx((f) => ({ ...f, evade: f.evade - 1 }));
      setBusy(false);
      return;
    }
    setEAnim("lunge-left");
    await sleep(200);
    doFlash("foe");
    burstSparks("foe", crit);
    doShake();
    const hp = Math.max(0, newHP - dmg);
    setPlayerHP(hp);
    addFloater("player", `-${dmg}`, "#e07466");
    addLog(`${enemyInit.name} hits for ${dmg}.`);
    setEAnim("");
    setPAnim("recoil-back");
    setTimeout(() => setPAnim(""), 400);
    if (hp <= 0) {
      addLog("You have fallen…");
      setOver("lose");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const applyEnemyDamage = async (dmg, isCrit, sp, newFx) => {
    setPAnim("lunge-right");
    await sleep(200);
    const hp = Math.max(0, enemyHP - dmg);
    doFlash("player");
    if (isCrit) doCritFlash();
    burstSparks("player", isCrit);
    doShake();
    setEnemyHP(hp);
    bumpCombo();
    addFloater("enemy", isCrit ? `-${dmg}!` : `-${dmg}`, isCrit ? "#ffd76a" : "#f7c948");
    setPAnim("");
    setEAnim("recoil-front");
    setTimeout(() => setEAnim(""), 400);
    setPlayerSP(sp);
    setFx(newFx);
    if (hp <= 0) {
      addLog(`${enemyInit.name} is vanquished!`);
      setKo(true);
      setTimeout(() => finishWin(sp), 850);
      return true;
    }
    return false;
  };

  const playerAction = async (type) => {
    if (busy || over || phase !== "fight") return;
    setBusy(true);
    const newFx = { ...fx };
    let dmg = 0;
    let sp = playerSP;
    const comboMul = 1 + Math.min(comboRef.current, 12) * 0.05;

    if (type === "attack") {
      dmg = Math.round(rand(Math.round(playerATK * 0.85), Math.round(playerATK * 1.1)) * comboMul);
      const crit = dmg > playerATK * 1.05 * comboMul;
      if (fx.buff > 0) dmg = Math.round(dmg * 1.5);
      if (fx.double) { const d2 = rand(Math.round(playerATK * 0.85), Math.round(playerATK * 1.1)); dmg += d2; newFx.double = false; addLog(`${character.name} strikes twice!`); }
      addLog(`${character.name} attacks for ${dmg}.`);
      sp = Math.min(100, sp + 5);
      const dead = await applyEnemyDamage(dmg, crit, sp, newFx);
      if (dead) return;
      await sleep(350);
      await enemyTurn(playerHP, newFx, enemyStunned);
    } else if (type === "ability") {
      const ab = character.ability;
      if (sp < ab.cost) { addLog("Not enough Spirit."); setBusy(false); return; }
      sp -= ab.cost;
      switch (ab.kind) {
        case "attack":
          dmg = Math.round((ab.power + Math.round(playerATK * 0.5)) * comboMul);
          if (fx.buff > 0) dmg = Math.round(dmg * 1.5);
          if (fx.double) { dmg = Math.round(dmg * 1.6); newFx.double = false; }
          addLog(`${ab.name} unleashes ${dmg}!`);
          { const dead = await applyEnemyDamage(dmg, true, sp, newFx); if (dead) return; }
          break;
        case "heal": {
          const heal = 60; const hp = Math.min(playerMaxHP, playerHP + heal); setPlayerHP(hp); addLog(`${ab.name} restores ${heal} HP.`); addFloater("player", `+${heal}`, "#6dd49a"); setFx(newFx); setPlayerSP(sp);
          break;
        }
        case "shield": newFx.shield = 1; addLog(`${ab.name} — shield raised.`); setFx(newFx); setPlayerSP(sp); break;
        case "buff": newFx.buff = 3; addLog(`${ab.name} — power surges (+50% dmg, 3 turns).`); setFx(newFx); setPlayerSP(sp); break;
        case "weaken": newFx.weaken = true; addLog(`${ab.name} — enemy weakened.`); setFx(newFx); setPlayerSP(sp); break;
        case "double": newFx.double = true; addLog(`${ab.name} — next strike hits twice.`); setFx(newFx); setPlayerSP(sp); break;
        case "evade": newFx.evade = 2; addLog(`${ab.name} — you will dodge the next 2 hits.`); setFx(newFx); setPlayerSP(sp); break;
        case "stun": setEnemyStunned(true); addLog(`${ab.name} — enemy stunned!`); setFx(newFx); setPlayerSP(sp); break;
        case "sp": sp = Math.min(100, sp + 40); addLog(`${ab.name} — +40 Spirit.`); setFx(newFx); setPlayerSP(sp); break;
        case "lifesteal": {
          const lsDmg = Math.round(playerATK * 1.2 * comboMul);
          addLog(`${ab.name} — ${lsDmg} dmg, heal 35.`);
          { const dead = await applyEnemyDamage(lsDmg, false, sp, newFx); if (dead) return; }
          const hp = Math.min(playerMaxHP, playerHP + 35); setPlayerHP(hp); addFloater("player", "+35", "#6dd49a");
          break;
        }
        case "gold": newFx.gold = true; addLog(`${ab.name} — double SP this battle.`); setFx(newFx); setPlayerSP(sp); break;
        default: break;
      }
      await sleep(350);
      await enemyTurn(playerHP, newFx, enemyStunned);
    } else if (type === "defend") {
      addLog("You brace — next hit halved, +8 Spirit.");
      newFx.weaken = true;
      sp = Math.min(100, sp + 8);
      setPlayerSP(sp); setFx(newFx);
      await enemyTurn(playerHP, newFx, enemyStunned);
    } else if (type === "item") {
      if (items <= 0) { addLog("No herbs left."); setBusy(false); return; }
      setItems((n) => n - 1);
      const heal = 40;
      const hp = Math.min(playerMaxHP, playerHP + heal);
      setPlayerHP(hp);
      addFloater("player", `+${heal}`, "#6dd49a");
      addLog(`Herb used — restored ${heal} HP.`);
      await sleep(350);
      await enemyTurn(hp, newFx, enemyStunned);
    }
  };

  const finishWin = (finalSP) => {
    let baseXp = 20 + episodeId * 5 + level * 2;
    if (enemyInit.isBoss) baseXp += 50;
    let baseSp = 10 + level * 2;
    if (fx.gold) baseSp *= 2;
    if (profile?.booster_battles > 0) baseXp *= 2;
    const cb = comboRef.current;
    const comboXpBonus = Math.round(baseXp * cb * 0.05);
    const comboSpBonus = cb * 2;
    baseXp += comboXpBonus;
    baseSp += comboSpBonus;
    setOver("win");
    setBusy(false);
    addLog(`Victory! +${baseXp} XP, +${baseSp} SP${cb >= 5 ? ` (Combo x${cb} bonus!)` : ""}`);
    onWin?.({ xp: baseXp, sp: baseSp, key: `${episodeId}-${level}`, boss: enemyInit.isBoss, booster: profile?.booster_battles > 0, combo: cb });
  };

  const doAttack = () => playerAction("attack");
  const doAbility = () => playerAction("ability");
  const doDefend = () => playerAction("defend");
  const doItem = () => playerAction("item");
  const { connected: padConnected, pressed: padPressed } = useGamepad({
    a: doAttack, b: doDefend, x: doItem, y: doAbility,
    up: doAbility, right: doAttack, down: doDefend, left: doItem,
    l: doItem, r: doAbility,
  });

  const playerPct = (playerHP / playerMaxHP) * 100;
  const enemyPct = (enemyHP / enemyInit.hp) * 100;
  const ab = character.ability;

  return (
    <div ref={arenaRef} className={`fixed inset-0 z-[1000] flex flex-col bg-[#040303] ${shake ? "cam-shake" : ""}`}>
      <div className="letterbox w-full z-30 relative" />
      <div className="flex-1 relative overflow-hidden arena-3d">
        {/* Real-life cinematic scene backdrop per level (from the uploaded location sheet) */}
        <SceneBackdrop scene={scene} episodeId={episodeId} level={level} color={ep?.color} isBoss={enemyInit.isBoss} />
        <div className="absolute inset-0 fog-layer opacity-70" />
        <div className="absolute inset-0 fonoir-bg opacity-50" />
        {flash && <div className={`hit-flash ${flash === "foe" ? "foe" : ""}`} />}
        {critFlash && <div className="screen-edge-flash" />}
        <div className="vignette" />
        {live && phase === "fight" && <LiveCommentary room={liveRoom} />}

        {/* Top HUD */}
        <div className="absolute top-2 inset-x-3 z-30 flex items-center justify-between">
          <button onClick={onExit} className="p-2 rounded-full bg-black/40 border border-[#c5a059]/30 text-[#d1a985] hover:text-white">
            <X className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-[0.3em] text-[#d97757]">{difficulty.label} · Episode {episodeId} · Level {level}{enemyInit.isBoss ? " · BOSS" : ""}</p>
            <p className="text-xs font-bold text-[#d1a985] cinzel-title truncate max-w-[200px]">{ep?.title}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {padConnected && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2bb3c0]/15 text-[#5ed1da] border border-[#2bb3c0]/30 whitespace-nowrap">🎮 Pad</span>}
            <button onClick={toggleLive} title="Go Live" className={`p-2 rounded-full border ${live ? "bg-[#c0484a]/20 border-[#c0484a]/60 text-[#e07466]" : "bg-black/40 border-[#c5a059]/30 text-[#d1a985] hover:text-white"}`}>
              <Radio className={`w-4 h-4 ${live ? "animate-pulse" : ""}`} />
            </button>
            <button onClick={toggleFs} className="p-2 rounded-full bg-black/40 border border-[#c5a059]/30 text-[#d1a985] hover:text-white">
              {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Combo meter */}
        {combo >= 2 && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 combo-pop text-center">
            <span className="text-base font-extrabold font-heading tracking-wider" style={{ color: combo >= 5 ? "#f7c948" : "#d1a985", textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>
              COMBO ×{combo}{surge ? " ⚡SURGE" : ""}
            </span>
          </div>
        )}

        {/* Fighter portraits — fight phase */}
        {phase === "fight" && (
          <>
            {/* Enemy — right/back */}
            <div className="absolute right-[5%] top-[19%] z-10 fighter" style={{ transform: "translateZ(40px)" }}>
              <div className={`relative ${eAnim}`}>
                <FighterPortrait
                  name={enemyInit.name}
                  role={enemyInit.isBoss ? "BOSS" : "ENEMY"}
                  color={enemyInit.isBoss ? "#c0484a" : (ep?.color || "#c5a059")}
                  image={enemyImage}
                  isBoss={enemyInit.isBoss}
                  fighterProps={enemyFighter}
                  power={enemyPower}
                  width={140}
                  height={200}
                  glow={enemyInit.isBoss ? 60 : 45}
                />
                {floaters.filter((f) => f.side === "enemy").map((f) => (
                  <div key={f.id} className="float-dmg" style={{ left: "50%", top: "-10%", color: f.color }}>{f.text}</div>
                ))}
                {sparks.filter((s) => !s.foe).map((s) => (
                  <div key={s.id} className="spark" style={{ left: `${s.x}%`, top: `${s.y}%`, "--sx": s.sx, "--sy": s.sy }} />
                ))}
              </div>
              <div className="mt-2 w-[140px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-foreground font-semibold truncate">{enemyInit.name}</span>
                  <span className="text-[9px] text-[#8a6d3b]">{enemyHP}/{enemyInit.hp}</span>
                </div>
                <div className="h-2 rounded-full bg-black/60 overflow-hidden border border-[#c0484a]/30">
                  <div className="h-full foe-bar-fill transition-all duration-500" style={{ width: `${enemyPct}%` }} />
                </div>
              </div>
            </div>

            {/* Player — left/front */}
            <div className={`absolute left-[5%] top-[22%] z-10 fighter ${surge ? "power-surge" : ""}`} style={{ transform: "translateZ(80px) scale(1.05)" }}>
              <div className={`relative ${pAnim}`}>
                <FighterPortrait
                  name={character.name}
                  role={character.role}
                  color={character.color}
                  image={playerImage}
                  isPlayer
                  fighterProps={playerFighter}
                  power={playerPower}
                  width={140}
                  height={200}
                  glow={55}
                />
                {floaters.filter((f) => f.side === "player").map((f) => (
                  <div key={f.id} className="float-dmg" style={{ left: "50%", top: "-10%", color: f.color }}>{f.text}</div>
                ))}
                {sparks.filter((s) => s.foe).map((s) => (
                  <div key={s.id} className="spark foe" style={{ left: `${s.x}%`, top: `${s.y}%`, "--sx": s.sx, "--sy": s.sy }} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* FIGHT pop */}
        {showFight && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <h2 className="fight-pop-center bronze-text cinzel-title font-extrabold" style={{ fontSize: "clamp(2.5rem, 9vw, 5rem)", letterSpacing: "0.12em" }}>FIGHT</h2>
          </div>
        )}

        {/* Story dialogue — adventure narrative before the fight */}
        {phase === "story" && (
          <StoryDialogue lines={story} scene={scene} difficulty={difficulty} onComplete={beginVs} />
        )}

        {/* VS reveal */}
        {phase === "vs" && (
          <div className="absolute inset-0 z-30 flex flex-wrap items-center justify-center gap-2 sm:gap-6 px-4 bg-[#040303]/55">
            <div className="vs-slide-left flex flex-col items-center gap-2">
              <FighterPortrait name={character.name} role={character.role} color={character.color} image={playerImage} isPlayer fighterProps={playerFighter} power={playerPower} width={120} height={172} glow={55} />
              <p className="vs-name-in text-center cinzel-title font-extrabold text-[#f0d9a8]" style={{ fontSize: 13 }}>{character.name}</p>
            </div>
            <h2 className="vs-pop bronze-text cinzel-title font-extrabold" style={{ fontSize: "clamp(2.5rem, 11vw, 4.5rem)", letterSpacing: "0.05em" }}>VS</h2>
            <div className="vs-slide-right flex flex-col items-center gap-2">
              <FighterPortrait name={enemyInit.name} role={enemyInit.isBoss ? "BOSS" : "ENEMY"} color={enemyInit.isBoss ? "#c0484a" : (ep?.color || "#c5a059")} image={enemyImage} isBoss={enemyInit.isBoss} fighterProps={enemyFighter} power={enemyPower} width={120} height={172} glow={enemyInit.isBoss ? 58 : 42} />
              <p className="vs-name-in text-center cinzel-title font-extrabold" style={{ fontSize: 13, color: enemyInit.isBoss ? "#ff8a6a" : "#d1a985" }}>{enemyInit.name}</p>
            </div>
          </div>
        )}

        {/* KO slow-mo flash */}
        {ko && !over && (
          <div className="ko-flash"><h2>K.O.</h2></div>
        )}

        {/* Win / Lose */}
        {over && (
          <div className="absolute inset-0 z-40 bg-[#040303]/85 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
            <h2 className={`font-extrabold cinzel-title ${over === "win" ? "bronze-text" : "text-[#c0484a]"}`} style={{ fontSize: "clamp(2.4rem, 8vw, 4rem)", letterSpacing: "0.08em" }}>{over === "win" ? "VICTORY" : "DEFEAT"}</h2>
            <p className="text-sm text-[#8a6d3b] italic">{over === "win" ? "The ancestors smile on you." : "The forgotten call you back…"}</p>
            {over === "win" && combo >= 2 && (
              <p className="text-xs text-[#f7c948] font-semibold">Max Combo ×{combo} — power rising!</p>
            )}
            <div className="flex gap-2">
              {over === "win" && <button onClick={onExit} className="px-5 py-2 rounded-xl btn-noir-primary font-semibold text-sm">Continue</button>}
              {over === "lose" && <button onClick={() => { onLose?.(); onExit(); }} className="px-5 py-2 rounded-xl btn-noir-primary font-semibold text-sm">Retry</button>}
              <button onClick={onExit} className="px-5 py-2 rounded-xl btn-noir-ghost text-sm">Exit</button>
            </div>
          </div>
        )}
      </div>
      <div className="letterbox w-full z-30 relative" />

      {/* Bottom HUD */}
      <div className="relative z-20 px-3 pt-2 pb-3 bg-gradient-to-t from-[#040303] to-transparent">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-[#8a6d3b] uppercase tracking-widest">HP</span>
          <span className="text-[10px] text-[#8a6d3b]">{playerHP}/{playerMaxHP}</span>
        </div>
        <div className="h-2 rounded-full bg-black/60 overflow-hidden border border-[#3fae6a]/25 mb-1.5">
          <div className="h-full hp-bar-fill transition-all duration-300" style={{ width: `${playerPct}%` }} />
        </div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-[#8a6d3b] uppercase tracking-widest">Spirit</span>
          <span className="text-[10px] text-[#8a6d3b]">{playerSP}/100 · PWR {pLvl}</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/60 overflow-hidden border border-[#2bb3c0]/25 mb-2">
          <div className="h-full sp-bar-fill transition-all duration-300" style={{ width: `${playerSP}%` }} />
        </div>
        {(fx.buff > 0 || fx.shield > 0 || fx.evade > 0 || fx.double || fx.weaken) && (
          <div className="flex flex-wrap gap-1 mb-2">
            {fx.buff > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d97757]/15 text-[#d97757] border border-[#d97757]/30">BUFF {fx.buff}t</span>}
            {fx.shield > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2bb3c0]/15 text-[#5ed1da] border border-[#2bb3c0]/30">SHIELD</span>}
            {fx.evade > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3fae6a]/15 text-[#6dd49a] border border-[#3fae6a]/30">EVADE {fx.evade}</span>}
            {fx.double && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d1a985]/15 text-[#d1a985] border border-[#d1a985]/30">2x NEXT</span>}
            {fx.weaken && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c0484a]/15 text-[#e07466] border border-[#c0484a]/30">FOE WEAK</span>}
          </div>
        )}
        <GamepadControls
          onAttack={doAttack}
          onAbility={doAbility}
          onDefend={doDefend}
          onItem={doItem}
          pressed={padPressed}
          disabled={busy || !!over || phase !== "fight"}
          abilityCost={ab.cost}
          itemsCount={items}
        />
        <p className="text-center text-[9px] text-[#8a6d3b] pt-1 italic truncate">{ab.name} — {ab.desc}</p>
      </div>
    </div>
  );
}