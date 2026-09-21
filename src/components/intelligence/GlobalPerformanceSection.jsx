import React from "react";
import { ExternalLink, FileSpreadsheet, Globe2, Loader2 } from "lucide-react";
import { SectionCard, Stat, EmptyState } from "@/components/kala/Bits";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { summaryOf, sectionComparison, groupBy, isGraded } from "@/lib/globalLearning/analysis";
import { marketFamilyOf } from "@/lib/globalLearning/globalId";

const r1 = (x) => (x == null ? "—" : x);

export default function GlobalPerformanceSection({ rows, readDiag }) {
  const [pushState, setPushState] = React.useState("idle"); // idle | pushing | done | error
  const [sheetUrl, setSheetUrl] = React.useState(null);
  const pushReport = async () => {
    setPushState("pushing");
    try {
      const res = await base44.functions.invoke("performance-sheet-report", {});
      setSheetUrl(res?.data?.url || null);
      setPushState("done");
    } catch {
      setPushState("error");
    }
  };
  const all = rows || [];
  if (!all.length) {
    return <EmptyState>No predictions have been ingested into the global ledger yet — tap Sync all sections after the next KALA or WIN RABA scan.</EmptyState>;
  }
  const totals = summaryOf(all);
  const sections = sectionComparison(all);
  const graded = all.filter((r) => isGraded(r.status));
  const qualified = graded.filter((r) => r.qualified);
  const rejected = graded.filter((r) => !r.qualified);
  const qWin = qualified.length ? Math.round((qualified.filter((r) => r.status === "won").length / qualified.length) * 1000) / 10 : null;
  const rWin = rejected.length ? Math.round((rejected.filter((r) => r.status === "won").length / rejected.length) * 1000) / 10 : null;
  const openCount = all.filter((r) => r.status === "open").length;
  const qualifiedCount = all.filter((r) => r.qualified).length;
  const rejectedCount = all.length - qualifiedCount;
  const unverifiedCount = all.filter((r) => r.verification === "user_supplied").length;
  const bigHammer = all.filter((r) => r.big_hammer);
  const bigHammerSettled = summaryOf(bigHammer).settled;
  const paperVal = totals.paper ? totals.paper.roiPct + "%" : "—";
  const paperHint = totals.paper ? totals.paper.n + " priced graded picks" : "no priced graded picks yet";
  const byMarket = Object.entries(groupBy(graded, (r) => marketFamilyOf(r.market_key))).map(([m, list]) => ({
    market: m,
    n: list.length,
    winRate: summaryOf(list).winRate,
    brier: summaryOf(list).brier,
  }));

  return (
    <SectionCard
      title="GLOBAL PERFORMANCE — EVERY SECTION, ONE LEDGER"
      icon={<Globe2 className="w-4 h-4 text-primary" />}
      sub="Every prediction from every RIDE X prediction surface, graded from real results. Qualified picks and rejected research candidates are counted separately — the engine learns from its rejections too."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="TOTAL PREDICTIONS" value={all.length} hint={openCount + " open · " + totals.settled + " settled"} />
        <Stat label="QUALIFIED PREDICTIONS" value={qualifiedCount} hint={rejectedCount + " rejected candidates (research)"} />
        <Stat label="WON / LOST" value={totals.won + " / " + totals.lost} hint={totals.void + " void/push — count toward nothing"} />
        <Stat label="UNVERIFIED" value={unverifiedCount} hint="settled from user results only" />
        <Stat label="BRIER" value={r1(totals.brier)} hint="lower is better — across ALL sections" />
        <Stat label="LOG LOSS" value={r1(totals.logloss)} />
        <Stat label="WIN RATE" value={totals.winRate != null ? totals.winRate + "%" : "—"} />
        <Stat label="PAPER ROI" value={paperVal} hint={paperHint} />
        <Stat label="CLV" value={totals.clv != null ? totals.clv + "%" : "NOT AVAILABLE"} hint="needs T0 + verified closing price" />
        <Stat label="BIG HAMMER" value={bigHammer.length} hint={bigHammerSettled + " settled at 3.00+"} />
      </div>

      {/* READ DIAGNOSTICS — pages/batches traversed and raw vs canonical row
          counts, so a partial-pagination failure is immediately obvious
          instead of silently producing a plausible-looking total. */}
      {readDiag && (
        <p className={`text-[10px] leading-relaxed ${readDiag.capped ? "text-amber-300 font-bold" : "text-muted-foreground"}`}>
          READ DIAGNOSTICS — {readDiag.canonical} unique canonical rows · {readDiag.raw} raw ledger rows scanned · {readDiag.pages ?? "?"}{" "}
          read pages/batches traversed{readDiag.source === "server-fallback" ? " · server fallback" : ""}
          {readDiag.raw > readDiag.canonical ? ` · ${readDiag.raw - readDiag.canonical} duplicate copies excluded` : ""}
          {readDiag.capped
            ? " — PAGE CAP REACHED: the ledger exceeds the read window, the totals above may be partial."
            : " — full ledger traversal."}
        </p>
      )}

      {/* GOOGLE SHEETS REPORT — push this snapshot outside the dashboard for review */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full h-8 px-3 text-[11px] font-bold"
          onClick={pushReport}
          disabled={pushState === "pushing"}
        >
          {pushState === "pushing" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />}
          {pushState === "pushing" ? "PUSHING REPORT…" : "PUSH REPORT TO GOOGLE SHEETS"}
        </Button>
        {pushState === "done" && sheetUrl && (
          <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-300">
            <ExternalLink className="w-3.5 h-3.5" /> OPEN REPORT SHEET
          </a>
        )}
        {pushState === "done" && !sheetUrl && <p className="text-[10px] text-muted-foreground">Report pushed — open the Google Sheet from your Drive.</p>}
        {pushState === "error" && <p className="text-[10px] font-bold text-rose-300">Push failed — try again shortly. Nothing on the sheet was changed.</p>}
        {pushState === "idle" && <p className="text-[10px] text-muted-foreground">Creates/reuses one Google Sheet and overwrites it with the latest snapshot — no duplicate spreadsheets.</p>}
      </div>

      <div>
        <p className="text-[11px] font-extrabold text-muted-foreground mb-1.5">PREDICTION SECTION PERFORMANCE — never ranked by win rate alone</p>
        <div className="rounded-2xl border border-border/50 overflow-x-auto">
          <div className="grid grid-cols-8 gap-1 px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground bg-secondary/60 min-w-[560px]">
            <span className="col-span-2">SECTION</span><span>N</span><span>SETTLED</span><span>BRIER</span><span>LOG LOSS</span><span>WIN %</span><span>CAL ERR</span>
          </div>
          {sections.map((s) => (
            <div key={s.section} className="grid grid-cols-8 gap-1 px-3 py-1.5 text-[11px] border-t border-border/30 min-w-[560px]">
              <span className="col-span-2 font-bold truncate">{s.section}</span>
              <span>{s.n}</span>
              <span>{s.settled}</span>
              <span>{r1(s.brier)}</span>
              <span>{r1(s.logloss)}</span>
              <span>{r1(s.winRate)}</span>
              <span className={s.calErr != null && Math.abs(s.calErr) >= 8 ? "text-amber-300 font-bold" : ""}>{r1(s.calErr)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
          <p className="text-[11px] font-extrabold mb-2">REJECTION LEARNING — do the gates protect?</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="QUALIFIED WIN RATE" value={qWin != null ? qWin + "%" : "—"} hint={qualified.length + " graded qualified picks"} tone="text-emerald-300" />
            <Stat label="REJECTED WIN RATE" value={rWin != null ? rWin + "%" : "—"} hint={rejected.length + " graded rejected candidates"} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Gates are judged over large samples only: a rejected candidate that later won is NOT evidence the filter is too strict.</p>
        </div>
        <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3">
          <p className="text-[11px] font-extrabold mb-2">BY MARKET (graded)</p>
          <div className="space-y-1">
            {byMarket.map((m) => (
              <div key={m.market} className="flex items-center justify-between text-[11px]">
                <span className="font-bold capitalize">{m.market}</span>
                <span className="text-muted-foreground">{m.n} settled · win {r1(m.winRate)}% · Brier {r1(m.brier)}</span>
              </div>
            ))}
            {!byMarket.length && <p className="text-[10px] text-muted-foreground">No graded predictions yet.</p>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}