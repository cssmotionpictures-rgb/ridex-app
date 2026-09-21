import React, { useEffect, useRef } from "react";

// Four self-contained HTML5 canvas games (Runner / Fighter / Adventure / Racing)
// ported to React. They run entirely in-app — no external embeds to break — and
// play through the same Arcade flow (ad-gated free plays, premium unlimited).
const W = 800;
const H = 500;

function createRunner(keys) {
  let p = { x: 50, y: 380, w: 28, h: 38, vy: 0, vx: 0, speed: 4, jump: -10, grounded: false };
  let coins = [], enemies = [], spikes = [], platforms = [];
  let score = 0, gameOver = false, win = false;

  const reset = () => {
    platforms = [
      { x: 0, y: 440, w: 800, h: 20 }, { x: 120, y: 360, w: 100, h: 16 }, { x: 320, y: 300, w: 100, h: 16 },
      { x: 520, y: 360, w: 100, h: 16 }, { x: 680, y: 300, w: 100, h: 16 }, { x: 200, y: 200, w: 80, h: 14 }, { x: 500, y: 200, w: 80, h: 14 },
    ];
    coins = [[130,330],[170,330],[330,270],[370,270],[530,330],[570,330],[690,270],[730,270],[210,170],[510,170]].map(([x,y])=>({x,y,w:16,h:16,c:false}));
    enemies = [
      { x: 200, y: 422, w: 24, h: 18, vx: 1.5, r: 80, sx: 200, alive: true },
      { x: 550, y: 422, w: 24, h: 18, vx: 1.2, r: 80, sx: 550, alive: true },
      { x: 400, y: 282, w: 24, h: 18, vx: 1.0, r: 60, sx: 400, alive: true },
    ];
    spikes = [{ x: 480, y: 432, w: 20, h: 10 }, { x: 640, y: 432, w: 20, h: 10 }];
    p.x = 50; p.y = 380; p.vy = 0; p.grounded = false; score = 0; gameOver = false; win = false;
  };
  reset();

  const update = () => {
    if (gameOver || win) return;
    let move = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) move = -1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) move = 1;
    p.vx = move * p.speed;
    if ((keys["ArrowUp"] || keys["w"] || keys["W"] || keys[" "]) && p.grounded) { p.vy = p.jump; p.grounded = false; }
    p.vy = Math.min(12, p.vy + 0.5);
    p.x = Math.max(0, Math.min(W - p.w, p.x + p.vx));
    p.y += p.vy; p.grounded = false;
    for (const pl of platforms) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w && p.y + p.h > pl.y && p.y < pl.y + pl.h) {
        if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.grounded = true; }
        else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0; }
      }
    }
    for (const c of coins) {
      if (!c.c && p.x + p.w > c.x && p.x < c.x + c.w && p.y + p.h > c.y && p.y < c.y + c.h) { c.c = true; score += 10; }
    }
    for (const e of enemies) {
      if (!e.alive) continue;
      e.x += e.vx;
      if (e.x > e.sx + e.r || e.x < e.sx - e.r) e.vx *= -1;
      if (p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h > e.y && p.y < e.y + e.h) {
        if (p.vy > 0 && p.y + p.h - e.y < 20) { e.alive = false; p.vy = -6; score += 20; } else gameOver = true;
      }
    }
    for (const s of spikes) {
      if (p.x + p.w > s.x && p.x < s.x + s.w && p.y + p.h > s.y && p.y < s.y + s.h) gameOver = true;
    }
    if (p.x > 750 && p.y < 100) win = true;
    if (p.y > H + 50) gameOver = true;
  };

  const draw = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a2a4a"); g.addColorStop(0.6, "#4a7a9a"); g.addColorStop(1, "#2a5a3a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(100 + i * 200, 40 + i * 10, 40, 0, Math.PI * 2); ctx.fill(); }
    for (const pl of platforms) { ctx.fillStyle = "#8a7a5a"; ctx.fillRect(pl.x, pl.y, pl.w, pl.h); ctx.fillStyle = "#4a8a3a"; ctx.fillRect(pl.x, pl.y - 4, pl.w, 4); }
    for (const c of coins) { if (c.c) continue; ctx.fillStyle = "#f1c40f"; ctx.shadowColor = "#f1c40f"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(c.x + 8, c.y + 8, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
    for (const e of enemies) { if (!e.alive) continue; ctx.fillStyle = "#e74c3c"; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.fillStyle = "#fff"; ctx.fillRect(e.x + 6, e.y + 6, 4, 4); ctx.fillRect(e.x + e.w - 10, e.y + 6, 4, 4); }
    for (const s of spikes) { ctx.fillStyle = "#e74c3c"; ctx.beginPath(); ctx.moveTo(s.x, s.y + s.h); ctx.lineTo(s.x + s.w / 2, s.y); ctx.lineTo(s.x + s.w, s.y + s.h); ctx.fill(); }
    ctx.fillStyle = "#e74c3c"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#f1c40f"; ctx.fillRect(p.x + 4, p.y - 6, 20, 6);
    ctx.fillStyle = "#f5e6c8"; ctx.fillRect(p.x + 6, p.y + 6, 6, 6); ctx.fillRect(p.x + p.w - 12, p.y + 6, 6, 6);
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left"; ctx.fillText("🪙 " + score, 20, 30);
    ctx.fillStyle = "#2ecc71"; ctx.fillRect(760, 60, 10, 60);
    ctx.fillStyle = "#f1c40f"; ctx.beginPath(); ctx.moveTo(770, 60); ctx.lineTo(800, 70); ctx.lineTo(770, 80); ctx.fill();
    endOverlay(ctx, gameOver, win);
  };

  const handleRestart = () => { if (keys["r"] || keys["R"]) { reset(); return true; } return false; };
  return { update, draw, handleRestart, reset, name: "Ride X Runner — collect coins & reach the flag!" };
}

function createFighter(keys) {
  let p1 = { x: 150, y: 300, w: 40, h: 60, hp: 100, maxHp: 100, atk: false, atkTimer: 0, block: false };
  let p2 = { x: 600, y: 300, w: 40, h: 60, hp: 100, maxHp: 100, atk: false, atkTimer: 0, block: false };
  let gameOver = false, winner = null, particles = [];

  const reset = () => {
    p1 = { x: 150, y: 300, w: 40, h: 60, hp: 100, maxHp: 100, atk: false, atkTimer: 0, block: false };
    p2 = { x: 600, y: 300, w: 40, h: 60, hp: 100, maxHp: 100, atk: false, atkTimer: 0, block: false };
    gameOver = false; winner = null; particles = [];
  };
  reset();

  const burst = (x, y, color, n = 12) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 30 + Math.random() * 20, maxLife: 50, size: 3 + Math.random() * 5, color });
    }
  };
  const attack = (atk, tgt, name) => {
    if (atk.atk || atk.atkTimer > 0) return;
    if (Math.abs(tgt.x - atk.x) < 70) {
      atk.atk = true; atk.atkTimer = 12;
      let dmg = 8 + Math.random() * 4;
      if (tgt.block) { dmg = Math.floor(dmg * 0.2); burst(tgt.x, tgt.y - 20, "#3498db", 6); }
      else { tgt.hp -= dmg; burst(tgt.x, tgt.y - 20, "#e74c3c", 15); }
      if (tgt.hp <= 0) { tgt.hp = 0; gameOver = true; winner = name; }
    }
  };

  const update = () => {
    if (gameOver) return;
    if (keys["a"] || keys["A"]) p1.x -= 3;
    if (keys["d"] || keys["D"]) p1.x += 3;
    p1.x = Math.max(20, Math.min(700, p1.x));
    if ((keys["j"] || keys["J"]) && p1.atkTimer === 0) attack(p1, p2, "You");
    p1.block = !!(keys["k"] || keys["K"]);
    const dx = p1.x - p2.x;
    if (Math.abs(dx) > 60) p2.x += Math.sign(dx) * 2.2;
    if (Math.random() < 0.02 && p2.atkTimer === 0 && Math.abs(dx) < 70) attack(p2, p1, "CPU");
    if (Math.random() < 0.01) p2.block = true; else if (Math.random() < 0.02) p2.block = false;
    p2.x = Math.max(20, Math.min(780, p2.x));
    if (p1.atkTimer > 0) p1.atkTimer--; else p1.atk = false;
    if (p2.atkTimer > 0) p2.atkTimer--; else p2.atk = false;
    for (let i = particles.length - 1; i >= 0; i--) {
      const pa = particles[i]; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.1; pa.life--;
      if (pa.life <= 0) particles.splice(i, 1);
    }
    p1.hp = Math.max(0, Math.min(100, p1.hp)); p2.hp = Math.max(0, Math.min(100, p2.hp));
  };

  const draw = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a0a1a"); g.addColorStop(0.5, "#1a1a2a"); g.addColorStop(1, "#2a1a1a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a1a2a"; ctx.fillRect(0, 420, W, 80);
    ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.font = "bold 80px sans-serif"; ctx.textAlign = "center"; ctx.fillText("VS", W / 2, 200);
    [[p1, 50, "#3498db"], [p2, 550, "#e74c3c"]].forEach(([p, x]) => {
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x, 20, 200, 18);
      const hp = p.hp / p.maxHp;
      ctx.fillStyle = hp > 0.5 ? "#2ecc71" : hp > 0.25 ? "#f39c12" : "#e74c3c";
      ctx.fillRect(x, 20, 200 * hp, 18);
      ctx.strokeStyle = "#c9a87c"; ctx.lineWidth = 2; ctx.strokeRect(x, 20, 200, 18);
    });
    [[p1, "#3498db"], [p2, "#e74c3c"]].forEach(([p, col]) => {
      ctx.fillStyle = col; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#f5e6c8"; ctx.fillRect(p.x + 8, p.y - 10, 24, 14);
      if (p.block) { ctx.fillStyle = "rgba(52,152,219,0.2)"; ctx.fillRect(p.x - 10, p.y - 5, 60, 40); }
      if (p.atk) { ctx.fillStyle = "rgba(241,196,15,0.2)"; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 50, 0, Math.PI * 2); ctx.fill(); }
    });
    for (const pa of particles) { const a = pa.life / pa.maxLife; ctx.globalAlpha = a; ctx.fillStyle = pa.color || "#f1c40f"; ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size * a, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (gameOver) { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#f1c40f"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏆 " + winner + " WINS!", W / 2, H / 2 - 20); ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.fillText("Press R to restart", W / 2, H / 2 + 40); }
  };
  const handleRestart = () => { if (keys["r"] || keys["R"]) { reset(); return true; } return false; };
  return { update, draw, handleRestart, reset, name: "Street Fighter — J attack, K block" };
}

function createAdventure(keys) {
  let p = { x: 50, y: 350, w: 30, h: 40, vy: 0, vx: 0, speed: 3, jump: -8, grounded: false, hp: 100 };
  let enemies = [], treasures = [], platforms = [], particles = [];
  let keysCollected = 0, totalKeys = 5, gameOver = false, win = false, hasSword = false, atkAnim = 0;

  const reset = () => {
    platforms = [
      { x: 0, y: 450, w: 800, h: 20 }, { x: 100, y: 380, w: 120, h: 14 }, { x: 350, y: 330, w: 100, h: 14 },
      { x: 550, y: 380, w: 120, h: 14 }, { x: 200, y: 260, w: 80, h: 14 }, { x: 480, y: 260, w: 80, h: 14 },
    ];
    enemies = [
      { x: 150, y: 432, w: 24, h: 18, vx: 1.2, r: 60, sx: 150, alive: true, hp: 20 },
      { x: 450, y: 432, w: 24, h: 18, vx: 1.5, r: 80, sx: 450, alive: true, hp: 20 },
      { x: 650, y: 432, w: 24, h: 18, vx: 1.0, r: 50, sx: 650, alive: true, hp: 20 },
    ];
    treasures = [
      { x: 120, y: 350, w: 16, h: 16, c: false, type: "key" }, { x: 360, y: 300, w: 16, h: 16, c: false, type: "key" },
      { x: 580, y: 350, w: 16, h: 16, c: false, type: "key" }, { x: 220, y: 230, w: 16, h: 16, c: false, type: "key" },
      { x: 500, y: 230, w: 16, h: 16, c: false, type: "key" }, { x: 720, y: 320, w: 20, h: 20, c: false, type: "sword" },
    ];
    p.x = 50; p.y = 350; p.hp = 100; p.vy = 0; p.grounded = false;
    keysCollected = 0; hasSword = false; atkAnim = 0; gameOver = false; win = false; particles = [];
  };
  reset();
  const burst = (x, y, color, n = 10) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 20 + Math.random() * 20, maxLife: 40, size: 2 + Math.random() * 4, color }); }
  };
  const update = () => {
    if (gameOver || win) return;
    let move = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) move = -1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) move = 1;
    p.vx = move * p.speed;
    if ((keys["ArrowUp"] || keys["w"] || keys["W"] || keys[" "]) && p.grounded) { p.vy = p.jump; p.grounded = false; }
    p.vy = Math.min(10, p.vy + 0.4);
    p.x = Math.max(0, Math.min(W - p.w, p.x + p.vx));
    p.y += p.vy; p.grounded = false;
    for (const pl of platforms) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w && p.y + p.h > pl.y && p.y < pl.y + pl.h) {
        if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.grounded = true; } else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0; }
      }
    }
    for (const t of treasures) {
      if (t.c) continue;
      if (p.x + p.w > t.x && p.x < t.x + t.w && p.y + p.h > t.y && p.y < t.y + t.h) {
        t.c = true;
        if (t.type === "key") { keysCollected++; burst(t.x + 8, t.y + 8, "#f1c40f", 12); }
        else if (t.type === "sword") { hasSword = true; burst(t.x + 10, t.y + 10, "#3498db", 16); }
      }
    }
    if ((keys["z"] || keys["Z"]) && hasSword && atkAnim === 0) {
      atkAnim = 10;
      for (const e of enemies) { if (!e.alive) continue; if (Math.abs(e.x - p.x) < 50 && Math.abs(e.y - p.y) < 40) { e.hp -= 15; burst(e.x + e.w / 2, e.y + e.h / 2, "#e74c3c", 12); if (e.hp <= 0) e.alive = false; } }
    }
    if (atkAnim > 0) atkAnim--;
    for (const e of enemies) {
      if (!e.alive) continue;
      e.x += e.vx; if (e.x > e.sx + e.r || e.x < e.sx - e.r) e.vx *= -1;
      if (p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h > e.y && p.y < e.y + e.h) {
        if (atkAnim > 0) { e.hp -= 10; burst(e.x + e.w / 2, e.y + e.h / 2, "#e74c3c", 8); if (e.hp <= 0) e.alive = false; }
        else { p.hp -= 5; burst(p.x + p.w / 2, p.y + p.h / 2, "#e74c3c", 6); if (p.hp <= 0) { p.hp = 0; gameOver = true; } }
      }
    }
    if (keysCollected >= totalKeys && hasSword && p.x > 750 && p.y < 100) win = true;
    if (p.y > H + 50) gameOver = true;
    for (let i = particles.length - 1; i >= 0; i--) { const pa = particles[i]; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.05; pa.life--; if (pa.life <= 0) particles.splice(i, 1); }
  };
  const draw = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a1a0a"); g.addColorStop(0.5, "#1a3a1a"); g.addColorStop(1, "#0a2a0a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const pl of platforms) { ctx.fillStyle = "#3a5a3a"; ctx.fillRect(pl.x, pl.y, pl.w, pl.h); ctx.fillStyle = "#4a6a4a"; ctx.fillRect(pl.x, pl.y - 3, pl.w, 4); }
    for (const t of treasures) { if (t.c) continue; ctx.fillStyle = t.type === "key" ? "#f1c40f" : "#3498db"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.fillRect(t.x, t.y, t.w, t.h); ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(t.type === "key" ? "🔑" : "⚔️", t.x + t.w / 2, t.y + t.h - 2); }
    for (const e of enemies) { if (!e.alive) continue; ctx.fillStyle = "#8e44ad"; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.fillStyle = "#e74c3c"; ctx.fillRect(e.x + 4, e.y + 2, 4, 4); ctx.fillRect(e.x + e.w - 8, e.y + 2, 4, 4); ctx.fillStyle = "#1a1a1a"; ctx.fillRect(e.x, e.y - 8, e.w, 4); ctx.fillStyle = e.hp > 10 ? "#2ecc71" : "#e74c3c"; ctx.fillRect(e.x, e.y - 8, e.w * (e.hp / 20), 4); }
    ctx.fillStyle = "#2ecc71"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#f5e6c8"; ctx.fillRect(p.x + 6, p.y + 6, 6, 6); ctx.fillRect(p.x + p.w - 12, p.y + 6, 6, 6);
    if (hasSword && atkAnim > 0) { ctx.fillStyle = "#3498db"; ctx.fillRect(p.x + p.w, p.y - 10, 30, 4); ctx.fillRect(p.x + p.w + 10, p.y - 14, 4, 12); }
    else if (hasSword) { ctx.fillStyle = "#3498db"; ctx.fillRect(p.x - 20, p.y + 10, 20, 4); ctx.fillRect(p.x - 10, p.y + 6, 4, 12); }
    for (const pa of particles) { const a = pa.life / pa.maxLife; ctx.globalAlpha = a; ctx.fillStyle = pa.color || "#f1c40f"; ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size * a, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left"; ctx.fillText("❤️ " + p.hp, 20, 30); ctx.fillText("🔑 " + keysCollected + "/" + totalKeys, 100, 30);
    ctx.fillStyle = "rgba(46,204,113,0.2)"; ctx.beginPath(); ctx.arc(780, 50, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2ecc71"; ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🚪", 780, 56);
    endOverlay(ctx, gameOver, win);
  };
  const handleRestart = () => { if (keys["r"] || keys["R"]) { reset(); return true; } return false; };
  return { update, draw, handleRestart, reset, name: "Key Quest — collect 5 keys & the sword!" };
}

function createRacing(keys) {
  let p = { x: 350, y: 400, w: 40, h: 60 };
  let obstacles = [], score = 0, gameOver = false, speed = 3, lane = 1, roadOffset = 0, timer = 0;
  const reset = () => { p.x = 350; obstacles = []; score = 0; speed = 3; lane = 1; gameOver = false; timer = 0; roadOffset = 0; };
  reset();
  const update = () => {
    if (gameOver) return;
    timer++;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) { if (lane > 0) lane--; keys["ArrowLeft"] = keys["a"] = keys["A"] = false; }
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) { if (lane < 2) lane++; keys["ArrowRight"] = keys["d"] = keys["D"] = false; }
    p.x = 300 + lane * 100;
    speed = Math.min(10, 3 + score * 0.02);
    roadOffset = (roadOffset + speed) % 80;
    if (timer % Math.max(30, 120 - score) === 0) {
      const l = Math.floor(Math.random() * 3);
      obstacles.push({ x: 300 + l * 100, y: -40, w: 36, h: 50, color: ["#e74c3c", "#3498db", "#f1c40f", "#8e44ad", "#2ecc71"][Math.floor(Math.random() * 5)] });
    }
    for (let i = obstacles.length - 1; i >= 0; i--) { obstacles[i].y += speed; if (obstacles[i].y > H + 50) { obstacles.splice(i, 1); score++; } }
    for (const o of obstacles) { if (p.x + p.w > o.x && p.x < o.x + o.w && p.y + p.h > o.y && p.y < o.y + o.h) gameOver = true; }
  };
  const draw = (ctx) => {
    ctx.fillStyle = "#1a3a1a"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(250, 0, 300, H);
    ctx.fillStyle = "#f5e6c8"; for (let i = -80; i < H + 80; i += 80) { const y = (i + roadOffset) % H; ctx.fillRect(390, y, 20, 40); }
    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(250, 0, 4, H); ctx.fillRect(546, 0, 4, H);
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "left"; ctx.fillText("🏎️ " + score, 20, 40);
    for (const o of obstacles) { ctx.fillStyle = o.color; ctx.shadowColor = o.color; ctx.shadowBlur = 15; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.shadowBlur = 0; ctx.fillStyle = "#2c3e50"; ctx.fillRect(o.x + 4, o.y + 4, 6, 6); ctx.fillRect(o.x + o.w - 10, o.y + 4, 6, 6); }
    ctx.shadowColor = "#e74c3c"; ctx.shadowBlur = 25; ctx.fillStyle = "#e74c3c"; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.shadowBlur = 0;
    ctx.fillStyle = "#3498db"; ctx.fillRect(p.x + 6, p.y + 6, 28, 12);
    ctx.fillStyle = "#f1c40f"; ctx.fillRect(p.x + 4, p.y + p.h - 6, 8, 4); ctx.fillRect(p.x + p.w - 12, p.y + p.h - 6, 8, 4);
    if (gameOver) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#e74c3c"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center"; ctx.fillText("💥 CRASH!", W / 2, H / 2 - 20); ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.fillText("Score: " + score + "  |  Press R to restart", W / 2, H / 2 + 40); }
  };
  const handleRestart = () => { if (keys["r"] || keys["R"]) { reset(); return true; } return false; };
  return { update, draw, handleRestart, reset, name: "Turbo Racer — dodge the traffic!" };
}

function endOverlay(ctx, gameOver, win) {
  if (gameOver) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#e74c3c"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center"; ctx.fillText("💀 GAME OVER", W / 2, H / 2 - 20); ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.fillText("Press R to restart", W / 2, H / 2 + 40); }
  if (win) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#f1c40f"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏆 YOU WIN!", W / 2, H / 2 - 20); ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.fillText("Press R to restart", W / 2, H / 2 + 40); }
}

const ENGINES = { mario: createRunner, runner: createRunner, fighter: createFighter, adventure: createAdventure, racing: createRacing };

export default function NativeCanvasGame({ engine }) {
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    const factory = ENGINES[engine] || createRunner;
    const game = factory(keysRef.current);

    const onKeyDown = (e) => {
      keysRef.current[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const loop = () => { game.handleRestart(); game.update(); game.draw(ctx); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [engine]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black p-2">
      <canvas ref={canvasRef} className="max-w-full max-h-full rounded-lg" style={{ aspectRatio: "800 / 500" }} />
      <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-black/60 px-2 py-1 rounded-full whitespace-nowrap">
        ← → / A D move · ↑ / Space / W jump · R restart
      </p>
    </div>
  );
}