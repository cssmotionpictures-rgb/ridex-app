import React from "react";
import { ShieldCheck, ShieldAlert, Clock, XCircle, Ban } from "lucide-react";

// Visual KYC / financial-compliance status indicator.
//
// HONEST BY DEFAULT: status is read from the user's real kyc_status field.
// No KYC/compliance provider is connected yet, so every user is "unverified"
// until a real Flutterwave KYC check (or approved compliance workflow) sets
// kyc_status = "verified" server-side. This badge never fabricates "verified".
const STATUS = {
  verified: { label: "KYC Verified", icon: ShieldCheck, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  pending: { label: "KYC Pending", icon: Clock, cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  restricted: { label: "KYC Restricted", icon: ShieldAlert, cls: "bg-orange-500/15 text-orange-400 border-orange-500/40" },
  suspended: { label: "KYC Suspended", icon: Ban, cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  rejected: { label: "KYC Rejected", icon: XCircle, cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  unverified: { label: "KYC Not started", icon: ShieldAlert, cls: "bg-secondary text-muted-foreground border-border" },
};

export default function KycStatusBadge({ status, size = "sm" }) {
  const s = STATUS[status] || STATUS.unverified;
  const Icon = s.icon;
  const pad = size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${pad} ${s.cls}`}>
      <Icon className={size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5"} /> {s.label}
    </span>
  );
}