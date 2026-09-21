import React from "react";
import { Ticket } from "lucide-react";
import { SectionCard, EmptyState, Stat, RiskBadge } from "@/components/kala/Bits";
import { Input } from "@/components/ui/input";
import { buildAcca } from "@/lib/winRaba";
import { MONSTER_TARGET } from "@/lib/monsterBoard";

// MONSTER TICKET (13 / CORE / TOP N) — optional. Individual selections remain
// the primary product; the ticket is never described as guaranteed and more
// legs are never framed as more certainty.
const SIZES = [3, 5, 8, 10, 13];

export default function MonsterTicketSection({ board }) {
  const [size, setSize] = React.useState(MONSTER_TARGET);
  const [stake, setStake] = React.useState(1000);
  const n = (board || []).length;
  const sizes = SIZES.filter((s) => s <= n);
  const active = sizes.includes(size) ? size : n;
  const legs = React.useMemo(() => (board || []).slice(0, active), [board, active]);
  const ticket = React.useMemo(() => (legs.length ? buildAcca("monster", legs, stake) : null), [legs, stake]);
  const coreLegs = React.useMemo(() => (board || []).slice(0, Math.min(5, n)), [board, n]);
  const core = React.useMemo(() => (coreLegs.length ? buildAcca("monster-core", coreLegs, stake) : null), [coreLegs, stake]);

  if (!n) {
    return (
      <SectionCard
        title="MONSTER TICKET"
        icon={<Ticket className="w-4 h-4 text-primary" />}
        sub="Optional — individual selections remain the primary product."
      >
        <EmptyState>No qualified MONSTER picks to build a ticket from.</EmptyState>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={active === MONSTER_TARGET ? "MONSTER 13" : `MONSTER TICKET — TOP ${active}`}
        icon={<Ticket className="w-4 h-4 text-primary" />}
        sub="The strongest qualified selections in one ticket — choose how many you want. Optional: individual selections remain the primary product."
        right={
          <div className="flex gap-1.5 flex-wrap justify-end">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  active === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {s === MONSTER_TARGET ? "MONSTER 13" : `TOP ${s}`}
              </button>
            ))}
          </div>
        }
      >
        {ticket && legs.length ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat
                label="COMBINED ODDS"
                value={ticket.combinedOdds}
                hint={ticket.oddsBasis === "real" ? "every leg carries a real price" : "estimated values — never shown as bookmaker prices"}
              />
              <Stat
                label="POTENTIAL RETURN"
                value={`₦${Math.round(ticket.potentialReturn).toLocaleString()}`}
                hint={`from a ₦${stake.toLocaleString()} stake`}
              />
              <Stat label="RISK" value={ticket.riskLevel} />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">STAKE (PAPER)</p>
                <Input
                  type="number"
                  min={100}
                  step={100}
                  value={stake}
                  onChange={(e) => setStake(Math.max(100, Number(e.target.value) || 0))}
                  className="h-9 mt-1 rounded-xl bg-background"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3 space-y-1">
              {legs.map((p, i) => (
                <p key={`${p.fixtureId}-${p.marketKey}`} className="text-[11px] text-muted-foreground truncate">
                  LEG {i + 1}: {p.home} vs {p.away} — {p.marketLabel} @{" "}
                  {(p.marketOdds || 0) > 1 ? p.marketOdds.toFixed(2) : "no real price"}
                </p>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge risk={ticket.riskLevel} />
              {ticket.correlated && (
                <span className="text-[10px] text-amber-300">
                  CORRELATED SELECTIONS — the combined numbers are an approximation.
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              More selections do not make a ticket more certain — every added selection adds risk. PAPER MODE: no
              real bets are placed.
            </p>
          </>
        ) : (
          <EmptyState>Not enough qualified MONSTER picks for this ticket size.</EmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="MONSTER CORE"
        icon={<Ticket className="w-4 h-4 text-primary" />}
        sub="The strongest smaller group — the top five selections."
      >
        {core && coreLegs.length ? (
          <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3 space-y-1">
            {coreLegs.map((p, i) => (
              <p key={`core-${p.fixtureId}-${p.marketKey}`} className="text-[11px] text-muted-foreground truncate">
                {i + 1}. {p.home} vs {p.away} — {p.marketLabel} @{" "}
                {(p.marketOdds || 0) > 1 ? p.marketOdds.toFixed(2) : "no real price"}
              </p>
            ))}
            <p className="text-[10px] text-amber-300 pt-1">
              CORE COMBINED ODDS {core.combinedOdds} · PAPER STAKE ₦{stake.toLocaleString()} → ₦
              {Math.round(core.potentialReturn).toLocaleString()}
            </p>
          </div>
        ) : (
          <EmptyState>No qualified MONSTER picks for the CORE group yet.</EmptyState>
        )}
      </SectionCard>
    </div>
  );
}