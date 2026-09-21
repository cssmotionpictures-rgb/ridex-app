import React from "react";
import {
  ChevronDown, CheckCircle2, XCircle, MinusCircle, ShieldAlert, Database, Activity, Info, Globe,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachRealOdds, oddsKey } from "@/lib/bookmakerOdds";

const probClass = (p) =>
  p >= 0.8 ? "text-emerald-400" : p >= 0.72 ? "text-amber-400" : "text-muted-foreground";

const riskClass = {
  "LOW RISK": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "MEDIUM RISK": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "HIGH RISK": "bg-red-500/15 text-red-400 border-red-500/30",
};

const dqClass = {
  HIGH: "text-emerald-400",
  MEDIUM: "text-amber-400",
  LOW: "text-red-400",
};

function TeamRow({ logo, name }) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {logo ? <img src={logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" /> : null}
      <p className="text-sm font-semibold truncate">{name}</p>
    </div>
  );
}

// One engine pick card — every number on it comes from the model engine.
export default function PredictionCard({ pick, updatedAt }) {
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(false);
  const [realOdds, setRealOdds] = React.useState(undefined); // undefined = not fetched yet
  const pct = Math.round(pick.probability * 100);

  // Lazy real bookmaker odds for the detail popup — REAL vs MODEL always
  // shown separately; if the feed has no price, it says so honestly.
  React.useEffect(() => {
    if (!detail || realOdds) return;
    let live = true;
    const leg = {
      date: pick.dateKey || "",
      home: pick.home,
      away: pick.away,
      league: pick.league,
      marketLabel: pick.marketLabel,
      prob: pick.probability,
    };
    attachRealOdds([leg])
      .then((r) => {
        if (live) setRealOdds(r.map.get(oddsKey(leg)) || null);
      })
      .catch(() => {
        if (live) setRealOdds(null);
      });
    return () => {
      live = false;
    };
  }, [detail]);
  const settled = ["win", "loss", "void", "postponed"].includes(pick.status);

  return (
    <div
      onClick={() => setDetail(true)}
      className="rounded-2xl border border-border/60 bg-card overflow-hidden cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[11px] text-muted-foreground">
        <span className="truncate">{pick.league}</span>
        <span className="shrink-0">{pick.localTime}</span>
      </div>

      <div className="px-4 py-2.5 flex items-center gap-2">
        <TeamRow logo={pick.homeLogo} name={pick.home} />
        <span className="text-[10px] text-muted-foreground shrink-0">VS</span>
        <TeamRow logo={pick.awayLogo} name={pick.away} />
      </div>

      <div className="bg-primary/10 border-y border-primary/25 px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Best pick</p>
          <p className="font-bold text-primary truncate">{pick.marketLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Model confidence</p>
          <p className={`text-2xl font-extrabold ${probClass(pick.probability)}`}>{pct}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 text-[11px] text-muted-foreground">
        <p>Quality score <span className="text-primary font-semibold">{pick.qualityScore}/100</span></p>
        <p>Model consensus <span className="text-foreground font-semibold">{pick.agreementText}</span></p>
        <p>Fair odds <span className="text-foreground font-semibold">{pick.fairOdds?.toFixed(2)}</span></p>
        <p>
          Market odds{" "}
          <span className="text-foreground font-semibold">
            {pick.marketOdds ? pick.marketOdds.toFixed(2) : "—"}
          </span>
        </p>
        <p>
          Value edge{" "}
          <span className={`font-semibold ${pick.valueEdge != null && pick.valueEdge > 0 ? "text-emerald-400" : ""}`}>
            {pick.valueEdge != null ? `${(pick.valueEdge * 100).toFixed(1)}%` : "— (no odds)"}
          </span>
        </p>
        <p>Model scoreline <span className="text-foreground font-semibold">{pick.predictedHome}-{pick.predictedAway}</span></p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${riskClass[pick.risk] || ""}`}>
          <ShieldAlert className="w-3 h-3" /> {pick.risk}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[10px] font-semibold ${dqClass[pick.dataQuality] || ""}`}>
          <Database className="w-3 h-3" /> DATA: {pick.dataQuality}
        </span>
        {pick.sources?.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
            <Globe className="w-3 h-3" /> {pick.sources.join(" · ")}
          </span>
        )}
        {settled && pick.status === "win" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3" /> WIN
            {pick.actualScore ? ` ${pick.actualScore}` : ""}
          </span>
        )}
        {settled && pick.status === "loss" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold">
            <XCircle className="w-3 h-3" /> LOSS
            {pick.actualScore ? ` ${pick.actualScore}` : ""}
          </span>
        )}
        {settled && pick.status === "void" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold">
            <MinusCircle className="w-3 h-3" /> VOID
          </span>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border/60 text-[11px] font-semibold text-primary hover:bg-primary/5"
      >
        <span className="inline-flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> WHY THIS PICK?</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-border/60 bg-secondary/40 space-y-3">
          <div className="space-y-1.5">
            {pick.reasons?.map((r, i) => (
              <p key={i} className="text-[11px] text-foreground/85 flex items-start gap-1.5">
                <Activity className="w-3 h-3 mt-0.5 text-primary shrink-0" /> {r}
              </p>
            ))}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Model consensus</p>
            <div className="space-y-1">
              {pick.models?.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{m.name}</span>
                  <span className="text-foreground font-semibold">{m.pick} · {Math.round(m.prob * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          {pick.flags?.length > 0 && (
            <div className="space-y-1">
              {pick.flags.map((f, i) => (
                <p key={i} className="text-[10px] text-muted-foreground/80">· {f}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {updatedAt && (
        <p className="px-4 py-2 text-[10px] text-muted-foreground/60 border-t border-border/40">
          LAST UPDATED: {updatedAt}
        </p>
      )}

      {/* FULL PREDICTION POPUP — click any card to open the complete
          analysis: H2H where recorded, recent form + reasoning, model
          consensus, and the REAL bookmaker price kept strictly separate
          from model estimates. */}
      <Dialog open={detail} onOpenChange={setDetail}>
        <DialogContent className="rounded-2xl max-w-[92vw] max-h-[85dvh] overflow-y-auto noir-scrollbar">
          <DialogHeader className="text-left">
            <DialogTitle className="text-sm pr-6 leading-snug">{pick.home} vs {pick.away}</DialogTitle>
            <DialogDescription className="text-[10px]">{[pick.league, pick.localTime, pick.dateKey].filter(Boolean).join(" · ")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-wider font-bold text-primary">Main pick — model confidence</p>
                <p className="font-bold text-primary truncate text-[12px]">{pick.marketLabel}</p>
              </div>
              <p className={`font-heading font-extrabold text-lg shrink-0 ${probClass(pick.probability)}`}>{pct}%</p>
            </div>

            {realOdds && !realOdds.status ? (
              <div className="rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-primary">Real bookmaker odds</p>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">VERIFIED FEED</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground truncate">
                    {realOdds.bookmaker} · {realOdds.timestamp ? new Date(realOdds.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  <p className="font-heading font-extrabold text-primary text-lg leading-none">{realOdds.price.toFixed(2)}</p>
                </div>
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  Bookmaker implied {Math.round((realOdds.implied || 0) * 100)}% · MODEL probability {pct}% · model fair odds {pick.fairOdds?.toFixed(2)} · EV {realOdds.evPct >= 0 ? "+" : ""}{realOdds.evPct}%
                  {realOdds.books ? ` · best of ${realOdds.books} books (never averaged)` : ""}
                </p>
              </div>
            ) : realOdds === null ? (
              <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-0.5">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Bookmaker odds unavailable</p>
                <p className="text-[10px] text-muted-foreground">
                  No fresh real price in the feed for this pick — the model estimate below is NOT a bookmaker price.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Fetching the real bookmaker price…</p>
              </div>
            )}

            <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-[11px] space-y-1 text-muted-foreground">
              <p className="text-[9px] uppercase tracking-wider font-bold">Head-to-head</p>
              <p className="text-foreground font-semibold text-[11px]">
                {pick.h2h || "Not on record for this fixture in the connected feeds — never invented."}
              </p>
              <p className="text-[9px] text-muted-foreground/70">Model scoreline {pick.predictedHome}-{pick.predictedAway} · quality {pick.qualityScore}/100 · consensus {pick.agreementText}</p>
            </div>

            <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1.5">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Recent form &amp; reasoning — why this pick qualified</p>
              <div className="space-y-1 max-h-40 overflow-y-auto noir-scrollbar">
                {pick.reasons?.map((r, i) => (
                  <p key={i} className="text-[10px] text-foreground/85 leading-relaxed flex items-start gap-1.5">
                    <Activity className="w-3 h-3 mt-0.5 text-primary shrink-0" /> {r}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 space-y-1">
              <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Model consensus</p>
              {pick.models?.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">{m.name}</span>
                  <span className="text-foreground font-semibold">{m.pick} · {Math.round(m.prob * 100)}%</span>
                </div>
              ))}
              {pick.flags?.length > 0 && (
                <div className="pt-1 space-y-0.5">
                  {pick.flags.map((f, i) => (
                    <p key={i} className="text-[9px] text-muted-foreground/80">· {f}</p>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
              FOOTBALL DATA UPDATED: {updatedAt || "—"} · ODDS UPDATED: {realOdds?.timestamp ? new Date(realOdds.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "no real price"}.
              Model probabilities, never guarantees — model numbers and bookmaker numbers are always labeled separately.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}