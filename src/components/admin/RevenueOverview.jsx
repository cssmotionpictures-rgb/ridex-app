import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { money } from "@/lib/pricing";

function Card({ title, value, hint }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-3xl font-extrabold mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function RevenueOverview({ ads, txs }) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { weekday: "short" }), revenue: 0 });
  }
  const byKey = Object.fromEntries(days.map((x) => [x.key, x]));
  ads.forEach((a) => {
    const k = new Date(a.created_date).toISOString().slice(0, 10);
    if (byKey[k]) byKey[k].revenue += a.revenue || 0;
  });

  const totalAd = ads.reduce((s, a) => s + (a.revenue || 0), 0);
  const paid = txs.filter((t) => t.status === "paid");
  const ngn = paid.filter((t) => t.currency === "NGN");
  const usd = paid.filter((t) => t.currency !== "NGN");
  const paystackNGN = ngn.reduce((s, t) => s + (t.amount || 0), 0);
  const paystackUSD = usd.reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Total ad revenue" value={money(totalAd)} hint="Settles via Paystack" />
        <Card title="Paystack earnings (NGN)" value={money(paystackNGN, "NGN")} hint={`${ngn.length} paid payments`} />
        <Card title="Paystack earnings (USD)" value={money(paystackUSD, "USD")} hint={`${usd.length} paid payments`} />
      </div>
      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <h3 className="font-semibold mb-4">Daily ad revenue · last 7 days</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
                formatter={(v) => money(v)}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}