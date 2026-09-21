import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Truck, Clock, PackageSearch, Hourglass } from "lucide-react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/shared/StatusBadge";
import { money } from "@/lib/pricing";
import ActivityExportButton from "@/components/admin/ActivityExportButton";

// DELIVERY OPS (admin) — daily delivery-volume bar chart plus the live queue
// of pending logistics requests, so operations can be monitored at a glance.

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export default function DeliveryOpsPanel() {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    base44.entities.LogisticsRequest.list("-created_date", 500)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        Loading delivery operations…
      </div>
    );
  }

  // Daily volumes for the last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  const byDay = new Map(days.map((k) => [k, { key: k, count: 0, delivered: 0 }]));
  for (const r of rows) {
    const entry = byDay.get(dayKey(r.created_date));
    if (!entry) continue;
    entry.count++;
    if (r.status === "delivered") entry.delivered++;
  }
  const data = days.map((k) => ({
    ...byDay.get(k),
    label: new Date(`${k}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }),
  }));

  const todayKey = dayKey(new Date());
  const todayCount = byDay.get(todayKey)?.count || 0;
  const pending = rows.filter((r) => r.status === "pending");
  const active = rows.filter((r) => ["driver_assigned", "pickup", "in_transit", "arriving_soon"].includes(r.status));

  const stat = (Icon, label, value) => (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-none mt-0.5">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat(Truck, "Today's volume", todayCount)}
        {stat(Hourglass, "Pending requests", pending.length)}
        {stat(PackageSearch, "Out for delivery", active.length)}
        {stat(Clock, "Last 14 days", rows.filter((r) => byDay.has(dayKey(r.created_date))).length)}
      </div>

      <div className="flex justify-end">
        <ActivityExportButton />
      </div>

      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Daily delivery volume — last 14 days</p>
            <p className="text-[10px] text-muted-foreground">All logistics requests created per day.</p>
          </div>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={18} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v, _n, p) => [`${v} requests · ${p?.payload?.delivered || 0} delivered`, "Volume"]}
              />
              <Bar dataKey="count" name="Volume" fill="#f7c948" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold">Pending logistics requests</p>
          <StatusBadge status="pending" />
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests — the queue is clear.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="rounded-xl bg-secondary/60 p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-xs font-mono text-primary">{r.tracking_number || "—"}</p>
                  <p className="text-sm truncate">{r.pickup_address} → {r.delivery_address}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.delivery_speed || "standard"} · {r.weight_kg ? `${r.weight_kg} kg · ` : ""}
                    {new Date(r.created_date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{money(r.amount || 0)}</span>
                  <StatusBadge status={r.payment_status === "paid" ? "paid" : "unpaid"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}