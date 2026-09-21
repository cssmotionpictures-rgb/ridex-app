import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { rpc, decodeTransferLog, TRANSFER_TOPIC } from "../../shared/crxsRpc.ts";
import { readCdpCredentials, buildCdpClient, mapUserOpStatus } from "../../shared/cdpAdapter.ts";
import { gasCostFromReceipt } from "../../shared/gasProviderRouter.ts";

// RECONCILIATION WORKER — Base Sepolia. Resolves SUBMITTED/PENDING/UNKNOWN
// CRIXCOIN transfers against the REAL chain, never blindly resending:
//   • tx_hash known → read the receipt → status + Transfer event decide
//   • only userOp hash known → ask the provider, bounded, then decide
//   • receipt succeeded but the event does not match → discrepancy flagged,
//     state stays UNKNOWN, financial records are never silently overwritten
// Idempotent: a CONFIRMED/FAILED record is returned as-is, never re-decided.
// Runs for the caller's own transfers, or across all records for an admin.

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const specificKey = typeof payload.transfer_key === "string" ? payload.transfer_key.trim() : "";
    const isAdmin = user.role === "admin";

    const service = base44.asServiceRole;
    const query = specificKey ? { transfer_key: specificKey } : { state: "UNKNOWN" };
    const unknownRows = (await service.entities.CrxsSepoliaTransfer.filter(query)) || [];
    const pendingRows = specificKey ? [] : (await service.entities.CrxsSepoliaTransfer.filter({ state: "PENDING" })) || [];
    const rows = (unknownRows.concat(pendingRows))
      .filter((r) => isAdmin || r.from_user_id === user.id)
      .slice(0, 20);

    const results = [];
    for (const row of rows) {
      const update = (patch) => service.entities.CrxsSepoliaTransfer.update(row.id, patch);
      const notes = [];

      // Already final — never re-decided.
      if (row.state === "CONFIRMED" || row.state === "FAILED") {
        results.push({ transfer_key: row.transfer_key, state: row.state, final: true });
        continue;
      }

      let txHash = row.tx_hash || "";

      // No tx hash yet — ask the provider, bounded. Never resubmit.
      if (!txHash && row.user_op_hash) {
        try {
          const creds = readCdpCredentials();
          if (creds.missing.length === 0) {
            const cdp = buildCdpClient(creds);
            const accounts = await service.entities.CrxsSmartAccount.filter({ user_id: row.from_user_id, network: "base-sepolia" });
            const account = (accounts || [])[0] || null;
            if (account && account.account_name) {
              const smartAccount = await cdp.evm.getSmartAccount({ name: account.account_name, network: "base-sepolia" });
              const result = await withTimeout(smartAccount.waitForUserOperation({ userOpHash: row.user_op_hash }), 12000);
              if (result && result.transactionHash) {
                txHash = result.transactionHash;
                notes.push({ source: "provider", value: "provider returned tx " + txHash });
                await update({ tx_hash: txHash });
              } else {
                notes.push({ source: "provider", value: result ? "status " + String(result.status) : "no answer within bound — remains UNKNOWN" });
              }
            }
          }
        } catch (providerError) {
          notes.push({ source: "provider", value: String(providerError.message || providerError).slice(0, 160) });
        }
      }

      if (!txHash) {
        await update({ reconciliation_json: JSON.stringify({ at: new Date().toISOString(), notes }), reconciled_at: new Date().toISOString() });
        results.push({ transfer_key: row.transfer_key, state: "UNKNOWN", resolved: false, notes });
        continue;
      }

      // The real Sepolia receipt decides — never a timeout.
      const receipt = await rpc("eth_getTransactionReceipt", [txHash]).catch(() => null);
      if (!receipt || !receipt.transactionHash) {
        await update({ reconciliation_json: JSON.stringify({ at: new Date().toISOString(), notes: [...notes, { source: "chain", value: "no receipt yet — remains unresolved" }] }), reconciled_at: new Date().toISOString() });
        results.push({ transfer_key: row.transfer_key, state: "UNKNOWN", resolved: false });
        continue;
      }

      if (String(receipt.status) !== "0x1") {
        // Definitive on-chain failure → FAILED, funds never left the sender.
        await update({ state: "FAILED", tx_hash: txHash, failure_reason: "Reconciled: the Sepolia receipt shows the transaction reverted — no CRXS moved", reconciliation_json: JSON.stringify({ at: new Date().toISOString(), decision: "FAILED from real receipt" }), reconciled_at: new Date().toISOString() });
        results.push({ transfer_key: row.transfer_key, state: "FAILED", resolved: true });
        continue;
      }

      // Success receipt → verify the actual Transfer event against the intent.
      const records = await service.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" });
      const deployment = (records || [])[0] || null;
      const contractAddress = deployment && deployment.contract_address ? String(deployment.contract_address).toLowerCase() : "";

      // The sender's smart account address is needed for event matching.
      const senderAccounts = await service.entities.CrxsSmartAccount.filter({ user_id: row.from_user_id, network: "base-sepolia" });
      const senderAccount = (senderAccounts || [])[0] || null;

      let eventVerified = false;
      let eventMatch = { note: "not verified" };
      if (contractAddress && senderAccount && senderAccount.account_address) {
        const logs = (receipt.logs || []).filter(
          (l) => String(l.address || "").toLowerCase() === contractAddress && String((l.topics || [])[0] || "").toLowerCase() === TRANSFER_TOPIC
        );
        const events = logs.map(decodeTransferLog).filter(Boolean);
        const senderAddress = String(senderAccount.account_address).toLowerCase();
        const amountLeg = events.find((ev) => ev.from === senderAddress && ev.to === String(row.to_address).toLowerCase() && BigInt(ev.amountRaw) === BigInt(row.amount_raw));
        const feeLeg = events.find((ev) => ev.from === senderAddress && ev.to === String(row.fee_wallet || "").toLowerCase() && BigInt(ev.amountRaw) === BigInt(row.fee_raw || "0"));
        eventMatch = { amount_leg: amountLeg || null, fee_leg: feeLeg || null, legs_found: events.length };
        eventVerified = !!(amountLeg && feeLeg);
      }

      const gas = gasCostFromReceipt(receipt);
      if (eventVerified) {
        await update({
          state: "CONFIRMED",
          tx_hash: txHash,
          block_number: Number(BigInt(receipt.blockNumber)),
          confirmed_at: new Date().toISOString(),
          gas_cost_raw_wei: gas.gas_cost_raw_wei,
          gas_cost_native: gas.gas_cost_native,
          transfer_event_verified: true,
          event_match_json: JSON.stringify(eventMatch),
          discrepancy_flag: false,
          reconciliation_json: JSON.stringify({ at: new Date().toISOString(), decision: "CONFIRMED from real receipt + verified Transfer event" }),
          reconciled_at: new Date().toISOString(),
        });
        results.push({ transfer_key: row.transfer_key, state: "CONFIRMED", resolved: true, tx_hash: txHash });
      } else {
        // Receipt succeeded but the event does not match the intent — flagged,
        // never silently marked confirmed, never overwritten.
        await update({
          state: "UNKNOWN",
          tx_hash: txHash,
          gas_cost_raw_wei: gas.gas_cost_raw_wei,
          gas_cost_native: gas.gas_cost_native,
          event_match_json: JSON.stringify(eventMatch),
          discrepancy_flag: true,
          reconciliation_json: JSON.stringify({ at: new Date().toISOString(), decision: "receipt succeeded but Transfer event does not match intent — DISCREPANCY flagged for review" }),
          reconciled_at: new Date().toISOString(),
        });
        results.push({ transfer_key: row.transfer_key, state: "UNKNOWN", resolved: false, discrepancy: true, tx_hash: txHash });
      }
    }

    return Response.json({
      ok: true,
      checked: rows.length,
      results,
      note: "Every decision comes from a real Base Sepolia receipt and the actual Transfer event — never a timeout, never a blind resend.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}