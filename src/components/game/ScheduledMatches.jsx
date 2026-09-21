import React, { useState, useEffect } from "react";
import { Calendar, Trash2, Plus, Swords, ChevronLeft, ChevronRight } from "lucide-react";

// Offline match scheduling — stored in localStorage so it works with no
// internet and no backend (credits are exhausted). A planning tool for the
// player to line up upcoming battles, with a synced monthly calendar view.
const STORE_KEY = "ridex_scheduled_matches";
const SCENES = [
  "The Nightmare Village",
  "Lagos Streets",
  "Ancestral Shrine",
  "Crystal Caverns",
  "Burning Market",
  "Modern Arena (Bonus)",
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function save(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); }

export default function ScheduledMatches() {
  const [matches, setMatches] = useState([]);
  const [opponent, setOpponent] = useState("");
  const [scene, setScene] = useState(SCENES[0]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [view, setView] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  useEffect(() => { setMatches(load()); }, []);

  const add = () => {
    if (!opponent.trim() || !date) return;
    const list = [{ id: Date.now().toString(), opponent: opponent.trim(), scene, date, time, created: Date.now() }, ...load()];
    save(list); setMatches(list);
    setOpponent(""); setTime("");
    const [y, m] = date.split("-").map(Number);
    setView({ y, m: m - 1 });
  };

  const remove = (id) => {
    const list = load().filter((m) => m.id !== id);
    save(list); setMatches(list);
  };

  // Monthly calendar grid synced to scheduled matches (dots on match days).
  const first = new Date(view.y, view.m, 1);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const startDow = first.getDay();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const matchByDay = {};
  matches.forEach((m) => {
    const [y, mm, dd] = (m.date || "").split("-").map(Number);
    if (y === view.y && mm - 1 === view.m && dd) matchByDay[dd] = (matchByDay[dd] || 0) + 1;
  });
  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
  const shiftMonth = (dir) => setView((v) => {
    const nm = v.m + dir;
    const y = v.y + Math.floor(nm / 12);
    const m = ((nm % 12) + 12) % 12;
    return { y, m };
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Match Calendar</h3>
      </div>

      <div className="mb-3 rounded-xl bg-background/60 border border-border/40 p-2.5">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shiftMonth(-1)} className="p-1 rounded-lg hover:bg-border/40"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold">{MONTHS[view.m]} {view.y}</span>
          <button onClick={() => shiftMonth(1)} className="p-1 rounded-lg hover:bg-border/40"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {DOW.map((d, i) => <span key={i} className="text-[9px] text-muted-foreground font-bold py-0.5">{d}</span>)}
          {cells.map((d, i) => (
            <div key={i} className={`relative aspect-square flex items-center justify-center rounded-lg text-[11px] ${d ? (isToday(d) ? "bg-primary/20 border border-primary/50 font-bold text-primary" : "text-foreground/80") : ""}`}>
              {d || ""}
              {d && matchByDay[d] ? <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-primary" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent name" className="col-span-2 rounded-lg bg-background border border-border px-3 py-2 text-sm" />
        <select value={scene} onChange={(e) => setScene(e.target.value)} className="rounded-lg bg-background border border-border px-2 py-2 text-sm">
          {SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg bg-background border border-border px-2 py-2 text-sm" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg bg-background border border-border px-2 py-2 text-sm" />
        <button onClick={add} disabled={!opponent.trim() || !date} className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground font-semibold py-2 text-sm disabled:opacity-50">
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </div>
      {matches.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No matches scheduled. Plan your next battle above.</p>
      ) : (
        <div className="space-y-2 max-h-44 overflow-auto">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/60 border border-border/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1"><Swords className="w-3.5 h-3.5 text-primary shrink-0" /> vs {m.opponent}</p>
                <p className="text-[11px] text-muted-foreground">{m.scene} · {m.date}{m.time ? ` · ${m.time}` : ""}</p>
              </div>
              <button onClick={() => remove(m.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}