import React from "react";
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Weekly Monday-broadcast delivery trends. broadcast-roster writes one log
// row per dispatch day; this chart shows the trend over time — promoter
// deliveries, individual services-email deliveries, new people discovered by
// live web search, and failures. Open rates aren't measurable on the direct
// Brevo/Resend channel (no tracking pixel), so the chart reports the
// delivery signal the channel does carry.
export default function BroadcastTrendsChart() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    base44.entities.BroadcastLog.list("week_key", 100)
      .then((r) => setRows((r || []).slice().sort((a, b) => String(a.week_key).localeCompare(String(b.week_key)))))
      .catch(() => setRows([]));
  }, []);

  const data = (rows || []).map((r) => ({
    week: String(r.week_key || "").slice(5),
    "Promoters sent": r.promoter_sent || 0,
    "Individuals sent": r.individuals_sent || 0,
    "Failed": (r.promoter_failed || 0) + (r.individuals_failed || 0),
  }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Mail className="w-4 h-4" /></div>
        <div>
          <p className="text-sm font-semibold">Monday Broadcast — Weekly Delivery Trends</p>
          <p className="text-[10px] text-muted-foreground">
            One row per weekly dispatch · promoter blast + individual services email
          </p>
        </div>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading broadcast history…</p>
      ) : !data.length ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No Monday broadcasts logged yet — trends appear here after the next weekly dispatch.
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Promoters sent" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Individuals sent" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Failed" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Open rates aren't trackable on the direct email channel (no read receipts), so delivered vs failed is shown instead.
          </p>
        </>
      )}
    </div>
  );
}