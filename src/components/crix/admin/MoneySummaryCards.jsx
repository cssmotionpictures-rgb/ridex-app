import React from "react";
import { formatCrix } from "@/lib/crix";

export default function MoneySummaryCards({ data }) {
  const deps = (data.deposits || []).filter((d) => d.currency === "NGN");
  const credited = deps.filter((d) => d.status === "COMPLETED");
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const todayList = credited.filter((d) => new Date(d.created_date) >= startToday);
  const held = deps.filter((d) => ["REQUESTED", "VALIDATED", "PROCESSING", "UNKNOWN"].includes(d.status)).length;
  const failed = deps.filter((d) => d.status === "FAILED").length;
  const txDone = (data.transactions || []).filter((t) => t.type === "crix_to_crix" && t.status === "COMPLETED");
  const txVol = txDone.filter((t) => t.currency === "NGN").reduce((s, t) => s + (t.amount || 0), 0);

  const cards = [
    { label: "NGN deposits credited", value: formatCrix(credited.reduce((s, d) => s + (d.amount || 0), 0), "NGN"), sub: credited.length + " deposits · recent window" },
    { label: "Credited today", value: formatCrix(todayList.reduce((s, d) => s + (d.amount || 0), 0), "NGN"), sub: todayList.length + " deposits today" },
    { label: "Needs attention", value: String(held + failed), sub: held + " held · " + failed + " failed" },
    { label: "Crix-to-Crix completed", value: txDone.length + " transfers", sub: formatCrix(txVol, "NGN") + " moved · recent window" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-primary">{c.label}</p>
          <p className="text-lg font-extrabold mt-1.5 tabular-nums">{c.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}