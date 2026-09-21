import React from "react";

const TONES = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  red: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  gray: "bg-white/5 text-muted-foreground border-white/10",
};

const MAP = {
  completed: "green", delivered: "green", paid: "green", confirmed: "green", approved: "green", active: "green", published: "green", resolved: "green",
  pending: "amber", searching: "amber", unpaid: "amber", open: "amber", in_progress: "amber", arriving_soon: "amber", arriving: "amber",
  in_transit: "blue", driver_assigned: "blue", pickup: "blue", seated: "blue",
  cancelled: "red", failed: "red", refunded: "red", rejected: "red",
};

export default function StatusBadge({ status }) {
  const tone = TONES[MAP[status] || "gray"];
  return (
    <span className={`inline-flex items-center border px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${tone}`}>
      {String(status || "—").replace(/_/g, " ")}
    </span>
  );
}