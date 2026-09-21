import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DAY = 86400000;
const dayKeyOf = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

// TREND DATA — one point per Lagos day for the last N days.
//  RESOLVED = resolution records CONFIRMED on that day (any resolution type —
//             a voided dispute is also a closed dispute).
//  PENDING  = disputes that existed but were not yet confirmed on that day
//             (records created before day-end, confirmed later or still open),
//             plus the LIVE open dispute on today only.
export function buildTrendData(records, { days = 30, livePending = 0 } = {}) {
  const out = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = now - i * DAY + DAY; // end of this day (exclusive)
    const key = dayKeyOf(now - i * DAY);
    let resolved = 0;
    let pending = 0;
    for (const r of records || []) {
      const created = r.created_date ? new Date(r.created_date).getTime() : 0;
      if (created >= dayEnd) continue; // did not exist yet on that day
      const confirmed = r.status === "CONFIRMED" && r.confirmed_at ? new Date(r.confirmed_at).getTime() : null;
      if (confirmed != null && confirmed < dayEnd) {
        if (dayKeyOf(confirmed) === key) resolved++;
      } else {
        pending++;
      }
    }
    if (i === 0) pending += livePending;
    out.push({ day: key.slice(5), resolved, pending });
  }
  return out;
}

// DATA ACCURACY TREND — resolved vs pending integrity disputes over the last
// month. A shrinking pending bar and a rising resolved bar mean disputes are
// being closed and data accuracy is improving.
export default function ConflictTrendChart({ records = [], livePending = 0 }) {
  const data = React.useMemo(() => buildTrendData(records, { days: 30, livePending }), [records, livePending]);
  const totalResolved = data.reduce((n, d) => n + d.resolved, 0);
  const nowPending = data[data.length - 1]?.pending || 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-3.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-extrabold">
          DATA ACCURACY — RESOLVED VS PENDING DISPUTES (LAST 30 DAYS)
        </p>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
            {totalResolved} RESOLVED
          </span>
          <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold text-rose-300">
            {nowPending} PENDING
          </span>
        </div>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={4} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="resolved" name="RESOLVED" fill="#f7c948" radius={[3, 3, 0, 0]} />
            <Bar dataKey="pending" name="PENDING" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground">
        A dispute is PENDING from the day it enters review until the day an admin resolution is confirmed. Fewer pending bars over time
        means disputes are being closed and data accuracy is improving — one disputed match never changes production intelligence on its own.
      </p>
    </div>
  );
}