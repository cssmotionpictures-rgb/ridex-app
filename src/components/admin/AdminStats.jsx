import React from "react";
import { money } from "@/lib/pricing";
import { CONTACT } from "@/lib/catalog";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export default function AdminStats({ data }) {
  const { txs = [], ads = [], counts = {} } = data;
  const revenue = txs.filter((t) => t.status === "paid").reduce((s, t) => s + (t.currency === "NGN" ? t.amount / 1550 : t.amount), 0);
  const adRevenue = ads.reduce((s, a) => s + (a.revenue || 0), 0);

  const byService = ["ride", "logistics", "equipment", "carwash", "movie", "subscription"].map((k) => ({
    name: k,
    revenue: Number(
      txs.filter((t) => t.service === k).reduce((s, t) => s + (t.currency === "NGN" ? t.amount / 1550 : t.amount), 0).toFixed(2)
    ),
  }));

  const cards = [
    { label: "Gross revenue", value: money(revenue) },
    { label: "Ad revenue → OPay", value: money(adRevenue) },
    { label: "Transactions", value: txs.length },
    { label: "Rides", value: counts.rides || 0 },
    { label: "Deliveries", value: counts.deliveries || 0 },
    { label: "Movies", value: counts.movies || 0 },
    { label: "Venues", value: counts.venues || 0 },
    { label: "Open tickets", value: counts.tickets || 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-3xl border border-border/60 bg-card p-5">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-extrabold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <p className="font-semibold mb-4">Revenue by service (USD)</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byService}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
              <XAxis dataKey="name" stroke="#8b8b96" fontSize={11} />
              <Tooltip contentStyle={{ background: "#14141a", border: "1px solid #ffffff18", borderRadius: 12 }} />
              <Bar dataKey="revenue" fill="#f7c948" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-3xl border border-primary/25 bg-primary/5 p-6">
        <p className="font-semibold">OPay settlement</p>
        <p className="text-sm text-muted-foreground mt-1">
          Account {CONTACT.opay} · {money(revenue + adRevenue)} settled across service payments and ad revenue.
        </p>
      </div>
    </div>
  );
}