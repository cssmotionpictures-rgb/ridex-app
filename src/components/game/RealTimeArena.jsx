import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { X, Maximize2, Minimize2, Volume2, VolumeX, AlertTriangle, Upload } from "lucide-react";
import { CHARACTERS, getLevelEnemy, getLevelStory } from "@/lib/forgottenOnesData";
import { checkVerticalSliceAssets } from "@/lib/characterAssetManifest";
import { gameAudio } from "@/lib/gameAudio";

/* =============================================================================
   REAL-TIME CINEMATIC FIGHTING GAME — "THE FORGOTTEN ONES"
   Episode 1 · Level 2 · The Nightmare  (prototype engine)

   A full real-time fighter on <canvas>:
     • Two full-body humanoid fighters (Babatunde vs Corrupted Priest) drawn with a
       procedural 2D skeleton — head, torso, two articulated arms, two legs — that
       animates per state: idle / walk / attack / heavy / block / dodge / hit /
       stagger / special / finish / defeated.
     • A living nightmare village: parallax sky+moon, mountains, huts, trees,
       torches (flicker + glow), drifting fog, rain, rising embers, supernatural
       blue light, vignette + film grain.
     • Real-time input: on-screen joystick + action buttons, keyboard, gamepad.
     • Minimal HUD: small portrait + HP/Spirit (top-left), enemy name + HP
       (top-right), combo counter (center), Ancestral-Finish-ready cue.
     • Cinematic intro → gameplay → Ancestral Finish slow-mo → victory.

   The combat is continuous: pressing ATTACK makes Babatunde physically swing;
   the enemy physically reacts; blocking parries; dodging grants i-frames.
   Visual character/animation assets can later be swapped for true 3D skinned
   meshes without changing this gameplay architecture.
============================================================================= */

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// CHARACTER TEMPLATE (procedural humanoid)
// ---------------------------------------------------------------------------
function makeFighter(opts) {
  return {
    name: opts.name,
    role: opts.role,
    facing: opts.facing ?? 1, // 1 = right, -1 = left
    x: opts.x,
    y: 0, // ground-relative (0 = standing on ground)
    vx: 0,
    vy: 0,
    onGround: true,
    hp: opts.hp,
    maxHp: opts.hp,
    spirit: 50,
    maxSpirit: 100,
    state: "idle", // idle | walk | jump | light | heavy | special | block | dodge | hit | stagger | finish | defeated
    stateT: 0, // time in current state (ms)
    cooldown: 0, // global attack lockout
    hitstun: 0,
    iframe: 0, // dodge invulnerability
    combo: 0,
    // skeleton joint angles (radians, 0 = down, facing-aware applied at draw)
    pose: { lean: 0, head: 0, shL: 0.4, elL: 0.5, shR: -0.4, elR: 0.5, hipL: 0.12, knL: 0.35, hipR: -0.12, knR: 0.35, armRise: 0 },
    walkPhase: 0,
    skin: opts.skin,
    garb: opts.garb,
    garb2: opts.garb2,
    accent: opts.accent,
    enemy: !!opts.enemy,
    isPriest: !!opts.isPriest,
    weapon: opts.weapon || "blade",
    ai: opts.ai ? { mode: "approach", decT: 0 } : null,
  };
}

// Target poses per state. Angles are pre-mirror (applied with facing).
const POSES = {
  idle:        { lean: 0.04, shL: 0.35, elL: 0.55, shR: -0.35, elR: 0.55, hipL: 0.10, knL: 0.30, hipR: -0.10, knR: 0.30, head: 0.0, armRise: 0 },
  walk:        { lean: 0.12, shL: 0.55, elL: 0.50, shR: -0.55, elR: 0.50, hipL: 0.20, knL: 0.45, hipR: -0.20, knR: 0.45, head: -0.02, armRise: 0 },
  jump:        { lean: 0.18, shL: 1.2, elL: 0.5, shR: -1.2, elR: 0.5, hipL: 0.7, knL: 0.9, hipR: -0.7, knR: 0.9, head: 0, armRise: 0 },
  block:       { lean: -0.06, shL: 1.35, elL: 1.35, shR: -1.35, elR: 1.35, hipL: 0.18, knL: 0.42, hipR: -0.18, knR: 0.42, head: -0.06, armRise: 0.9 },
  dodge:       { lean: -0.34, shL: 0.7, elL: 0.7, shR: -0.7, elR: 0.7, hipL: 0.4, knL: 0.6, hipR: -0.4, knR: 0.6, head: -0.18, armRise: 0 },
  light:       { lean: 0.22, shL: -0.15, elL: 0.25, shR: -0.85, elR: 0.35, hipL: 0.24, knL: 0.42, hipR: -0.22, knR: 0.40, head: 0.02, armRise: 0.55 },
  heavy:       { lean: 0.30, shL: -0.45, elL: 0.15, shR: -1.35, elR: 0.15, hipL: 0.30, knL: 0.50, hipR: -0.30, knR: 0.48, head: 0.06, armRise: 1.1 },
  special:     { lean: -0.05, shL: 1.9, elL: 0.2, shR: -1.9, elR: 0.2, hipL: 0.16, knL: 0.34, hipR: -0.16, knR: 0.34, head: 0, armRise: 1.7 },
  hit:         { lean: -0.28, shL: -0.4, elL: 0.7, shR: 0.8, elR: 0.5, hipL: 0.06, knL: 0.28, hipR: -0.22, knR: 0.5, head: -0.22, armRise: 0 },
  stagger:     { lean: -0.22, shL: -0.2, elL: 0.6, shR: 0.6, elR: 0.5, hipL: 0.10, knL: 0.34, hipR: -0.26, knR: 0.5, head: -0.16, armRise: 0 },
  finish:      { lean: 0.28, shL: -0.6, elL: 0.1, shR: -1.7, elR: 0.1, hipL: 0.30, knL: 0.50, hipR: -0.30, knR: 0.48, head: 0.08, armRise: 1.4 },
  defeated:    { lean: -1.2, shL: 1.0, elL: 0.3, shR: -1.0, elR: 0.3, hipL: 1.0, knL: 0.2, hipR: -1.0, knR: 0.2, head: -0.9, armRise: 0 },
};

// Frame timings for attacks (ms): [startup, active, recovery]
const ATK = {
  light:   { startup: 70,  active: 90,  recover: 160, dmg: 6,  range: 64, kb: 6,  spirit: 6 },
  heavy:   { startup: 170, active: 90,  recover: 320, dmg: 13, range: 72, kb: 14, spirit: 10 },
  special: { startup: 260, active: 120, recover: 420, dmg: 22, range: 96, kb: 22, spirit: -34 },
  grab:    { startup: 120, active: 120, recover: 300, dmg: 9,  range: 60, kb: 4,  spirit: 4 },
  finish:  { startup: 300, active: 0,   recover: 0,   dmg: 999, range: 90, kb: 0, spirit: 0 },
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function RealTimeArena({ episodeId, level, profile, onWin, onLose, onExit }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const game = useRef(null); // mutable game world (not React state)
  const input = useRef({ left: false, right: false, up: false, block: false, light: false, heavy: false, special: false, grab: false, dodge: false, finish: false });
  const edgeKeys = useRef({}); // edge-trigger memory
  const rafRef = useRef(0);
  const heroImgRef = useRef(null); // real character reference image (identity asset)
  const enemyImgRef = useRef(null); // real enemy reference image
  const imgsReadyRef = useRef(false); // mirrors imgsReady for the game loop
  const assetsIncompleteRef = useRef(false); // mirrors assetsIncomplete for the game loop
  const [fs, setFs] = useState(false);
  const [muted, setMuted] = useState(false);
  const [imgsReady, setImgsReady] = useState(false);
  const [assetCheck, setAssetCheck] = useState(null);
  const [hud, setHud] = useState({ pHP: 100, pSP: 50, eHP: 100, combo: 0, phase: "intro", sub: "", finisher: false, enemyName: "Corrupted Priest" });
  const [joy, setJoy] = useState({ active: false, x: 0, y: 0 });

  const assetsIncomplete = assetCheck && !assetCheck.canStart;

  // Sync the ref for the game loop (which reads refs, not React state)
  useEffect(() => { assetsIncompleteRef.current = assetsIncomplete; }, [assetsIncomplete]);

  useEffect(() => { gameAudio.setEnabled(!muted); }, [muted]);

  // Resolve protagonist identity
  const charDef = CHARACTERS.find((c) => c.id === (profile?.active_character_id || 1)) || CHARACTERS[0];

  // === ASSET LOADING CONTRACT (spec Section 31) ===
  // Fetch the DB-backed vertical-slice asset records. Both the player slot
  // (Babatunde) and the enemy slot (Corrupted Priest) must have a full-body
  // playable asset (PNG or GLB). If either is missing → ASSET_INCOMPLETE and
  // combat never starts. Portraits and procedural placeholders are never used.
  useEffect(() => {
    let alive = true;
    checkVerticalSliceAssets()
      .then((check) => {
        if (!alive) return;
        setAssetCheck(check);
        if (!check.canStart) return; // ASSET_INCOMPLETE — do not load fighter images
        // Load the full-body playable PNGs for both fighters.
        const playerUrl = check.player?.full_body_png_url;
        const enemyUrl = check.enemy?.full_body_png_url;
        let pDone = !playerUrl, eDone = !enemyUrl;
        const finish = () => { if (pDone && eDone && alive) { setImgsReady(true); imgsReadyRef.current = true; } };
        if (playerUrl) {
          const img = new Image();
          img.onload = () => { if (alive) heroImgRef.current = img; pDone = true; finish(); };
          img.onerror = () => { pDone = true; finish(); };
          img.src = playerUrl;
        }
        if (enemyUrl) {
          const img = new Image();
          img.onload = () => { if (alive) enemyImgRef.current = img; eDone = true; finish(); };
          img.onerror = () => { eDone = true; finish(); };
          img.src = enemyUrl;
        }
      })
      .catch(() => { if (alive) setAssetCheck({ canStart: false, missingAssets: [], player: null, enemy: null }); });
    return () => { alive = false; };
  }, []);

  // ----- INIT WORLD -----
  const initWorld = useCallback(() => {
    const pLvl = profile?.level || 1;
    const playerHp = 120 + (pLvl - 1) * 10;
    const lvlEnemy = getLevelEnemy(episodeId || 1, level);
    const enemyHp = lvlEnemy.hp;
    const world = {
      W: 0, H: 0, dpr: 1,
      groundY: 0,
      camX: 0, camTargetX: 0, camY: 0, zoom: 1, zoomTarget: 1, shake: 0,
      time: 0, timeScale: 1,
      phase: "intro", // intro | fight | finish | over
      introT: 0,
      sub: "", subT: 0, subQueue: [],
      rain: [], embers: [], fog: [],
      torches: [],
      trees: [], huts: [],
      mountains: [],
      flash: 0,
      lightLeak: 0,
      over: null,
      winLogged: false,
      p: makeFighter({ name: charDef.name, role: charDef.role, facing: 1, x: -210, hp: playerHp, skin: "#4a2f1c", garb: "#7a3a1a", garb2: "#3a1a0c", accent: charDef.color || "#d97757", weapon: "blade" }),
      e: makeFighter({ name: "Corrupted Priest", role: "BOSS", facing: -1, x: 210, hp: enemyHp, skin: "#9aa0a8", garb: "#1a1418", garb2: "#0a0608", accent: "#c0484a", isPriest: true, enemy: true, ai: {} }),
      comboTimer: 0,
    };
    // environment props
    for (let i = 0; i < 90; i++) world.rain.push({ x: rand(-400, 1200), y: rand(-400, 800), len: rand(12, 26), sp: rand(6, 11) });
    for (let i = 0; i < 14; i++) world.embers.push({ x: rand(-300, 600), y: rand(-20, 80), sp: rand(0.3, 0.9), drift: rand(-0.4, 0.4), r: rand(1, 2.4), ph: rand(0, TAU) });
    for (let i = 0; i < 5; i++) world.fog.push({ x: rand(-300, 600), y: rand(-40, 30), w: rand(260, 520), sp: rand(0.06, 0.18), op: rand(0.05, 0.14) });
    for (let i = 0; i < 4; i++) world.torches.push({ x: -260 + i * 180 + rand(-30, 30), flame: rand(0, TAU) });
    for (let i = 0; i < 6; i++) world.trees.push({ x: -360 + i * 150 + rand(-40, 40), h: rand(120, 200), sw: rand(0, TAU) });
    for (let i = 0; i < 4; i++) world.huts.push({ x: -340 + i * 200 + rand(-30, 30), w: rand(120, 180), h: rand(70, 110) });
    for (let i = 0; i < 8; i++) world.mountains.push({ x: -600 + i * 180, h: rand(120, 220) });
    world.camX = (world.p.x + world.e.x) / 2;
    world.camTargetX = world.camX;
    // intro subtitle sequence — short, then FIGHT!
    const story = getLevelStory(episodeId || 1, level);
    world.subQueue = [
      { t: 0,    who: story[0].speaker.toUpperCase(), text: story[0].text },
      { t: 1800, who: "", text: "" },
    ];
    game.current = world;
  }, [charDef, level, profile]);

  // ----- RESIZE -----
  const resize = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const g = game.current; if (g) { g.W = w; g.H = h; g.dpr = dpr; g.groundY = h * 0.82; }
  }, []);

  // ----- INPUT: edge trigger helper -----
  const pressed = (key) => {
    if (input.current[key]) { if (!edgeKeys.current[key]) { edgeKeys.current[key] = true; return true; } }
    return false;
  };
  const clearEdge = () => { edgeKeys.current = {}; };

  // ----- MAIN LOOP -----
  useEffect(() => {
    initWorld();
    resize();
    window.addEventListener("resize", resize);
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    let last = performance.now();
    let hudT = 0;

    const loop = (now) => {
      const dt = Math.min(40, now - last); last = now;
      const g = game.current; if (!g) { rafRef.current = requestAnimationFrame(loop); return; }
      g.time += dt;
      const ts = g.timeScale;
      const sdt = dt * ts; // scaled delta for gameplay
      step(g, sdt);
      render(ctx, g);
      // throttle HUD updates ~12/s
      hudT += dt;
      if (hudT > 80) {
        hudT = 0;
        setHud({
          pHP: Math.round(g.p.hp), pSP: Math.round(g.p.spirit), eHP: Math.round(g.e.hp),
          combo: g.p.combo, phase: g.phase, sub: g.sub, finisher: g.e.hp > 0 && g.e.hp <= g.e.maxHp * 0.25 && g.p.spirit >= 30,
          enemyName: g.e.name,
          enemyRole: g.e.role,
          fightPrompt: g.fightPromptT && (g.time - g.fightPromptT < 1200),
        });
      }
      clearEdge();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); gameAudio.stopSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- STEP (gameplay) -----
  function step(g, dt) {
    // camera follow
    const mid = (g.p.x + g.e.x) / 2;
    g.camTargetX = mid;
    g.camX = lerp(g.camX, g.camTargetX, 0.06);
    g.zoom = lerp(g.zoom, g.zoomTarget, 0.05);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 0.02);
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 0.004);
    if (g.lightLeak > 0) g.lightLeak = Math.max(0, g.lightLeak - dt * 0.002);

    // subtitles
    if (g.phase === "intro") {
      // ASSET LOADING CONTRACT: do not start combat if full-body assets are missing.
      // Keep the environment rendering (torches, rain, fog) so the arena stays alive.
      if (assetsIncompleteRef.current) { stepEnvironment(g, dt); return; }
      if (!imgsReadyRef.current) { stepEnvironment(g, dt); return; }
      g.introT += dt;
      const cur = g.subQueue.find((s, i) => g.introT >= s.t && (g.subQueue[i + 1] ? g.introT < g.subQueue[i + 1].t : true));
      const full = cur ? `${cur.who ? cur.who + " — " : ""}${cur.text}` : "";
      g.sub = full;
      if (cur && full && full !== g._lastSpoken) {
        g._lastSpoken = full;
        const who = cur.who === charDef.name.toUpperCase() ? "hero" : "priest";
        gameAudio.speak(cur.text, who, who === "hero" ? charDef.id : undefined);
      }
      if (g.introT > 2000) { g.phase = "fight"; g.lightLeak = 1; g.sub = ""; g.timeScale = 1; g.fightStartT = g.time; gameAudio.sfx("special", { intensity: 0.7 }); g.fightPromptT = g.time; }
      g.e.x = lerp(g.e.x, 210, 0.01);
      animatePose(g.p, "idle", dt, 0.12);
      animatePose(g.e, "idle", dt, 0.12);
      stepEnvironment(g, dt);
      return;
    }

    if (g.phase === "finish") {
      // cinematic finish slow-mo
      g.timeScale = lerp(g.timeScale, 0.28, 0.06);
      g.zoomTarget = 1.45;
      if (!g._finSound) { g._finSound = true; gameAudio.sfx("finish", { intensity: 1.3 }); gameAudio.speak("Ancestral finish", "hero", charDef.id); }
      // run finish animation
      g.p.stateT += dt;
      animatePose(g.p, "finish", dt, 0.2);
      if (g.p.stateT > 520 && !g.over) {
        g.e.hp = 0;
        g.flash = 1; g.shake = 1.2;
        enterState(g.e, "defeated");
        g.over = "win";
        gameAudio.sfx("ko", { intensity: 1.3 });
        gameAudio.speak("It is finished.", "hero", charDef.id);
        if (!g.winLogged) { g.winLogged = true; finishWin(g); }
        setTimeout(() => { g.phase = "over"; }, 900);
      }
      stepEnvironment(g, dt);
      return;
    }

    if (g.phase === "over") {
      animatePose(g.p, g.over === "win" ? "idle" : "defeated", dt, 0.08);
      animatePose(g.e, g.over === "win" ? "defeated" : "idle", dt, 0.08);
      stepEnvironment(g, dt);
      return;
    }

    // ---- FIGHT phase ----
    g.timeScale = lerp(g.timeScale, 1, 0.1);
    g.zoomTarget = g.p.combo >= 5 ? 1.16 : (g.p.combo >= 10 ? 1.24 : 1.0);

    // combo timer decay
    if (g.comboTimer > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) g.p.combo = 0; }

    // ---- PLAYER CONTROL ----
    const p = g.p;
    const inp = input.current;
    // movement
    if (p.state !== "defeated" && p.hitstun <= 0 && !["light","heavy","special","grab","finish"].includes(p.state)) {
      const spd = 2.4;
      if (inp.left) { p.vx = -spd; p.facing = -1; }
      else if (inp.right) { p.vx = spd; p.facing = 1; }
      else p.vx *= 0.7;
      if (inp.up && p.onGround) { p.vy = -9.5; p.onGround = false; gameAudio.sfx("jump", { intensity: 0.8, characterId: charDef.id }); }
      // block (hold)
      if (inp.block) { enterState(p, "block"); }
      else if (p.state === "block") enterState(p, "idle");
    }
    // attacks (edge-triggered)
    if (p.cooldown <= 0 && p.hitstun <= 0 && p.state !== "defeated") {
      if (pressed("dodge") && p.onGround) { enterState(p, "dodge"); p.iframe = 320; p.vx = -p.facing * 5; p.cooldown = 200; gameAudio.sfx("dodge", { intensity: 1, characterId: charDef.id }); }
      else if (pressed("finish") && g.e.hp > 0 && g.e.hp <= g.e.maxHp * 0.25 && p.spirit >= 30) { g.phase = "finish"; enterState(p, "finish"); p.stateT = 0; p.spirit -= 30; return; }
      else if (pressed("special") && p.spirit >= 34) { startAttack(p, "special"); p.spirit -= 34; }
      else if (pressed("heavy")) startAttack(p, "heavy");
      else if (pressed("light")) startAttack(p, "light");
      else if (pressed("grab")) startAttack(p, "grab");
    }
    // physics
    physics(p, g, dt);
    physics(g.e, g, dt);

    // ---- ENEMY AI ----
    enemyAI(g, dt);

    // ---- HIT RESOLUTION ----
    resolveHits(g);

    // timers
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.hitstun = Math.max(0, p.hitstun - dt);
    p.iframe = Math.max(0, p.iframe - dt);
    p.stateT += dt;
    g.e.stateT += dt;
    g.e.cooldown = Math.max(0, g.e.cooldown - dt);
    g.e.hitstun = Math.max(0, g.e.hitstun - dt);

    // state transitions / pose animation
    updateState(p, dt);
    updateState(g.e, dt);

    // end conditions
    if (g.e.hp <= 0 && !g.over) {
      g.over = "win"; g.flash = 0.8; g.shake = 1;
      enterState(g.e, "defeated");
      gameAudio.sfx("victory", { characterId: charDef.id });
      gameAudio.speak("You are remembered.", "narrator", charDef.id);
      setTimeout(() => { if (game.current) game.current.phase = "over"; gameAudio.sfx("victory"); }, 600);
      if (!g.winLogged) { g.winLogged = true; finishWin(g); }
    }
    if (p.hp <= 0 && !g.over) {
      g.over = "lose"; enterState(p, "defeated");
      gameAudio.sfx("ko", { intensity: 1 });
      gameAudio.speak("The forgotten call you back.", "priest");
      setTimeout(() => { if (game.current) game.current.phase = "over"; }, 700);
    }

    stepEnvironment(g, dt);
  }

  function finishWin(g) {
    let xp = 20 + (episodeId || 1) * 5 + (level || 1) * 2 + 50; // mini-boss
    let sp = 10 + (level || 1) * 2 + g.p.combo * 2;
    if (profile?.booster_battles > 0) xp *= 2;
    onWin?.({
      xp: Math.round(xp), sp: Math.round(sp),
      key: `${episodeId}-${level}`, boss: true,
      booster: profile?.booster_battles > 0,
      combo: g.p.combo,
      durationMs: Math.round(g.time - (g.fightStartT || g.time)),
    });
  }

  function enterState(f, st) { if (f.state === st) return; f.state = st; f.stateT = 0; }

  function startAttack(f, kind) {
    f.state = kind; f.stateT = 0; f.cooldown = ATK[kind].startup + ATK[kind].active + ATK[kind].recover;
    f.atkKind = kind; f.atkHasHit = false; f.vx = f.facing * 1.2;
    const cid = f.enemy ? undefined : charDef.id;
    if (kind === "light") gameAudio.sfx("light", { intensity: f.enemy ? 0.8 : 1, characterId: cid });
    else if (kind === "heavy") gameAudio.sfx("heavy", { intensity: f.enemy ? 0.85 : 1, characterId: cid });
    else if (kind === "special") gameAudio.sfx("special", { intensity: f.enemy ? 0.8 : 1, characterId: cid });
    else if (kind === "grab") gameAudio.sfx("grab", { intensity: 0.9, characterId: cid });
  }

  function updateState(f, dt) {
    // decide which pose to animate toward
    let poseKey = f.state;
    if (f.state === "idle" && Math.abs(f.vx) > 0.4 && f.onGround) poseKey = "walk";
    if (f.state === "light" || f.state === "heavy" || f.state === "special" || f.state === "grab") {
      const a = ATK[f.state];
      const t = f.stateT;
      if (t > a.startup + a.active + a.recover) { f.state = "idle"; poseKey = "idle"; }
      else if (t > a.startup + a.active) poseKey = f.state; // recovery (ease back)
      else poseKey = f.state;
    }
    if (f.state === "dodge" && f.stateT > 320) { f.state = "idle"; poseKey = "idle"; }
    if (f.state === "block") poseKey = "block";
    if (f.hitstun > 0) poseKey = f.hitstun > 240 ? "stagger" : "hit";
    if (f.state === "defeated") poseKey = "defeated";
    // walk phase
    if (poseKey === "walk") f.walkPhase += dt * 0.02;
    animatePose(f, poseKey, dt, 0.18);
  }

  function animatePose(f, key, dt, rate) {
    const tgt = POSES[key] || POSES.idle;
    const r = 1 - Math.pow(1 - rate, dt / 16);
    const p = f.pose;
    p.lean = lerp(p.lean, tgt.lean, r);
    p.head = lerp(p.head, tgt.head, r);
    p.shL = lerp(p.shL, tgt.shL, r); p.elL = lerp(p.elL, tgt.elL, r);
    p.shR = lerp(p.shR, tgt.shR, r); p.elR = lerp(p.elR, tgt.elR, r);
    p.hipL = lerp(p.hipL, tgt.hipL, r); p.knL = lerp(p.knL, tgt.knL, r);
    p.hipR = lerp(p.hipR, tgt.hipR, r); p.knR = lerp(p.knR, tgt.knR, r);
    p.armRise = lerp(p.armRise, tgt.armRise, r);
    // walk leg swing
    if (key === "walk") {
      const s = Math.sin(f.walkPhase * TAU) * 0.35;
      p.hipL = tgt.hipL + s; p.hipR = tgt.hipR - s;
      p.shL = tgt.shL - s * 0.6; p.shR = tgt.shR + s * 0.6;
    }
    // attack thrust: during active frames, extend lead arm further
    if (["light","heavy","special","grab"].includes(f.state)) {
      const a = ATK[f.state];
      const t = f.stateT;
      if (t > a.startup && t < a.startup + a.active) {
        const ext = (t - a.startup) / a.active;
        const reach = f.facing > 0 ? "shR" : "shL";
        p[reach] = (tgt[reach]) - 0.5 * Math.sin(Math.PI * ext) * f.facing;
        p.lean = tgt.lean + 0.15 * Math.sin(Math.PI * ext);
      }
    }
  }

  function physics(f, g, dt) {
    const dts = dt / 16;
    f.x += f.vx * dts;
    f.vx *= 0.86;
    f.vy += 0.6 * dts; // gravity
    f.y += f.vy * dts;
    if (f.y >= 0) { f.y = 0; f.vy = 0; f.onGround = true; }
    // arena bounds (world)
    f.x = clamp(f.x, -360, 360);
  }

  function resolveHits(g) {
    for (const [atk, def] of [[g.p, g.e], [g.e, g.p]]) {
      if (!["light","heavy","special","grab"].includes(atk.state)) continue;
      if (atk.atkHasHit) continue;
      const a = ATK[atk.state];
      const t = atk.stateT;
      if (t < a.startup || t > a.startup + a.active) continue;
      // hitbox in front of attacker
      const hb = atk.x + atk.facing * (18 + a.range / 2);
      const dist = Math.abs(hb - def.x);
      if (dist < a.range / 2 + 26 && Math.abs(def.y) < 90) {
        atk.atkHasHit = true;
        // dodge i-frames
        if (def.iframe > 0) { spawnSpark(g, def.x, -50, "#5ed1da", false); gameAudio.sfx("dodge", { intensity: 0.7 }); continue; }
        // block
        if (def.state === "block" && Math.sign(atk.x - def.x) === def.facing) {
          def.spirit = Math.min(def.maxSpirit, def.spirit + 4);
          def.vx += atk.facing * (a.kb * 0.4);
          g.shake = Math.max(g.shake, 0.3);
          spawnSpark(g, (atk.x + def.x) / 2, -50, "#f7c948", false);
          gameAudio.sfx("block", { intensity: atk.state === "heavy" ? 1 : 0.8 });
          continue;
        }
        // HIT
        def.hp = Math.max(0, def.hp - a.dmg);
        def.hitstun = atk.state === "heavy" ? 420 : atk.state === "special" ? 520 : 260;
        def.vx += atk.facing * a.kb;
        def.vy = -2.5; def.onGround = false;
        enterState(def, "hit");
        gameAudio.sfx("impact", { intensity: atk.state === "special" ? 1.4 : atk.state === "heavy" ? 1.2 : 0.9, characterId: atk === g.p ? charDef.id : undefined });
        gameAudio.sfx("pain", { intensity: atk.state === "special" ? 1.3 : atk.state === "heavy" ? 1.1 : 0.85, characterId: def === g.p ? charDef.id : undefined });
        if (atk === g.p) {
          g.p.combo += 1; g.comboTimer = 1500;
          g.p.spirit = Math.min(g.p.maxSpirit, g.p.spirit + a.spirit);
        } else {
          g.p.combo = 0;
        }
        g.shake = Math.max(g.shake, atk.state === "special" ? 1 : atk.state === "heavy" ? 0.7 : 0.4);
        g.flash = Math.max(g.flash, atk.state === "special" ? 0.7 : 0.3);
        spawnSpark(g, def.x, -40, atk.state === "special" ? "#2bb3c0" : "#e07466", atk.state === "heavy" || atk.state === "special");
        if (def.hp <= 0) { /* handled in step */ }
      }
    }
  }

  function spawnSpark(g, wx, wy, color, big) {
    if (!g.sparks) g.sparks = [];
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) g.sparks.push({ x: wx, y: wy, vx: rand(-3, 3), vy: rand(-4, 1), life: 380, color });
  }

  function enemyAI(g, dt) {
    const e = g.e, p = g.p;
    if (e.state === "defeated" || e.hitstun > 0) { e.vx *= 0.8; return; }
    if (["light","heavy","special","grab"].includes(e.state)) { return; }
    e.ai.decT = (e.ai.decT || 0) - dt;
    const dist = Math.abs(e.x - p.x);
    e.facing = p.x > e.x ? 1 : -1;
    if (e.ai.decT <= 0) {
      e.ai.decT = rand(500, 1100);
      const r = Math.random();
      if (dist > 120) e.ai.mode = "approach";
      else if (r < 0.4) { startAttack(e, Math.random() < 0.6 ? "light" : "heavy"); e.ai.mode = "attack"; }
      else if (r < 0.55) { e.ai.mode = "block"; e.state = "block"; }
      else if (r < 0.7) { e.ai.mode = "retreat"; }
      else e.ai.mode = "approach";
      if (e.spirit >= 34 && dist < 140 && Math.random() < 0.25) { startAttack(e, "special"); e.spirit -= 34; e.ai.mode = "attack"; }
    }
    if (e.ai.mode === "approach") { e.vx = e.facing * 1.6; if (e.state === "block") e.state = "idle"; }
    else if (e.ai.mode === "retreat") { e.vx = -e.facing * 1.4; }
    else if (e.ai.mode === "block") { e.vx *= 0.7; e.state = "block"; }
    else e.vx *= 0.7;
    // slowly regen spirit
    e.spirit = Math.min(e.maxSpirit, e.spirit + dt * 0.01);
    p.spirit = Math.min(p.maxSpirit, p.spirit + dt * 0.006);
  }

  function stepEnvironment(g, dt) {
    const dts = dt / 16;
    for (const r of g.rain) { r.y += r.sp * dts; r.x -= 1.6 * dts; if (r.y > 900) { r.y = -20; r.x = rand(-200, 1200); } }
    for (const e of g.embers) { e.y -= e.sp * dts; e.x += e.drift * dts; if (e.y < -120) { e.y = 20; e.x = rand(-300, 600); } }
    for (const f of g.fog) { f.x += f.sp * dts; if (f.x > 700) f.x = -400; }
    for (const t of g.torches) t.flame += dts * 0.3;
    for (const t of g.trees) t.sw += dts * 0.02;
    if (g.sparks) for (let i = g.sparks.length - 1; i >= 0; i--) {
      const s = g.sparks[i]; s.x += s.vx * dts; s.y += s.vy * dts; s.vy += 0.2 * dts; s.life -= dt;
      if (s.life <= 0) g.sparks.splice(i, 1);
    }
  }

  // ----- RENDER -----
  function render(ctx, g) {
    const W = g.W, H = g.H, dpr = g.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // camera shake
    const sh = g.shake;
    const ox = sh > 0 ? rand(-sh * 6, sh * 6) : 0;
    const oy = sh > 0 ? rand(-sh * 6, sh * 6) : 0;
    const cx = W / 2 + ox, cy = H * 0.50 + oy;
    const zoom = g.zoom;
    // world -> screen
    const sx = (wx) => cx + (wx - g.camX) * zoom;
    const groundScreenY = g.groundY;

    // ---- SKY ----
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0a0c1a");
    sky.addColorStop(0.4, "#10121f");
    sky.addColorStop(0.75, "#0a0608");
    sky.addColorStop(1, "#040303");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // moon glow
    const mx = sx(-30), my = H * 0.18;
    const mg = ctx.createRadialGradient(mx, my, 8, mx, my, 160);
    mg.addColorStop(0, "rgba(180,200,255,0.55)"); mg.addColorStop(0.4, "rgba(120,150,220,0.18)"); mg.addColorStop(1, "transparent");
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H * 0.5);
    ctx.fillStyle = "rgba(220,228,255,0.9)";
    ctx.beginPath(); ctx.arc(mx, my, 34, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(160,170,210,0.25)";
    ctx.beginPath(); ctx.arc(mx - 10, my - 6, 9, 0, TAU); ctx.arc(mx + 12, my + 8, 6, 0, TAU); ctx.fill();

    // distant mountains (parallax slow)
    ctx.fillStyle = "#0c0e18";
    for (const m of g.mountains) {
      const x = sx(m.x * 0.35);
      ctx.beginPath(); ctx.moveTo(x - 120, groundScreenY); ctx.lineTo(x, groundScreenY - m.h * 0.7); ctx.lineTo(x + 130, groundScreenY); ctx.closePath(); ctx.fill();
    }

    // supernatural blue ambient glow on ground
    const amb = ctx.createLinearGradient(0, groundScreenY - 120, 0, groundScreenY + 40);
    amb.addColorStop(0, "transparent"); amb.addColorStop(1, "rgba(43,179,192,0.10)");
    ctx.fillStyle = amb; ctx.fillRect(0, groundScreenY - 120, W, 160);

    // huts (mid parallax)
    for (const h of g.huts) {
      const x = sx(h.x * 0.7), w = h.w * zoom, hgt = h.h * zoom, gy = groundScreenY;
      ctx.fillStyle = "#0a0708";
      ctx.fillRect(x - w / 2, gy - hgt, w, hgt);
      // thatched roof
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 8, gy - hgt); ctx.lineTo(x, gy - hgt - hgt * 0.5); ctx.lineTo(x + w / 2 + 8, gy - hgt); ctx.closePath();
      ctx.fillStyle = "#0d0a08"; ctx.fill();
      // window glow
      ctx.fillStyle = "rgba(217,119,87,0.5)";
      ctx.fillRect(x - 6, gy - hgt * 0.6, 10, 10);
    }

    // trees (mid)
    for (const t of g.trees) {
      const x = sx(t.x * 0.85), gy = groundScreenY;
      const sw = Math.sin(t.sw) * 6;
      ctx.strokeStyle = "#0a0706"; ctx.lineWidth = 5 * zoom;
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + sw, gy - t.h * zoom); ctx.stroke();
      ctx.fillStyle = "#080b08";
      ctx.beginPath(); ctx.arc(x + sw, gy - t.h * zoom, 22 * zoom, 0, TAU); ctx.fill();
    }

    // ground
    const gr = ctx.createLinearGradient(0, groundScreenY, 0, H);
    gr.addColorStop(0, "#1a140e"); gr.addColorStop(1, "#050303");
    ctx.fillStyle = gr; ctx.fillRect(0, groundScreenY, W, H - groundScreenY);
    // ground line
    ctx.strokeStyle = "rgba(197,160,89,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, groundScreenY); ctx.lineTo(W, groundScreenY); ctx.stroke();

    // torches
    for (const t of g.torches) {
      const x = sx(t.x), gy = groundScreenY;
      // post
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4 * zoom;
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 96 * zoom); ctx.stroke();
      // flame
      const fx = x, fy = gy - 100 * zoom;
      const fl = 1 + Math.sin(t.flame * 6) * 0.18;
      const fg = ctx.createRadialGradient(fx, fy, 2, fx, fy, 60 * zoom * fl);
      fg.addColorStop(0, "rgba(255,210,120,0.9)"); fg.addColorStop(0.4, "rgba(217,119,87,0.5)"); fg.addColorStop(1, "transparent");
      ctx.fillStyle = fg; ctx.fillRect(fx - 70, fy - 70, 140, 140);
      ctx.fillStyle = "rgba(255,170,90,0.9)";
      ctx.beginPath();
      ctx.moveTo(fx, fy - 22 * fl);
      ctx.quadraticCurveTo(fx + 12, fy, fx + 4, fy + 8);
      ctx.quadraticCurveTo(fx, fy + 12, fx - 4, fy + 8);
      ctx.quadraticCurveTo(fx - 12, fy, fx, fy - 22 * fl);
      ctx.fill();
    }

    // ---- FIGHTERS ----
    // ASSET LOADING CONTRACT: do not spawn fighters if full-body assets are missing.
    // The environment still renders (nightmare village stays alive behind the message).
    if (!assetsIncompleteRef.current) {
      drawFighter(ctx, g.e, g, sx, groundScreenY, zoom);
      drawFighter(ctx, g.p, g, sx, groundScreenY, zoom);
    }

    // sparks
    if (g.sparks) for (const s of g.sparks) {
      const x = sx(s.x), y = groundScreenY + s.y * zoom;
      ctx.globalAlpha = clamp(s.life / 380, 0, 1);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, 3 * zoom, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // rain
    ctx.strokeStyle = "rgba(150,170,210,0.25)"; ctx.lineWidth = 1;
    for (const r of g.rain) {
      const x = sx(r.x * 0.6), y = r.y % (H + 40);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + r.len); ctx.stroke();
    }

    // fog
    for (const f of g.fog) {
      const x = sx(f.x * 0.5), y = groundScreenY - 60 + f.y;
      const fg = ctx.createRadialGradient(x, y, 10, x, y, f.w * 0.6);
      fg.addColorStop(0, `rgba(120,130,150,${f.op})`); fg.addColorStop(1, "transparent");
      ctx.fillStyle = fg; ctx.fillRect(x - f.w, y - f.w * 0.4, f.w * 2, f.w * 0.8);
    }

    // embers
    for (const e of g.embers) {
      const x = sx(e.x), y = groundScreenY + e.y * zoom;
      ctx.fillStyle = "rgba(217,119,87,0.7)";
      ctx.beginPath(); ctx.arc(x, y, e.r * zoom, 0, TAU); ctx.fill();
    }

    // flash
    if (g.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${g.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    // light leak
    if (g.lightLeak > 0) {
      const ll = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.4, W * 0.7);
      ll.addColorStop(0, `rgba(255,228,160,${g.lightLeak * 0.7})`); ll.addColorStop(1, "transparent");
      ctx.fillStyle = ll; ctx.fillRect(0, 0, W, H);
    }
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ===== Character rendering — real full-body characters (not stick figures) =====
  // Per-state cinematic transform: lunge, lean, bob, squash, hit-flash, fall.
  function fighterTransform(f, t) {
    let tx = 0, ty = 0, rot = 0, sx = 1, sy = 1, flash = 0;
    const bob = Math.sin(t * 0.003 + (f.enemy ? 1.7 : 0)) * 2;
    if (f.hitstun > 0 && f.state !== "defeated") {
      const ph = clamp(f.hitstun / 300, 0, 1);
      tx = -f.facing * 12 * ph; rot = -f.facing * 0.22 * ph; flash = 0.65 * ph; sy = 0.94;
    } else {
      switch (f.state) {
        case "walk": ty = -Math.abs(Math.sin(f.walkPhase * TAU)) * 3; rot = Math.sin(f.walkPhase * TAU) * 0.04; break;
        case "jump": sy = 1.06; sx = 0.95; ty = -2; break;
        case "light": { const a = ATK.light, ph = clamp((f.stateT - a.startup) / a.active, 0, 1); tx = f.facing * (12 + 16 * Math.sin(Math.PI * ph)); rot = f.facing * 0.1 * Math.sin(Math.PI * ph); break; }
        case "heavy": { const a = ATK.heavy, ph = clamp((f.stateT - a.startup) / a.active, 0, 1); tx = f.facing * (16 + 26 * Math.sin(Math.PI * ph)); rot = f.facing * 0.2 * Math.sin(Math.PI * ph); break; }
        case "special": { const a = ATK.special, ph = clamp((f.stateT - a.startup) / a.active, 0, 1); tx = f.facing * (10 + 22 * Math.sin(Math.PI * ph)); rot = f.facing * (-0.12 + 0.22 * ph); break; }
        case "grab": { const a = ATK.grab, ph = clamp((f.stateT - a.startup) / a.active, 0, 1); tx = f.facing * 14 * Math.sin(Math.PI * ph); break; }
        case "block": tx = -f.facing * 5; rot = -f.facing * 0.08; break;
        case "dodge": { const ph = clamp(f.stateT / 320, 0, 1); tx = -f.facing * 24 * Math.sin(Math.PI * ph); rot = -f.facing * 0.24 * Math.sin(Math.PI * ph); break; }
        case "defeated": rot = f.facing > 0 ? -1.45 : 1.45; ty = 24; sy = 0.62; break;
        case "finish": { const ph = clamp(f.stateT / 520, 0, 1); tx = f.facing * (24 + 34 * Math.sin(Math.PI * ph)); rot = f.facing * 0.24 * Math.sin(Math.PI * ph); break; }
        default: ty = bob;
      }
    }
    return { tx, ty, rot, sx, sy, flash };
  }

  function attackArcPhase(f) {
    if (!["light", "heavy", "special"].includes(f.state)) return null;
    const a = ATK[f.state], t = f.stateT;
    if (t < a.startup || t > a.startup + a.active) return null;
    return (t - a.startup) / a.active;
  }

  function drawFighter(ctx, f, g, sx, groundY, zoom) {
    const fx = sx(f.x);
    const fy = groundY + f.y * zoom;
    const T = fighterTransform(f, g.time);
    ctx.save();
    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.ellipse(fx, fy, 42 * zoom, 11 * zoom, 0, 0, TAU); ctx.fill();
    // body transform (origin at feet)
    ctx.translate(fx, fy);
    ctx.scale(f.facing, 1);
    ctx.rotate(T.rot);
    ctx.translate(T.tx * zoom, T.ty * zoom);
    ctx.scale(T.sx, T.sy);
    if (f.isPriest) drawPriest(ctx, f, g, zoom);
    else drawHero(ctx, f, g, zoom, T.flash);
    ctx.restore();

    // attack swipe arc (world space) — sells the swing on the static hero art
    const arc = attackArcPhase(f);
    if (arc != null) {
      const ax = fx + f.facing * (44 + ATK[f.state].range * 0.45) * zoom;
      const ay = fy - 96 * zoom;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.PI * arc) * 0.85;
      const col = f.state === "special" ? "#2bb3c0" : f.state === "heavy" ? "#e07466" : "#f0c9a8";
      ctx.strokeStyle = col; ctx.lineWidth = (f.state === "heavy" ? 9 : 6) * zoom; ctx.lineCap = "round";
      const r = ATK[f.state].range * 0.7 * zoom;
      const a0 = -1.0 + arc * 1.8;
      ctx.beginPath(); ctx.arc(ax, ay, r, a0 - 0.9, a0 + 0.9); ctx.stroke();
      ctx.restore();
    }
  }

  // BABATUNDE — full-body playable asset rendered large as the fighter.
  // Per spec: no procedural humanoid, no portrait-as-fighter. If the full-body
  // asset is not loaded, nothing is drawn (fighters are not spawned).
  function drawHero(ctx, f, g, zoom, flash) {
    const img = heroImgRef.current;
    const iw = img && (img.naturalWidth || img.width);
    const ih = img && (img.naturalHeight || img.height);
    if (!img || !iw || !ih) return;
    const H = g.H * 0.62 * zoom;   // 62% of screen height — large but both fighters visible
    const W = H * (iw / ih);
    ctx.drawImage(img, -W / 2, -H, W, H);
    // subtle night-environment tint so the sprite sits in the scene
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(110,100,80,0.22)";
    ctx.fillRect(-W / 2, -H, W, H);
    ctx.globalCompositeOperation = "source-over";
    // ground shadow blend at feet
    const grd = ctx.createLinearGradient(0, -H * 0.08, 0, 0);
    grd.addColorStop(0, "transparent"); grd.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grd; ctx.fillRect(-W / 2, -H * 0.08, W, H * 0.08);
    // hit flash overlay
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = "rgba(255,70,50,1)";
      ctx.fillRect(-W / 2, -H, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // CORRUPTED PRIEST — full-body playable asset rendered large.
  // Per spec: no procedural humanoid, no invented visual identity. If the
  // full-body asset is not loaded, nothing is drawn (fighter is not spawned).
  function drawPriest(ctx, f, g, zoom) {
    const img = enemyImgRef.current;
    const iw = img && (img.naturalWidth || img.width);
    const ih = img && (img.naturalHeight || img.height);
    if (!img || !iw || !ih) return;
    const H = g.H * 0.62 * zoom;
    const W = H * (iw / ih);
    ctx.drawImage(img, -W / 2, -H, W, H);
    // dark supernatural tint
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(40,55,75,0.35)";
    ctx.fillRect(-W / 2, -H, W, H);
    ctx.globalCompositeOperation = "source-over";
    // ground shadow blend at feet
    const grd = ctx.createLinearGradient(0, -H * 0.08, 0, 0);
    grd.addColorStop(0, "transparent"); grd.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grd; ctx.fillRect(-W / 2, -H * 0.08, W, H * 0.08);
  }

  // ----- INPUT WIRING (keyboard + gamepad) -----
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      gameAudio.resume();
      if (k === "a") input.current.left = true;
      if (k === "d") input.current.right = true;
      if (k === "w") input.current.up = true;
      if (k === "j") input.current.light = true;
      if (k === "k") input.current.heavy = true;
      if (k === "l") input.current.special = true;
      if (k === "i") input.current.block = true;
      if (k === "shift") input.current.dodge = true;
      if (k === "e") input.current.grab = true;
      if (k === "r") input.current.finish = true;
      if (k === "escape") onExit?.();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k === "a") input.current.left = false;
      if (k === "d") input.current.right = false;
      if (k === "w") input.current.up = false;
      if (k === "j") input.current.light = false;
      if (k === "k") input.current.heavy = false;
      if (k === "l") input.current.special = false;
      if (k === "i") input.current.block = false;
      if (k === "shift") input.current.dodge = false;
      if (k === "e") input.current.grab = false;
      if (k === "r") input.current.finish = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    let gpT = 0;
    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads[0];
      if (gp) {
        const ax = gp.axes[0] || 0;
        input.current.left = ax < -0.3 || gp.buttons[14]?.pressed;
        input.current.right = ax > 0.3 || gp.buttons[15]?.pressed;
        input.current.up = gp.buttons[0]?.pressed; // A jump
        input.current.block = gp.buttons[4]?.pressed; // LB
        input.current.light = gp.buttons[2]?.pressed; // X
        input.current.heavy = gp.buttons[3]?.pressed; // Y
        input.current.special = gp.buttons[5]?.pressed; // RB
        input.current.grab = gp.buttons[6]?.pressed; // LT
        input.current.dodge = gp.buttons[1]?.pressed; // B
        input.current.finish = gp.buttons[7]?.pressed; // RT
      }
      gpT = requestAnimationFrame(poll);
    };
    gpT = requestAnimationFrame(poll);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); cancelAnimationFrame(gpT); };
  }, [onExit]);

  // ----- TOUCH controls -----
  const touchBtn = (key, label, cls) => (
    <button
      data-act={key}
      className={`relative w-14 h-14 rounded-full border backdrop-blur-sm flex items-center justify-center text-[10px] font-bold tracking-wide active:scale-90 transition ${cls}`}
      style={{ background: "rgba(10,8,7,0.4)", borderColor: "rgba(197,160,89,0.4)", color: "#d1a985" }}
      onPointerDown={(e) => { e.preventDefault(); gameAudio.resume(); input.current[key] = true; }}
      onPointerUp={(e) => { e.preventDefault(); input.current[key] = false; }}
      onPointerLeave={() => { input.current[key] = false; }}
      onPointerCancel={() => { input.current[key] = false; }}
    >{label}</button>
  );

  // joystick
  const joyRef = useRef(null);
  const onJoyStart = (e) => {
    e.preventDefault();
    gameAudio.resume();
    const setJoyVec = (cx, cy, tx, ty) => {
      let dx = tx - cx, dy = ty - cy;
      const max = 48;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      setJoy({ active: true, x: dx, y: dy });
      input.current.left = dx < -10;
      input.current.right = dx > 10;
      input.current.up = dy < -28;
    };
    const rect = joyRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    setJoyVec(cx, cy, e.clientX, e.clientY);
    const move = (ev) => setJoyVec(cx, cy, ev.clientX, ev.clientY);
    const end = () => {
      setJoy({ active: false, x: 0, y: 0 });
      input.current.left = false; input.current.right = false; input.current.up = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  // fullscreen
  const toggleFs = () => {
    const w = wrapRef.current;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else w?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // auto-enter fullscreen
  useEffect(() => {
    const w = wrapRef.current;
    if (w && document.fullscreenEnabled) w.requestFullscreen?.().then(() => setFs(true)).catch(() => {});
    return () => { if (document.fullscreenElement === wrapRef.current) document.exitFullscreen?.().catch(() => {}); };
  }, []);

  const pHPpct = clamp((hud.pHP / (game.current?.p.maxHp || 120)) * 100, 0, 100);
  const eHPpct = clamp((hud.eHP / (game.current?.e.maxHp || 100)) * 100, 0, 100);
  const pSPpct = clamp((hud.pSP / 100) * 100, 0, 100);

  return (
    <div ref={wrapRef} className="fixed inset-0 z-[1000] bg-black select-none" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Loading gate — wait for real character images before showing the arena */}
      {!imgsReady && !assetsIncomplete && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black">
          <div className="w-10 h-10 border-4 border-[#c5a059]/30 border-t-[#d97757] rounded-full animate-spin" />
          <p className="cinzel-title text-sm text-[#d1a985] tracking-widest">Summoning Warriors…</p>
          <p className="text-[10px] text-[#8a6d3b]">Loading character assets</p>
        </div>
      )}

      {/* ASSET INCOMPLETE — spec Section 31 Step 4: stop character spawn, show missing-asset message */}
      {assetsIncomplete && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-sm px-6">
          <AlertTriangle className="w-12 h-12 text-[#d97757]" />
          <h2 className="cinzel-title text-lg sm:text-xl text-[#f0d9a8] text-center font-bold tracking-wide">
            PLAYABLE CHARACTER ASSET MISSING
          </h2>
          <p className="text-xs sm:text-sm text-[#d1a985] text-center max-w-md leading-relaxed">
            Upload a <span className="text-[#f7c948] font-semibold">full-body 3D model</span> (GLTF/GLB) or
            <span className="text-[#f7c948] font-semibold"> full-body transparent sprite</span> (PNG) for the
            fighters. Head-and-shoulders portraits cannot be used as playable characters.
          </p>
          <div className="mt-2 space-y-2 w-full max-w-sm">
            {assetCheck.missingAssets.map((m, i) => (
              <div key={i} className="noir-panel rounded-lg p-3 text-left">
                <p className="text-[11px] font-bold text-[#e07466] tracking-wide uppercase">{m.name}</p>
                <p className="text-[10px] text-[#8a6d3b] mt-0.5">{m.reason}</p>
                <div className="flex gap-1.5 mt-2 text-[9px]">
                  <span className={`px-2 py-0.5 rounded border ${m.hasPortrait ? "bg-[#3a2a1a] text-[#d1a985] border-[#c5a059]/20" : "bg-[#3a1010] text-[#e07466] border-[#c0484a]/20"}`}>Portrait {m.hasPortrait ? "✓" : "✗"}</span>
                  <span className="px-2 py-0.5 rounded bg-[#3a1010] text-[#e07466] border border-[#c0484a]/20">3D Model {m.has3D ? "✓" : "✗"}</span>
                  <span className="px-2 py-0.5 rounded bg-[#3a1010] text-[#e07466] border border-[#c0484a]/20">Full-Body Sprite {m.hasSprite ? "✓" : "✗"}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#6a5a3b] mt-2 italic text-center max-w-sm">
            Environment · combat · controls · AI · VFX · camera are all ready —
            fighters will appear the moment full-body assets are uploaded.
          </p>
          <Link to="/admin/game-assets" className="mt-3 px-6 py-2.5 rounded-xl btn-noir-primary text-sm font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload Full-Body Assets
          </Link>
          <button onClick={onExit} className="mt-2 px-6 py-2 rounded-xl btn-noir-ghost text-sm font-semibold">
            Back to Hub
          </button>
        </div>
      )}

      {/* TOP HUD */}
      <div className="absolute top-0 inset-x-0 p-2.5 flex items-start justify-between pointer-events-none z-20">
        {/* player */}
        <div className="flex items-center gap-2 max-w-[52%]">
          <div className="min-w-0">
            <p className="cinzel-title text-[10px] text-[#f0d9a8] font-bold leading-none truncate">{charDef.name}</p>
            <div className="mt-1 w-28 sm:w-36 h-2 rounded-full bg-black/70 border border-[#c5a059]/30 overflow-hidden">
              <div className="h-full hp-bar-fill transition-all duration-200" style={{ width: `${pHPpct}%` }} />
            </div>
            <div className="mt-0.5 w-28 sm:w-36 h-1.5 rounded-full bg-black/70 border border-[#2bb3c0]/30 overflow-hidden">
              <div className="h-full sp-bar-fill transition-all duration-200" style={{ width: `${pSPpct}%` }} />
            </div>
          </div>
        </div>
        {/* center: combo */}
        <div className="pt-1 text-center">
          {hud.combo >= 2 && (
            <span className="cinzel-title text-sm font-extrabold" style={{ color: hud.combo >= 5 ? "#f7c948" : "#d1a985", textShadow: "0 2px 8px #000" }}>
              {hud.combo} HIT COMBO
            </span>
          )}
          {hud.finisher && hud.phase === "fight" && (
            <p className="text-[9px] mt-0.5 text-[#f7c948] animate-pulse font-bold tracking-widest">✦ ANCESTRAL FINISH READY (R)</p>
          )}
        </div>
        {/* enemy */}
        <div className="flex items-center gap-2 max-w-[52%] flex-row-reverse text-right">
          <div className="min-w-0">
            <p className="cinzel-title text-[10px] text-[#e07466] font-bold leading-none truncate">{hud.enemyName}</p>
            <div className="mt-1 w-28 sm:w-36 h-2 rounded-full bg-black/70 border border-[#c0484a]/30 overflow-hidden ml-auto">
              <div className="h-full foe-bar-fill transition-all duration-200" style={{ width: `${eHPpct}%` }} />
            </div>
            <div className="mt-0.5 text-[8px] text-[#8a6d3b] tracking-widest">{hud.enemyRole || "ENEMY"}</div>
          </div>
        </div>
      </div>

      {/* subtitle / intro */}
      {hud.phase === "intro" && hud.sub && (
        <div className="absolute left-0 right-0 bottom-28 sm:bottom-32 px-6 z-20 pointer-events-none">
          <p className="text-center text-sm sm:text-base text-[#f0d9a8] italic" style={{ textShadow: "0 2px 10px #000" }}>
            {hud.sub}
          </p>
        </div>
      )}

      {/* FIGHT! prompt when combat begins */}
      {hud.fightPrompt && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <h2 className="cinzel-title font-extrabold bronze-text fight-pop" style={{ fontSize: "clamp(3rem, 14vw, 6rem)", letterSpacing: "0.12em" }}>
            FIGHT!
          </h2>
        </div>
      )}

      {/* top-right controls */}
      <div className="absolute top-2 right-2 z-30 flex gap-1.5 pointer-events-auto">
        <button onClick={() => { setMuted((m) => !m); gameAudio.resume(); }} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]">{muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
        <button onClick={onExit} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]"><X className="w-4 h-4" /></button>
        <button onClick={toggleFs} className="p-2 rounded-full bg-black/50 border border-[#c5a059]/30 text-[#d1a985]">{fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button>
      </div>

      {/* END SCREEN */}
      {hud.phase === "over" && (
        <div className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <h2 className={`cinzel-title font-extrabold ${game.current?.over === "win" ? "bronze-text" : "text-[#c0484a]"}`} style={{ fontSize: "clamp(2.2rem, 8vw, 4rem)", letterSpacing: "0.08em" }}>
            {game.current?.over === "win" ? "VICTORY" : "DEFEAT"}
          </h2>
          {game.current?.over === "win" && <p className="text-xs text-[#f7c948]">Max Combo ×{hud.combo}</p>}
          <button onClick={onExit} className="px-6 py-2.5 rounded-xl btn-noir-primary font-semibold text-sm">Continue</button>
        </div>
      )}

      {/* TOUCH CONTROLS */}
      <div className="absolute bottom-0 inset-x-0 z-30 flex items-end justify-between p-3 pointer-events-none">
        {/* joystick */}
        <div
          ref={joyRef}
          onPointerDown={onJoyStart}
          className="relative w-28 h-28 rounded-full pointer-events-auto"
          style={{ background: "radial-gradient(circle, rgba(10,8,7,0.45), rgba(10,8,7,0.15))", border: "1px solid rgba(197,160,89,0.3)" }}
        >
          <div
            className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full"
            style={{
              transform: `translate(-50%,-50%) translate(${joy.x}px, ${joy.y}px)`,
              background: "radial-gradient(circle, rgba(217,119,87,0.6), rgba(120,60,40,0.4))",
              border: "1px solid rgba(217,119,87,0.6)",
            }}
          />
        </div>
        {/* action buttons */}
        <div className="grid grid-cols-3 gap-2 pointer-events-auto">
          {touchBtn("light", "ATK", "border-[#d97757]/50 text-[#f0c9a8]")}
          {touchBtn("heavy", "HVY", "border-[#c0484a]/50 text-[#e07466]")}
          {touchBtn("special", "SPC", "border-[#2bb3c0]/50 text-[#5ed1da]")}
          {touchBtn("block", "BLK", "border-[#c5a059]/40")}
          {touchBtn("dodge", "DDG", "border-[#c5a059]/40")}
          {touchBtn("grab", "GRB", "border-[#c5a059]/40")}
          {touchBtn("up", "JMP", "border-[#3fae6a]/40 text-[#6dd49a]")}
          {touchBtn("finish", "FSH", "border-[#f7c948]/60 text-[#f7c948]")}
        </div>
      </div>
    </div>
  );
}