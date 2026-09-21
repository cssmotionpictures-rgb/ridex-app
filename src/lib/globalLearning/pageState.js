// PREDICTION INTELLIGENCE page-state helpers — pure and regression-locked so
// the page can NEVER render blank: every input combination resolves to an
// explicit, visible state (LOADING / READY / SYNCING / PARTIAL / ERROR), and
// every collection routed into the dashboard is normalized first.
//
// Regression origin: the page once gated all content on the first ledger read
// resolving; under the platform read throttle that read could stall, leaving a
// blank screen. These helpers make the visible state a pure function that is
// unit-tested to never be empty.

// Normalizes anything into an array of plain objects — null/undefined/number
// junk entries are dropped so the analytics and sections can never crash on
// malformed entity rows.
export function safeRows(list) {
  return Array.isArray(list) ? list.filter((r) => r && typeof r === "object") : [];
}

const STATUS = {
  loading: {
    label: "LOADING",
    dot: "bg-primary animate-pulse",
    tone: "text-primary",
    note: "LOADING PREDICTION INTELLIGENCE — reading the global ledger from every section. A throttled read falls back to honest empty states, never a blank page.",
  },
  syncing: {
    label: "SYNCING",
    dot: "bg-sky-400 animate-pulse",
    tone: "text-sky-300",
    note: "Syncing every section into the global ledger in the background — the dashboard already shows everything on record and refreshes when the sync completes.",
  },
  ready: {
    label: "READY",
    dot: "bg-emerald-400",
    tone: "text-emerald-300",
    note: "Global ledger loaded. Open any section below — every number comes from real recorded predictions.",
  },
  partial: {
    label: "PARTIAL — RETRYING",
    dot: "bg-amber-400",
    tone: "text-amber-300",
    note: "Last retained ledger data shown — a later read was throttled. Tap \"Sync all sections\" to retry; the engine is idempotent, nothing is lost and nothing duplicates.",
  },
  error: {
    label: "ERROR — LAST DATA RETAINED",
    dot: "bg-rose-400",
    tone: "text-rose-300",
    note: "The ledger read failed (throttle or connection). Tap \"Sync all sections\" to retry — the empty sections below are honest empty states, not missing data. Nothing is fabricated.",
  },
};

// The GLOBAL LEDGER status chip — pure, total, never undefined.
export function ledgerStatus({ initialLoading, ledgerError, rowsCount, bgSync }) {
  if (initialLoading && !rowsCount) return { key: "loading", ...STATUS.loading };
  if (bgSync === "syncing") return { key: "syncing", ...STATUS.syncing };
  if (bgSync === "failed" || (ledgerError && rowsCount)) return { key: "partial", ...STATUS.partial };
  if (ledgerError) return { key: "error", ...STATUS.error };
  return { key: "ready", ...STATUS.ready };
}