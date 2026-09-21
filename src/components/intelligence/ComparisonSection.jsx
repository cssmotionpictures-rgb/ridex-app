import React from "react";
import { Scale } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { modelComparison } from "@/lib/globalLearning/analysis";

const r1 = (x) => (x == null ? "—" : x);

function ModelStats({ label, s, tone }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <p className="text-[11px] font-extrabold">{label}</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Stat label="ROWS" value={s.n} hint={`${s.settled} settled`} />
        <Stat label="BRIER / LOG LOSS" value={`${r1(s.brier)} / ${r1(s.logloss)}`} />
        <Stat label="WIN RATE" value={s.winRate != null ? s.winRate + "%" : "—"} />
        <Stat label="PAPER ROI" value={s.paper ? s.paper.roiPct + "%" : "—"} hint={s.paper ? s.paper.n + " priced" : "no priced picks"} />
      </div>
    </div>
  );
}

export default function ComparisonSection({ rows }) {
  const cmp = modelComparison(rows || []);
  const rx21Injury = (rows || []).filter((r) => r.model_version === "RX-2.1" && r.injury_status === "matched");
  const rx21Lineup = (rows || []).filter((r) => r.model_version === "RX-2.1" && r.lineup_status === "confirmed");

  return (
    <SectionCard
      title="MODEL COMPARISON — CHAMPION vs CHALLENGER"
      icon={<Scale className="w-4 h-4 text-primary" />}
      sub="RX-2.0 stays the untouched control champion; RX-2.1 (injury + lineup intelligence) is the challenger. Both are recorded in parallel on identical candidates. NO superiority is declared until the out-of-sample promotion gate passes on real settled evidence."
    >
      <div className="grid md:grid-cols-2 gap-3">
        <ModelStats label="RX-2.0 — CHAMPION (control, immutable baseline)" s={cmp.champion} tone="border-amber-400/25 bg-amber-400/5" />
        <ModelStats label="RX-2.1 — CHALLENGER (research only, never on boards)" s={cmp.challenger} tone="border-emerald-400/25 bg-emerald-400/5" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="PAIRED ROWS" value={cmp.pairedCommon} hint="identical fixture + market, both versions on record" />
        <Stat label="RX-2.1 INJURY-MATCHED" value={rx21Injury.length} hint="rows with verified injury mapping" />
        <Stat label="RX-2.1 LINEUP-CONFIRMED" value={rx21Lineup.length} hint="confirmed pre-kickoff lineups" />
        <Stat label="PROMOTIONS" value={0} hint="none — insufficient settled evidence" />
      </div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <p className="text-[11px] font-extrabold text-primary">VERDICT — INTEGRATION VERIFIED, SUPERIORITY NOT ESTABLISHED</p>
        <p className="text-[10px] text-muted-foreground">{cmp.verdict}</p>
      </div>
      {!cmp.pairedCommon && <EmptyState>RX-2.0 and RX-2.1 are recorded in parallel on identical candidates — the comparison begins after the first verified results settle.</EmptyState>}
    </SectionCard>
  );
}