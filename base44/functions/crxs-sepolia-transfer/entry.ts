import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { encodeFunctionData, parseAbi } from "npm:viem@2.56.3";
import { rpc, callContract, decodeTransferLog, TRANSFER_TOPIC, ZERO_ADDRESS } from "../../shared/crxsRpc.ts";
import { readCdpCredentials, buildCdpClient, mapUserOpStatus, PLATFORM_FEE_BPS } from "../../shared/cdpAdapter.ts";
import { selectSepoliaGasProvider, gasCostFromReceipt } from "../../shared/gasProviderRouter.ts";
import { parseRawAmount } from "../../shared/crxsTransferCore.ts";

// CRIXCOIN ZERO-ETH TRANSFER — Base Sepolia only. This is the customer send:
// the user never holds ETH, never sees gas, never connects MetaMask. A smart
// account + UserOperation + paymaster executes it; a provider saying
// "success" is NEVER enough — CONFIRMED requires an independent Sepolia
// receipt AND the actual CRXS Transfer event matching the intended sender,
// recipient and amount.
//
// State machine (never skipped): CREATED → QUOTED → AUTHORIZED → SUBMITTED →
// PENDING → CONFIRMED | FAILED | UNKNOWN. UNKNOWN is resolved on chain by the
// reconciliation worker, never blindly resent.
//
// Gates, in order, none skippable:
//   1. Idempotency — the same transfer_key NEVER sends twice
//   2. A verified Sepolia CRXS contract must exist on record
//   3. The caller owns the sending smart account (or admin for tests)
//   4. Live balance check BEFORE submission — insufficient CRXS is rejected
//   5. A gas provider must be HEALTHY (live probe) — otherwise nothing is
//      submitted and the customer sees temporary unavailable, never fake success
//   6. The 0.2% fee moves in the SAME atomic operation as the transfer

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const transferKey = typeof payload.transfer_key === "string" ? payload.transfer_key.trim() : "";
    const fromUserId = typeof payload.from_user_id === "string" ? payload.from_user_id.trim() : "";
    const toAddress = typeof payload.to_address === "string" ? String(payload.to_address).trim().toLowerCase() : "";
    const amountRaw = parseRawAmount(payload.amount_raw);

    if (!transferKey || !fromUserId || !/^0x[0-9a-f]{40}$/.test(toAddress) || toAddress === ZERO_ADDRESS || !amountRaw) {
      return Response.json({ error: "INVALID_REQUEST — transfer_key, from_user_id, to_address (0x…) and amount_raw (positive integer string) are required" }, { status: 400 });
    }
    if (user.id !== fromUserId && user.role !== "admin") {
      return Response.json({ error: "Forbidden — you can only send from your own CRIXCOIN address" }, { status: 403 });
    }

    const service = base44.asServiceRole;

    // GATE 1 — idempotency: repeated SEND taps create exactly one transaction.
    const existing = await service.entities.CrxsSepoliaTransfer.filter({ transfer_key: transferKey });
    const prior = (existing || [])[0] || null;
    if (prior) {
      return Response.json({ ok: true, duplicate: true, transfer_key: prior.transfer_key, state: prior.state, tx_hash: prior.tx_hash, note: "This send was already submitted — idempotency refused a second transaction" });
    }

    // GATE 2 — the verified Sepolia CRXS contract on record.
    const records = await service.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" });
    const deployment = (records || [])[0] || null;
    const contract = deployment && deployment.deployment_status === "DEPLOYED" && deployment.contract_address ? String(deployment.contract_address).toLowerCase() : "";
    if (!contract) {
      return Response.json({ error: "CONTRACT_NOT_DEPLOYED — there is no verified CRXS contract on Base Sepolia. Nothing was sent." }, { status: 409 });
    }

    // The platform fee wallet — the 0.2% fee leg needs a real destination.
    const feeWallet = secrets.get("CRXS_PLATFORM_FEE_WALLET") || "";
    if (!/^0x[0-9a-f]{40}$/.test(String(feeWallet).toLowerCase())) {
      return Response.json({ error: "FEE_WALLET_NOT_CONFIGURED — set CRXS_PLATFORM_FEE_WALLET to an address the platform controls. Nothing was sent." }, { status: 409 });
    }
    const feeAmount = (amountRaw * PLATFORM_FEE_BPS) / 10000n;

    // The sender's Sepolia smart account.
    const accounts = await service.entities.CrxsSmartAccount.filter({ user_id: fromUserId, network: "base-sepolia" });
    let account = (accounts || [])[0] || null;
    if (!account || account.status !== "CREATED" || !account.account_address) {
      return Response.json({ error: "NO_CRIXCOIN_ADDRESS — the sending user has no Base Sepolia CRIXCOIN address yet. Create it first (crxs-smart-account, network base-sepolia)." }, { status: 409 });
    }

    // Record the transaction BEFORE any movement — CREATED.
    const record = await service.entities.CrxsSepoliaTransfer.create({
      transfer_key: transferKey,
      from_user_id: fromUserId,
      to_user_id: typeof payload.to_user_id === "string" ? payload.to_user_id.trim() : "",
      to_address: toAddress,
      amount_raw: amountRaw.toString(),
      fee_raw: feeAmount.toString(),
      fee_wallet: String(feeWallet).toLowerCase(),
      state: "CREATED",
      provider: "",
      gas_mode: "PLATFORM_SPONSORED",
      gas_cost_raw_wei: "0",
      gas_cost_native: 0,
      gas_cost_crxs: "0",
      user_op_hash: "",
      tx_hash: "",
      block_number: 0,
      confirmed_at: "",
      transfer_event_verified: false,
      event_match_json: "{}",
      discrepancy_flag: false,
      failure_reason: "",
      evidence_json: "[]",
      reconciliation_json: "",
      reconciled_at: "",
    });
    const update = (patch) => service.entities.CrxsSepoliaTransfer.update(record.id, patch);
    const evidence = [];

    // GATE 3 — live balance check BEFORE submission (on-chain state enforces
    // the rest: a concurrent over-spend simply reverts and is recorded FAILED).
    const balanceRaw = BigInt(await callContract(contract, "0x70a08231" + account.account_address.slice(2).padStart(64, "0")));
    if (balanceRaw < amountRaw + feeAmount) {
      await update({ state: "FAILED", failure_reason: "Insufficient CRXS: available " + balanceRaw.toString() + " raw, needed " + (amountRaw + feeAmount).toString() + " raw (amount + 0.2% fee)" });
      return Response.json({ error: "INSUFFICIENT_CRIXCOIN — you do not hold enough CRIXCOIN for this send", available_raw: balanceRaw.toString(), required_raw: (amountRaw + feeAmount).toString() }, { status: 409 });
    }
    evidence.push({ check: "balance_verified_live", pass: true, value: balanceRaw.toString() + " raw available vs " + (amountRaw + feeAmount).toString() + " required", source: "CRXS balanceOf on Base Sepolia" });

    // QUOTED — provider selected + fee computed. AUTHORIZED — ownership proven.
    const selection = await selectSepoliaGasProvider();
    evidence.push({ check: "gas_provider_probes", pass: !!selection.selected, value: JSON.stringify(selection.probes), source: "Live eth_supportedEntryPoints probes on Base Sepolia" });
    if (!selection.selected) {
      await update({ state: "FAILED", failure_reason: "All gas providers unhealthy — no transaction was submitted", evidence_json: JSON.stringify(evidence) });
      return Response.json({ error: "TEMPORARILY_UNAVAILABLE — no gas provider is healthy right now. Nothing was sent and nothing was debited; try again shortly.", probes: selection.probes }, { status: 503 });
    }
    await update({ state: "QUOTED", provider: selection.selected.provider, gas_mode: selection.gasMode, evidence_json: JSON.stringify(evidence) });
    await update({ state: "AUTHORIZED", evidence_json: JSON.stringify([...evidence, { check: "sender_ownership_authorized", pass: true, value: "authenticated user " + fromUserId + " owns smart account " + account.account_address }] ) });

    const creds = readCdpCredentials();
    if (creds.missing.length > 0) {
      await update({ state: "FAILED", failure_reason: "CDP not configured: " + creds.missing.join(" · "), evidence_json: JSON.stringify(evidence) });
      return Response.json({ error: "CDP_NOT_CONFIGURED — still missing: " + creds.missing.join(" · ") + ". Nothing was sent." }, { status: 409 });
    }

    let submittedHash = "";
    try {
      const cdp = buildCdpClient(creds);
      const smartAccount = await cdp.evm.getSmartAccount({ name: account.account_name, network: "base-sepolia" });

      // The send + the 0.2% fee in ONE atomic UserOperation — the customer
      // sees only "Send N CRXS"; gas is sponsored by the paymaster.
      const calls = [
        { to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [toAddress, amountRaw] }) },
        { to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [String(feeWallet).toLowerCase(), feeAmount] }) },
      ];

      const userOp = await smartAccount.sendUserOperation({
        network: "base-sepolia",
        calls,
        paymasterUrl: selection.selected.paymasterUrl,
      });
      submittedHash = userOp.userOpHash;
      await update({ state: "SUBMITTED", user_op_hash: submittedHash, evidence_json: JSON.stringify([...evidence, { check: "user_operation_submitted", pass: true, value: submittedHash, provider: selection.selected.provider, source: "Live provider submission" }]) });
      await update({ state: "PENDING" });

      const result = await smartAccount.waitForUserOperation({ userOpHash: submittedHash });
      const mappedStatus = mapUserOpStatus(result.status);
      if (mappedStatus !== "confirmed") {
        await update({ state: mappedStatus === "failed" ? "FAILED" : "UNKNOWN", tx_hash: result.transactionHash || "", failure_reason: "Provider reported status " + String(result.status) + " — resolved on chain before any action", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, transfer_key: transferKey, state: mappedStatus === "failed" ? "FAILED" : "UNKNOWN", note: "The send did not confirm — the reconciliation worker resolves it on chain; nothing is blindly resent" });
      }

      // CONFIRMED requires: an independent Sepolia receipt AND the real
      // Transfer event matching sender/recipient/amount — never the provider's
      // word alone.
      const receipt = await rpc("eth_getTransactionReceipt", [result.transactionHash]);
      if (!receipt || String(receipt.status) !== "0x1") {
        await update({ state: "UNKNOWN", tx_hash: result.transactionHash || "", failure_reason: "Provider reported complete but the independent Sepolia receipt is not a success", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, transfer_key: transferKey, state: "UNKNOWN", note: "UNKNOWN — resolved on chain before any action" });
      }

      const gas = gasCostFromReceipt(receipt);
      const accountAddress = String(account.account_address).toLowerCase();
      const logs = (receipt.logs || []).filter(
        (l) => String(l.address || "").toLowerCase() === contract && String((l.topics || [])[0] || "").toLowerCase() === TRANSFER_TOPIC
      );
      const events = logs.map(decodeTransferLog).filter(Boolean);
      const amountLeg = events.find((ev) => ev.from === accountAddress && ev.to === toAddress && BigInt(ev.amountRaw) === amountRaw);
      const feeLeg = events.find((ev) => ev.from === accountAddress && ev.to === String(feeWallet).toLowerCase() && BigInt(ev.amountRaw) === feeAmount);
      const eventMatch = { amount_leg: amountLeg || null, fee_leg: feeLeg || null, legs_found: events.length };
      const eventVerified = !!(amountLeg && feeLeg);
      evidence.push({ check: "receipt_independently_verified", pass: true, value: receipt.transactionHash + " @ block " + Number(BigInt(receipt.blockNumber)), source: "Base Sepolia eth_getTransactionReceipt" });
      evidence.push({ check: "transfer_event_verified", pass: eventVerified, value: JSON.stringify(eventMatch), source: "CRXS Transfer logs decoded from the real receipt" });
      evidence.push({ check: "gas_accounted_from_receipt", pass: true, value: gas.gas_cost_raw_wei + " wei (" + gas.gas_cost_native + " ETH) — platform-sponsored, recorded for accounting", source: "gasUsed × effectiveGasPrice" });

      if (!eventVerified) {
        // The receipt succeeded but the event does not match the intent —
        // flagged for reconciliation, NEVER reported to the customer as success.
        await update({
          state: "UNKNOWN",
          tx_hash: result.transactionHash,
          gas_cost_raw_wei: gas.gas_cost_raw_wei,
          gas_cost_native: gas.gas_cost_native,
          transfer_event_verified: false,
          event_match_json: JSON.stringify(eventMatch),
          discrepancy_flag: true,
          failure_reason: "Transfer event does not match the intended transaction — flagged for reconciliation",
          evidence_json: JSON.stringify(evidence),
        });
        return Response.json({ ok: false, transfer_key: transferKey, state: "UNKNOWN", discrepancy: true, note: "The chain outcome does not match the intent — flagged for reconciliation, never reported as success" });
      }

      const blockNumber = Number(BigInt(receipt.blockNumber));
      await update({
        state: "CONFIRMED",
        tx_hash: result.transactionHash,
        block_number: blockNumber,
        confirmed_at: new Date().toISOString(),
        gas_cost_raw_wei: gas.gas_cost_raw_wei,
        gas_cost_native: gas.gas_cost_native,
        transfer_event_verified: true,
        event_match_json: JSON.stringify(eventMatch),
        discrepancy_flag: false,
        evidence_json: JSON.stringify(evidence),
      });
      return Response.json({
        ok: true,
        transfer_key: transferKey,
        state: "CONFIRMED",
        tx_hash: result.transactionHash,
        block_number: blockNumber,
        provider: selection.selected.provider,
        gas_mode: selection.gasMode,
        amount_raw: amountRaw.toString(),
        fee_raw: feeAmount.toString(),
        note: "CRIXCOIN sent successfully",
      });
    } catch (sendError) {
      const reason = String(sendError.message || sendError).slice(0, 300);
      // If the UserOperation WAS submitted, its fate is UNKNOWN until the chain
      // answers — never failed, never blindly resent.
      const state = submittedHash ? "UNKNOWN" : "FAILED";
      await update({ state, user_op_hash: submittedHash, failure_reason: reason, evidence_json: JSON.stringify(evidence) });
      return Response.json({ ok: false, transfer_key: transferKey, state, error: reason, note: submittedHash ? "UNKNOWN — the reconciliation worker resolves it on chain; nothing is resent" : "Failed before submission — no movement was attempted" }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}