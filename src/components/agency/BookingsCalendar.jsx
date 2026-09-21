import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const TONE = {
  confirmed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  completed: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  pending: "border-amber-300/30 bg-amber-400/10 text-amber-300",
  cancelled: "border-border bg-secondary text-muted-foreground line-through",
  disputed: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

// Month calendar of artist bookings with drag-and-drop (and tap-to-move)
// rescheduling. Days with no booking show an availability dot.
export default function BookingsCalendar({ bookings, promotions = [], onMove }) {
  const now = new Date();
  const [cursor, setCursor] = React.useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(null);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = first.getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = (d) => `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
  const forDay = (d) => bookings.filter((b) => (b.event_date || "").slice(0, 10) === dateStr(d));
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const dropOn = (d) => (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || picked;
    setDragOver(null);
    if (id && d) onMove(id, dateStr(d));
    setPicked(null);
  };

  const shift = (n) => setCursor((c) => {
    const dt = new Date(c.y, c.m + n, 1);
    return { y: dt.getFullYear(), m: dt.getMonth() };
  });

  const activePromos = promotions.filter((p) => ["pending", "active"].includes(p.status));

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{first.toLocaleString(undefined, { month: "long", year: "numeric" })}</p>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" className="rounded-full h-8 w-8" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="icon" variant="outline" className="rounded-full h-8 w-8" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => <p key={i} className="text-[10px] text-muted-foreground text-center py-1">{w}</p>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[64px] rounded-lg" />;
          const list = forDay(d);
          const isToday = dateStr(d) === todayStr;
          return (
            <div
              key={i}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={dropOn(d)}
              onClick={() => {
                if (picked) { onMove(picked, dateStr(d)); setPicked(null); }
              }}
              className={cn(
                "min-h-[64px] rounded-lg border p-1",
                dragOver === i ? "border-primary bg-primary/10" : "border-border/40",
                picked && "cursor-pointer",
                isToday && "border-primary/60"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px]", isToday ? "text-primary font-bold" : "text-muted-foreground")}>{d}</span>
                {list.length === 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" title="Available" />}
              </div>
              {list.slice(0, 2).map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", b.id)}
                  onClick={(e) => { e.stopPropagation(); setPicked((p) => (p === b.id ? null : b.id)); }}
                  className={cn(
                    "mt-0.5 truncate text-[9px] leading-tight px-1 py-0.5 rounded border cursor-grab",
                    TONE[b.status] || TONE.pending,
                    picked === b.id && "ring-2 ring-primary"
                  )}
                  title={`${b.artist_name} · ${b.event_type || "booking"} · ${b.status}`}
                >
                  {b.artist_name}
                </div>
              ))}
              {list.length > 2 && <p className="text-[9px] text-muted-foreground mt-0.5">+{list.length - 2} more</p>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {picked ? "Now tap the new date to move this booking." : "Drag a booking to a new date — or tap it, then tap a day. Green dot = available."}
      </p>
      {activePromos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Promotions:</span>
          {activePromos.slice(0, 8).map((p) => (
            <span key={p.id} className="rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5 truncate max-w-[140px]">
              {p.artist_name} · {p.tier}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}