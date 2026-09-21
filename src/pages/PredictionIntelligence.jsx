import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { syncGlobalEngine, fetchAll } from "@/lib/globalLearning/ledger";
import { refreshInsights } from "@/lib/globalLearning/insights";
import { ledgerStatus, safeRows } from "@/lib/globalLearning/pageState";
import { canonicalizeRows } from "@/lib/globalLearning/canonicalProjection";
import {
  readIntelCache,
  writeIntelCache,
  slimRow,
  markersFromRows,
  probeLedgerMarkers,
  markersUnchanged,
} from "@/lib/globalLearning/intelCache";
import ImportSection from "@/components/intelligence/ImportSection";
import GlobalPerformanceSection from "@/components/intelligence/GlobalPerformanceSection";
import GlobalCalibrationSection from "@/components/intelligence/GlobalCalibrationSection";
import ModelVsMarketSection from "@/components/intelligence/ModelVsMarketSection";
import LearnedSection from "@/components/intelligence/LearnedSection";
import QueueSection from "@/components/intelligence/QueueSection";
import ComparisonSection from "@/components/intelligence/ComparisonSection";
import ChangelogSection from "@/components/intelligence/ChangelogSection";
import VerificationSection from "@/components/intelligence/VerificationSection";
import EngineStatusFeed from "@/components/intelligence/EngineStatusFeed";
import ConflictResolutionDashboard from "@/components/intelligence/ConflictResolutionDashboard";
import ArchiveReport from "@/components/intelligence/ArchiveReport";
import LearningCenterSection from "@/components/intelligence/LearningCenterSection";

// RIDE X PREDICTION INTELLIGENCE — the central learning layer for the ENTIRE
// prediction ecosystem (KALA, WIN RABA, BIG HAMMER, BANKu/MONSTER slips and
// every future prediction section). One brain underneath all prediction tabs:
// each section keeps its own identity and ledger; the global engine ingests
// them, verifies results, settles, analyses wins AND losses, and feeds an
// evidence-gated learning queue. Nothing here changes a production model on a
// single result — promotion only happens through backtest → walk-forward →
// OOS validation.
//
// RENDER CONTRACT (regression-locked in src/__tests__/predictionIntelligencePage.test.js):
// the page NEVER renders blank. Every wait is bounded, a failed read keeps the
// last good data on screen, and the GLOBAL LEDGER status chip is always
// visible: LOADING / READY / SYNCING / PARTIAL — RETRYING / ERROR.
const SECTIONS = [
  ["integrity", "INTEGRITY & CONFLICTS"],
  ["learning", "LEARNING CENTER"],
  ["import", "ANALYZE RESULTS"],
  ["perf", "GLOBAL PERFORMANCE"],
  ["calib", "CALIBRATION"],
  ["market", "MODEL vs MARKET"],
  ["learned", "WHAT RIDE X LEARNED"],
  ["verify", "VERIFICATION"],
  ["queue", "LEARNING QUEUE"],
  ["compare", "MODEL COMPARISON"],
  ["changelog", "MODEL CHANGELOG"],
];
const SETTLED = ["won", "lost", "void", "push", "cancelled"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Bounded waits — a stalled or throttled read can never trap the page in a
// loading or syncing state forever; it falls through to honest states.
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => ({ __timeout: true }))]);

export default function PredictionIntelligence() {
  const [section, setSection] = React.useState("integrity");
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [ledgerError, setLedgerError] = React.useState(false);
  const [bgSync, setBgSync] = React.useState("idle");
  const [rows, setRows] = React.useState([]);
  const [readDiag, setReadDiag] = React.useState(null);
  const [cacheNote, setCacheNote] = React.useState(null);
  const [insights, setInsights] = React.useState([]);
  const [batches, setBatches] = React.useState([]);
  const [changelog, setChangelog] = React.useState([]);
  const [lastSyncAt, setLastSyncAt] = React.useState(() => {
    try { return localStorage.getItem("ridex_intel_last_sync") || null; } catch { return null; }
  });

  // Paged ledger read that REPORTS failure instead of silently returning
  // empty — a throttled read must never wipe the last good data off screen.
  // TIE-SAFE CURSOR PAGING: every page resumes BEFORE the previous page's last
  // created_date, and the boundary tie group is read whole — a repeated
  // first-page read can never silently cap the ledger at the newest 1000 rows
  // (which hid every older settled result from the performance counters).
  // READ DIAGNOSTICS — pages traversed, raw rows scanned and (after the
  // canonical projection) unique canonical rows are reported to the
  // performance card, so a future partial-pagination failure is immediately
  // obvious instead of silently producing a plausible-looking number.
  const readLedger = async () => {
    const out = [];
    let cursor = null;
    let pages = 0;
    let capped = false;
    for (let i = 0; i < 5; i++) {
      if (i) await sleep(400); // pace reads — burst reads trip the platform's traffic limit
      const page = await base44.entities.GlobalPredictionLedger.filter(cursor ? { created_date: { $lt: cursor } } : {}, "-created_date", 1000);
      pages++;
      if (!page?.length) break;
      out.push(...page);
      if (page.length < 1000) break;
      if (i === 4) { capped = true; break; } // read window exhausted while more rows remain
      const tail = page[page.length - 1].created_date;
      // bulk-created rows can share one created_date — read the whole tie
      // group so rows beyond the page cut on the boundary date are not lost
      const tie = await base44.entities.GlobalPredictionLedger.filter({ created_date: { $eq: tail } }, "created_date", 5000);
      pages++;
      out.push(...(tie || []));
      cursor = tail;
    }
    return { rows: out, pages, capped };
  };

  // Server-assisted fallback — when the client read trips the app-wide read
  // quota (the hub's own background sync keeps it hot), the admin-gated
  // server function re-reads the ledger server-side and waits out the quota
  // window, so the dashboard shows real data instead of the ERROR chip.
  const readLedgerFallback = async () => {
    const res = await base44.functions.invoke("ledger-dashboard-read", {});
    const rows = res?.data?.rows;
    if (!Array.isArray(rows)) throw new Error("fallback returned no rows");
    return { rows, pages: res?.data?.pages, capped: !!res?.data?.capped };
  };

  // Loads the current global state. A fulfilled read REPLACES the state; a
  // rejected read KEEPS the previous values — the last valid ledger always
  // stays visible when a later read fails, and a throttled ledger read gets
  // one server-assisted retry before the ERROR chip is shown.
  const loadState = async () => {
    const [ledger, ins, bat, log] = await Promise.allSettled([
      readLedger(),
      base44.entities.GlobalLearningInsight.filter({}, "-updated_at", 200),
      base44.entities.ResultImportBatch.filter({}, "-imported_at", 100),
      base44.entities.ModelChangelog.filter({}, "-changed_at", 100),
    ]);
    let ledgerOk = ledger.status === "fulfilled";
    let ledgerRows = ledgerOk ? ledger.value.rows : null;
    let diag = ledgerOk ? { pages: ledger.value.pages, capped: ledger.value.capped, source: "browser" } : null;
    if (!ledgerOk) {
      const fb = await withTimeout(readLedgerFallback(), 90000).catch(() => null);
      if (fb && Array.isArray(fb.rows)) {
        ledgerRows = fb.rows;
        diag = { pages: fb.pages, capped: fb.capped, source: "server-fallback" };
        ledgerOk = true;
      }
    }
    // Canonical projection BEFORE any consumer counts: performance, calibration,
    // model comparison and learning evidence all see ONE row per prediction
    // identity — duplicate ledger copies can never inflate them.
    const insRows = ins.status === "fulfilled" ? safeRows(ins.value) : null;
    const batRows = bat.status === "fulfilled" ? safeRows(bat.value) : null;
    const logRows = log.status === "fulfilled" ? safeRows(log.value) : null;
    if (ledgerOk) {
      const raw = safeRows(ledgerRows);
      const canonical = canonicalizeRows(raw);
      const diagOut = { ...(diag || {}), raw: raw.length, canonical: canonical.length };
      setRows(canonical);
      setReadDiag(diagOut);
      // SNAPSHOT — persist the canonical projection + change markers so the
      // next open renders instantly and the two-row marker probe can skip the
      // ledger traversal entirely when nothing changed. A failed side read
      // keeps the previous cached collection (nothing is silently emptied).
      const prev = readIntelCache();
      const saved = writeIntelCache({
        markers: markersFromRows(raw),
        readDiag: diagOut,
        rows: canonical.map(slimRow),
        insights: insRows || (prev?.insights ?? []),
        batches: batRows || (prev?.batches ?? []),
        changelog: logRows || (prev?.changelog ?? []),
      });
      if (saved) setCacheNote(new Date().toISOString());
    }
    setLedgerError(!ledgerOk);
    if (insRows) setInsights(insRows);
    if (batRows) setBatches(batRows);
    if (logRows) setChangelog(logRows);
    return ledgerOk;
  };

  // DEEP SYNC — ingest every section ledger into the global ledger and refresh
  // the learning queue, in the background, always bounded. The engine is
  // idempotent, so a throttled or retried sync never duplicates anything and
  // the dashboard keeps showing the last retained data while it runs.
  const deepSync = async () => {
    setBgSync("syncing");
    try {
      await withTimeout(syncGlobalEngine(), 120000);
      const all = await withTimeout(fetchAll("GlobalPredictionLedger", "-created_date"), 60000);
      const settled = safeRows(all).filter((r) => SETTLED.includes(r.status));
      await withTimeout(refreshInsights(settled), 60000);
      await loadState();
      const t = new Date().toISOString();
      try { localStorage.setItem("ridex_intel_last_sync", t); } catch { /* storage unavailable */ }
      setLastSyncAt(t);
      setBgSync("done");
    } catch {
      setBgSync("failed"); // last retained data stays visible — the status chip shows PARTIAL
    }
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      // CACHE-FIRST OPEN — the stored canonical snapshot renders INSTANTLY
      // (zero ledger reads), then a two-row change-marker probe decides what
      // happens next:
      //   · markers unchanged → NO ledger traversal this open at all
      //   · markers changed   → ONE paced, batched background recount that
      //     saves the new snapshot — last-good stays visible while it runs
      //   · probe throttled   → PARTIAL — LAST DATA RETAINED, never blank;
      //     the explicit "Sync all sections" button forces the full chain
      // The heavy cross-section ingestion (deepSync) still runs ONLY on that
      // explicit button — the engine is idempotent, so nothing ever duplicates.
      const cache = readIntelCache();
      if (cache && cache.rows.length) {
        setRows(cache.rows);
        setReadDiag(cache.readDiag || null);
        if (Array.isArray(cache.insights)) setInsights(cache.insights);
        if (Array.isArray(cache.batches)) setBatches(cache.batches);
        if (Array.isArray(cache.changelog)) setChangelog(cache.changelog);
        setCacheNote(cache.savedAt || "");
        setInitialLoading(false); // cached numbers are on screen immediately
      }
      let markers = null;
      try {
        markers = await withTimeout(probeLedgerMarkers(), 15000);
      } catch {
        markers = null; // probe throttled/failed — freshness unknown
      }
      if (!alive) return;
      if (cache && cache.rows.length) {
        if (markers && markersUnchanged(cache.markers, markers)) {
          setBgSync("done"); // snapshot verified fresh — zero heavy reads this open
          return;
        }
        if (!markers) {
          setBgSync("failed"); // PARTIAL — the last-good snapshot stays on screen
          return;
        }
        setBgSync("syncing"); // stale snapshot — one paced background recount
      } else {
        setBgSync("syncing"); // first visit in this browser — build the snapshot
      }
      const ok = await withTimeout(loadState(), 120000);
      if (!alive) return;
      setInitialLoading(false);
      setBgSync(ok ? "done" : cache && cache.rows.length ? "failed" : "idle");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = ledgerStatus({ initialLoading, ledgerError, rowsCount: rows.length, bgSync });
  const showLoading = initialLoading && rows.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X · PREDICTION INTELLIGENCE"
        title="Global Learning Engine"
        subtitle="One brain underneath every RIDE X prediction tab. Results are verified, settled and analysed across ALL sections; lessons become validated knowledge only after backtest, walk-forward and out-of-sample evidence — never from a single win or loss."
        action={
          <Button variant="outline" className="rounded-full" onClick={() => deepSync()} disabled={bgSync === "syncing"}>
            {bgSync === "syncing" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync all sections
          </Button>
        }
      />

      {/* GLOBAL LEDGER STATUS — always visible, never blank */}
      <div className={`flex items-center gap-2 text-[11px] font-extrabold ${status.tone}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
        <span className="whitespace-nowrap">GLOBAL LEDGER — {status.label}</span>
        <span className="font-normal text-muted-foreground min-w-0">{status.note}</span>
      </div>

      {/* SNAPSHOT note — shown whenever the cached projection is on screen */}
      {cacheNote && !showLoading && (
        <p className="text-[10px] text-muted-foreground -mt-2">
          CACHED SNAPSHOT · saved{" "}
          {new Date(cacheNote).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {" "}WAT · change markers verify freshness — a full ledger scan runs only when the data actually changed.
        </p>
      )}

      {/* ENGINE STATUS FEED — last successful sync + active validation alerts */}
      <div className="mt-3">
        <EngineStatusFeed
          lastSyncAt={lastSyncAt}
          bgSync={bgSync}
          ledgerError={ledgerError}
          insights={insights}
          batches={batches}
          changelog={changelog}
        />
      </div>

      {/* Sticky section navigation */}
      <div className="sticky top-[7.5rem] lg:top-16 z-40 -mx-1 px-1 py-2 bg-background/95 backdrop-blur-sm">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-pl-1">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`rounded-full px-3.5 py-2 text-[11px] font-bold whitespace-nowrap min-h-[36px] inline-flex items-center transition-colors ${
                section === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {showLoading ? (
          <div className="rounded-3xl border border-border/60 bg-card/70 p-10 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
            <p className="text-sm font-bold">LOADING PREDICTION INTELLIGENCE…</p>
            <p className="text-xs text-muted-foreground">
              Reading the global prediction ledger from every section. A throttled or stalled read falls back to honest empty states within seconds — never a blank page.
            </p>
          </div>
        ) : (
          <>
            {section === "integrity" && (
              <>
                <ConflictResolutionDashboard bgSync={bgSync} />
                <ArchiveReport />
              </>
            )}
            {section === "learning" && <LearningCenterSection />}
            {section === "import" && <ImportSection batches={batches} onDone={loadState} />}
            {section === "perf" && <GlobalPerformanceSection rows={rows} readDiag={readDiag} />}
            {section === "calib" && <GlobalCalibrationSection rows={rows} />}
            {section === "market" && <ModelVsMarketSection rows={rows} />}
            {section === "learned" && <LearnedSection insights={insights} rows={rows} />}
            {section === "queue" && <QueueSection insights={insights} />}
            {section === "verify" && <VerificationSection />}
            {section === "compare" && <ComparisonSection rows={rows} />}
            {section === "changelog" && <ChangelogSection changelog={changelog} />}
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-6">
        RIDE X learns from every result but never changes itself because of one result. Findings become hypotheses, hypotheses pass backtests and walk-forward tests, and only out-of-sample validated improvements can reach production. No guaranteed wins, ever — better calibration and better rejection are the goal.
      </p>
    </div>
  );
}