import { base44 } from "@/api/base44Client";

// Fire-and-forget bet & bankroll audit trail — every processed bet result and
// every bankroll adjustment is appended to the owner's Google Sheets audit
// tab (Bet Audit, inside the card-activity spreadsheet). A failed log never
// breaks the betting action behind it.

export function logBetAudit(entry) {
  return base44.functions.invoke("bet-audit-log", { entry }).catch(() => {});
}

// Batch variant — a settlement pass logs every settled leg in ONE call.
// Batches are accepted from admins only (enforced server-side), so parallel
// settlement by other app users never writes duplicate rows to the sheet.
export function logBetAuditBatch(entries) {
  const list = (entries || []).filter((e) => e && e.type);
  if (!list.length) return Promise.resolve({ ok: true, skipped: true });
  return base44.functions.invoke("bet-audit-log", { entries: list }).catch(() => {});
}