import React from "react";

const STATUS_STYLES = {
  COMPLETED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40",
  CONFIRMED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40",
  FAILED: "text-red-400 bg-red-500/10 border-red-500/40",
  UNKNOWN: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  PROCESSING: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  PENDING: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  REQUESTED: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  VALIDATED: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  SUBMITTED: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  RESERVED: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  CREATED: "text-slate-400 bg-slate-500/10 border-slate-500/40",
};

export function badgeStyle(status) {
  return STATUS_STYLES[status] || "text-muted-foreground bg-muted border-border";
}

export function StatusBadge({ status }) {
  return (
    <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap " + badgeStyle(status)}>
      {status}
    </span>
  );
}

export function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortAddr(a) {
  if (!a) return "—";
  return a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
}