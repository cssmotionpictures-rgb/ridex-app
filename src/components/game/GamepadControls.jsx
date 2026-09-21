import React, { useState } from "react";
import { Sword, Zap, Shield, FlaskRound } from "lucide-react";

// Full on-screen game controller: left D-pad + right face buttons (A/B/X/Y)
// + L/R shoulders. Both touch and external gamepad drive the same handlers;
// physical pad presses highlight the matching on-screen button via `pressed`.
function PadBtn({ letter, label, icon: Icon, color, onPress, active, disabled }) {
  const [local, setLocal] = useState(false);
  const isOn = active || local;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (!disabled) { setLocal(true); onPress(); } }}
      onPointerUp={() => setLocal(false)}
      onPointerLeave={() => setLocal(false)}
      onPointerCancel={() => setLocal(false)}
      disabled={disabled}
      className={`relative rounded-full flex flex-col items-center justify-center touch-none select-none transition-all shrink-0
        ${isOn ? "btn-noir-primary scale-95" : "bg-[#0c0907] border border-[#c5a059]/35 text-[#d1a985]"}
        ${disabled ? "opacity-40" : ""}`}
      style={{ width: 50, height: 50 }}
    >
      {Icon && <Icon className="w-4 h-4" style={{ color: isOn ? undefined : color }} />}
      <span className="text-[7px] font-semibold leading-none mt-0.5">{label}</span>
      <span className="absolute -top-1.5 -right-1 text-[8px] font-extrabold text-[#8a6d3b] bg-[#040303] rounded px-1 border border-[#c5a059]/30">{letter}</span>
    </button>
  );
}

function Shoulder({ letter, label, onPress, active, disabled }) {
  const [local, setLocal] = useState(false);
  const isOn = active || local;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (!disabled) { setLocal(true); onPress(); } }}
      onPointerUp={() => setLocal(false)}
      onPointerLeave={() => setLocal(false)}
      onPointerCancel={() => setLocal(false)}
      disabled={disabled}
      className={`px-3 py-1 rounded-t-lg text-[8px] font-bold touch-none select-none transition-all
        ${isOn ? "btn-noir-primary" : "bg-[#0c0907] border border-b-0 border-[#c5a059]/35 text-[#8a6d3b]"} ${disabled ? "opacity-40" : ""}`}
    >
      {letter} · {label}
    </button>
  );
}

export default function GamepadControls({ onAttack, onAbility, onDefend, onItem, pressed = {}, disabled, abilityCost, itemsCount }) {
  const p = pressed || {};
  return (
    <div className="flex items-end justify-between gap-2 px-1 select-none">
      {/* Left cluster: D-pad + L shoulder */}
      <div className="flex flex-col items-center gap-1">
        <Shoulder letter="L" label="ITEM" onPress={onItem} active={p.l} disabled={disabled || itemsCount <= 0} />
        <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ width: 162, height: 162 }}>
          <div />
          <PadBtn letter="▲" label="SKILL" icon={Zap} color="#2bb3c0" onPress={onAbility} active={p.up} disabled={disabled} />
          <div />
          <PadBtn letter="◀" label="ITEM" icon={FlaskRound} color="#6dd49a" onPress={onItem} active={p.left} disabled={disabled || itemsCount <= 0} />
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-[#0c0907] border border-[#c5a059]/30" />
          </div>
          <PadBtn letter="▶" label="ATK" icon={Sword} color="#f7c948" onPress={onAttack} active={p.right} disabled={disabled} />
          <div />
          <PadBtn letter="▼" label="DEF" icon={Shield} color="#5ed1da" onPress={onDefend} active={p.down} disabled={disabled} />
          <div />
        </div>
      </div>

      {/* Right cluster: face buttons (A/B/X/Y) + R shoulder */}
      <div className="flex flex-col items-center gap-1">
        <Shoulder letter="R" label="SKILL" onPress={onAbility} active={p.r} disabled={disabled} />
        <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ width: 162, height: 162 }}>
          <div />
          <PadBtn letter="Y" label={`SKILL ${abilityCost ?? ""}`} icon={Zap} color="#2bb3c0" onPress={onAbility} active={p.y} disabled={disabled} />
          <div />
          <PadBtn letter="X" label="ITEM" icon={FlaskRound} color="#6dd49a" onPress={onItem} active={p.x} disabled={disabled || itemsCount <= 0} />
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-[#0c0907] border border-[#c5a059]/30" />
          </div>
          <PadBtn letter="B" label="DEF" icon={Shield} color="#5ed1da" onPress={onDefend} active={p.b} disabled={disabled} />
          <div />
          <PadBtn letter="A" label="ATK" icon={Sword} color="#f7c948" onPress={onAttack} active={p.a} disabled={disabled} />
          <div />
        </div>
      </div>
    </div>
  );
}