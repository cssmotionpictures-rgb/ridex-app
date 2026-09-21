// CRIXCOIN customer-protection guard layer — SERVER-SIDE ONLY.
// The single shared enforcement point every money-moving backend function
// passes through before any balance, ledger or blockchain movement:
//
//   1. EMERGENCY PAUSE (spec §27) — fail-closed, checked before movement
//   2. APPEND-ONLY AUDIT (spec §40) — immutable CrixAuditEvent trail
//   3. RAIL ROUTING (spec §6 + §38) — the failover decision table; a lost
//      response is UNKNOWN, never a failure, and NEVER a rail switch
//
// The frontend can never disable, bypass or satisfy these guards: it has no
// write access to the pause registry or audit trail (admin RLS), and every
// guard here runs inside server functions with the service role.

export const PAUSE_REGISTRY_KEY = "crix-emergency-pause";

// operation → the emergency-pause switches that govern it (spec §27).
// An operation not listed falls back to PAUSE_ALL.
const OPERATION_SWITCHES: Record<string, string[]> = {
  internal_transfer: ["pause_all"],
  onchain_transfer: ["pause_all", "pause_transfers", "pause_base"],
  solana_settlement: ["pause_all", "pause_transfers", "pause_solana"],
  deposit: ["pause_all", "pause_deposits"],
  withdrawal: ["pause_all", "pause_withdrawals"],
  conversion: ["pause_all", "pause_conversions"],
  bill_payment: ["pause_all", "pause_bills"],
};

export type PauseVerdict = {
  blocked: boolean;
  reason: string;
  switches: string[];
};

// EMERGENCY PAUSE — checked BEFORE any money movement. FAIL-CLOSED (§39):
// if the pause registry cannot be read at all, nothing may move.
export async function assertNotPaused(svc: any, operation: string): Promise<PauseVerdict> {
  const switches = OPERATION_SWITCHES[operation] || ["pause_all"];
  let row = null;
  try {
    const rows = await svc.entities.CrixEmergencyPause.filter({ registry_key: PAUSE_REGISTRY_KEY });
    row = (rows || [])[0] || null;
  } catch (error) {
    row = null;
  }
  if (!row) {
    return { blocked: true, reason: "EMERGENCY_PAUSE_UNVERIFIABLE — the emergency-pause control registry could not be read, so no money movement is permitted until it exists and answers (fail-closed).", switches };
  }
  const tripped = switches.filter((s) => row[s] === true);
  if (tripped.length > 0) {
    return {
      blocked: true,
      reason: "EMERGENCY_PAUSE — " + tripped.join(", ") + " is active. " + (row.reason || "Settlement is halted for customer protection. Nothing moved."),
      switches: tripped,
    };
  }
  return { blocked: false, reason: "", switches: [] };
}

// APPEND-ONLY AUDIT (§40) — every sensitive operation leaves an immutable
// CrixAuditEvent. Corrections are compensating entries, never edits.
// Never contains secrets, private keys or credential values.
export async function appendAudit(svc: any, event: Record<string, any>): Promise<void> {
  const seq = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const operation = String(event.operation || "operation");
  await svc.entities.CrixAuditEvent.create({
    event_id: operation + "|" + String(event.transaction_id || event.idempotency_key || "no-ref") + "|" + seq,
    operation,
    user_id: String(event.user_id || ""),
    transaction_id: String(event.transaction_id || ""),
    idempotency_key: String(event.idempotency_key || ""),
    old_state: String(event.old_state || ""),
    new_state: String(event.new_state || ""),
    selected_rail: String(event.selected_rail || ""),
    chain: String(event.chain || ""),
    asset: String(event.asset || ""),
    amount: Number(event.amount || 0),
    fee: Number(event.fee || 0),
    provider: String(event.provider || ""),
    wallet: String(event.wallet || ""),
    blockchain_hash: String(event.blockchain_hash || ""),
    actor: String(event.actor || ""),
    reason: String(event.reason || ""),
    risk_result: String(event.risk_result || ""),
    payload_json: typeof event.payload_json === "string" ? event.payload_json : JSON.stringify(event.payload_json || {}),
  });
}

export type RailHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export type RailDecision = {
  rail: "BASE" | "SOLANA" | null;
  decision: string;
  reason: string;
};

// THE §38 FAILOVER DECISION TABLE — the only place a rail is ever chosen.
//   CASE 1  Base unavailable BEFORE submission, fallback explicitly allowed → Solana
//   CASE 2  Base submitted, response lost → UNKNOWN → BASE_RECOVERY (never Solana)
//   CASE 3  Base confirmed → settle Base, no Solana transaction
//   CASE 4  Base definitively failed before settlement → release the reservation;
//           a rail may be reselected only if policy permits
//   CASE 7  Both healthy → preferred Base unless the transaction explicitly chose Solana
//   CASE 8  Both unavailable → the money does not move (fail-closed)
// A timeout is NEVER proof of failure and NEVER selects another rail.
export function chooseSettlementRail(input: {
  preferred_rail: "BASE" | "SOLANA";
  base_health: RailHealth;
  solana_health: RailHealth;
  solana_fallback_enabled: boolean;
  transaction_type_allowed_on_solana: boolean;
  already_submitted: boolean;
  submitted_rail: "BASE" | "SOLANA" | "";
}): RailDecision {
  // CASE 2/3 — a submission already exists: reconciliation owns it. The rail
  // is NEVER switched after submission, whatever the response looked like.
  if (input.already_submitted) {
    return {
      rail: input.submitted_rail === "SOLANA" ? "SOLANA" : "BASE",
      decision: "BASE_RECOVERY",
      reason: "A settlement submission already exists — this transaction is UNKNOWN until reconciled on its own rail. A timeout never selects another rail and never triggers a blind resubmission.",
    };
  }
  // Explicit rail choice is honoured only when that rail is usable.
  if (input.preferred_rail === "SOLANA") {
    if (input.solana_health !== "UNAVAILABLE") {
      return { rail: "SOLANA", decision: "EXPLICIT_RAIL", reason: "The transaction explicitly chose Solana and the Solana rail is usable." };
    }
    return { rail: null, decision: "CONTROLLED_FAILURE", reason: "The transaction explicitly chose Solana but the Solana rail is unavailable — the money does not move (fail-closed)." };
  }
  // CASE 7 — Base primary: DEGRADED is still alive, so it stays on Base.
  // A temporary RPC error is never treated as the blockchain being down.
  if (input.base_health !== "UNAVAILABLE") {
    return { rail: "BASE", decision: "BASE_PRIMARY", reason: "Base is the primary rail and is alive — a degraded Base still routes to Base." };
  }
  // CASE 1 — Base conclusively unavailable BEFORE any submission.
  if (input.solana_fallback_enabled && input.transaction_type_allowed_on_solana && input.solana_health !== "UNAVAILABLE") {
    return { rail: "SOLANA", decision: "SOLANA_CONTROLLED_FALLBACK", reason: "Base was unavailable BEFORE submission and the explicitly-enabled fallback permits this transaction type on Solana." };
  }
  // CASE 8
  return { rail: null, decision: "CONTROLLED_FAILURE", reason: "Base is unavailable before submission and the Solana fallback is not permitted for this transaction — the money does not move (fail-closed)." };
}