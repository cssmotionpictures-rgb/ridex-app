import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { money } from "@/lib/pricing";
import { Loader2 } from "lucide-react";

const CATS = [
  { label: "Food & drinks", color: "#f7c948" },
  { label: "Transport", color: "#2bb3c0" },
  { label: "Shopping", color: "#7c8ff5" },
  { label: "Entertainment", color: "#d16ba5" },
  { label: "Bills & airtime", color: "#8fd16b" },
  { label: "Other", color: "#9aa0b0" },
];

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
};

/**
 * Monthly spending trend for every Ride X virtual card, grouped by spending
 * category — one stacked bar per month, from the live card provider's real
 * debit history. Naira and Dollar cards are viewed side by side with the
 * currency toggle.
 */
export default function CardSpendingChart({ summary }) {
  const [cur, setCur] = React.useState("NGN");

  const currencies = summary
    ? [...new Set((summary?.cards || []).map((c) => c.currency || "NGN"))]
    : ["NGN"];
  const activeCur = currencies.includes(cur) ? cur : currencies[0];
  const curCards = (summary?.cards || []).filter((c) => (c.currency || "NGN") === activeCur);

  const rows = summary
    ? summary.months.map((m) => {
        const row = { month: monthLabel(m) };
        for (const cat of CATS) {
          row[cat.label] = curCards.reduce(
            (sum, c) => sum + ((c.categories || {})[cat.label] || {})[m] || 0,
            0
          );
        }
        return row;
      })
    : [];

  const hasAny = curCards.some((c) => Object.keys(c.totals || {}).length);
  const hasBothCurrencies = currencies.length > 1;

  const pill = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setCur(key)}
      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
        activeCur === key
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-heading font-bold text-lg">Monthly spending</h2>
        {summary && hasBothCurrencies && (
          <div className="flex gap-2">
            {pill("NGN", "₦ Naira")}
            {pill("USD", "$ Dollar")}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Where your money goes each month, grouped by category across your {activeCur === "USD" ? "Dollar" : "Naira"} cards.
      </p>

      {!summary && (
        <div className="glass rounded-3xl border border-border/60 h-52 flex items-center justify-center max-w-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {summary && !hasAny && (
        <div className="glass rounded-3xl border border-border/60 p-8 text-center max-w-2xl">
          <p className="text-sm font-medium">No {activeCur === "USD" ? "Dollar" : "Naira"} spending yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Spends on your cards will chart here, grouped by category, as they happen.
          </p>
        </div>
      )}

      {summary && hasAny && (
        <div className="glass rounded-3xl border border-border/60 p-4 md:p-5 max-w-2xl">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8a8f98", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#101018", border: "1px solid #23263a", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#8a8f98" }}
                  formatter={(value, name) => [money(value, activeCur), name]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: "#8a8f98", paddingTop: 6 }}
                />
                {CATS.filter((cat) => rows.some((r) => r[cat.label] > 0)).map((cat) => (
                  <Bar
                    key={cat.label}
                    dataKey={cat.label}
                    stackId="spend"
                    fill={cat.color}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}