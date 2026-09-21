import React from "react";

// Small shared KALA presentation primitives.

export function Stat({ label, value, hint, tone = "" }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className={`text-xl font-extrabold mt-1 truncate ${tone}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

const GRADE_STYLES = {
  "ULTRA ELITE": "bg-amber-400/15 text-amber-300 border-amber-400/40",
  "ELITE": "bg-amber-400/10 text-amber-200 border-amber-400/30",
  "STRONG": "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  "QUALIFYING": "bg-sky-400/10 text-sky-300 border-sky-400/30",
  "WATCH": "bg-secondary text-muted-foreground border-border",
};
const GRADE_KEYS = ["ULTRA ELITE", "ELITE", "STRONG", "QUALIFYING", "WATCH"];

export const GradeBadge = ({ grade }) => {
  const g = GRADE_KEYS.includes(String(grade || "").toUpperCase())
    ? String(grade).toUpperCase()
    : String(grade || "").toUpperCase().replace(/_/g, " ");
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${GRADE_STYLES[g] || GRADE_STYLES.WATCH}`}>
      {g}
    </span>
  );
};

export const RiskBadge = ({ risk }) => {
  const s = {
    LOW: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
    MEDIUM: "bg-amber-400/10 text-amber-300 border-amber-400/30",
    HIGH: "bg-rose-400/10 text-rose-300 border-rose-400/30",
    EXTREME: "bg-rose-500/20 text-rose-200 border-rose-400/50",
  }[risk] || "bg-secondary text-muted-foreground border-border";
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${s}`}>{risk}</span>;
};

export const DqBadge = ({ dq }) => {
  const s = {
    HIGH: "text-emerald-300",
    MEDIUM: "text-amber-300",
    LOW: "text-rose-300",
  }[dq] || "text-muted-foreground";
  return <span className={`text-[10px] font-bold ${s}`}>DATA QUALITY: {dq || "—"}</span>;
};

export const ResultBadge = ({ status }) => {
  const map = {
    open: ["PENDING", "text-sky-300"],
    won: ["WON", "text-emerald-300"],
    lost: ["LOST", "text-rose-300"],
    void: ["VOID", "text-muted-foreground"],
    cancelled: ["CANCELLED", "text-muted-foreground"],
    superseded: ["UPDATED", "text-amber-300"],
  };
  const [label, cls] = map[status] || [String(status || "—").toUpperCase(), "text-muted-foreground"];
  return <span className={`text-[10px] font-extrabold tracking-wide ${cls}`}>{label}</span>;
};

export const SectionCard = ({ title, icon, sub, children, right }) => (
  <div className="rounded-3xl border border-border/60 bg-card/70 p-4 sm:p-5 space-y-4">
    {(title || right) && (
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <p className="text-sm font-extrabold flex items-center gap-2">{icon}{title}</p>}
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </div>
);

export const EmptyState = ({ children }) => (
  <div className="rounded-2xl border border-border/60 bg-secondary/40 p-6 text-center">
    <p className="text-sm font-bold">{children}</p>
  </div>
);