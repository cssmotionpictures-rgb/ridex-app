import React from "react";
import { ShieldCheck } from "lucide-react";

export default function VerifiedBadge({ approved, label = "Verified" }) {
  if (!approved) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold">
      <ShieldCheck className="w-3 h-3" /> {label}
    </span>
  );
}