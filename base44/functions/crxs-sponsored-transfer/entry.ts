import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { readCdpCredentials, buildCdpClient, readTransferGate, readMainnetCrxsContract, mapUserOpStatus, CRXS_ERC20_PAYMASTER_BASE_MAINNET, PLATFORM_FEE_BPS, readPlatformFeeWallet } from "../../shared/cdpAdapter.ts";
import { isValidEvmAddress, rpcCall } from "../../shared/crxsMainnetRpc.ts";
import { encodeFunctionData, parseAbi } from "npm:viem@2.56.3";
import { parseRawAmount } from "../../shared/crxsTransferCore.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";

// CRIXCOIN sponsored transfer — the ONLY path that can ever move CRXS
// on-chain on Base Mainnet. The user never pays ETH: gas is paid in CRIXCOIN
// through the ERC-20 paymaster, and every transfer carries the 0.2% network
// fee (paid in CRIXCOIN) to the platform fee wallet.
// Safety in order, none skippable:
//   1. Caller owns the sending smart account (or admin for controlled tests)
//   2. EXTERNAL TRANSFER GATE must be OPERATIONAL — PAUSED until every real
//      on-chain condition is independently verified. No movement while paused.
//   3. A real production CRXS contract must exist on Base Mainnet
//   4. Idempotency: the same transfer_key NEVER sends twice
//   0. EMERGENCY PAUSE — fail-closed, checked first, audited (spec §27/§40)
//   5. confirmed ONLY with an independently verified Base Mainnet receipt;
//      unknown is a real state — never flipped to failed without a chain query
// (Deploy retry 8 — adds GATE 0 emergency-pause + audit trail.)

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export default async function (req) {
  try {
    let payload = {};
    try { payload = await req.json(); } catch (error) { payload = {}; }
    const transferKey = typeof payload.transfer_key === "string" ? payload.transfer_key.trim() : "";
    const fromUserId = typeof payload.from_user_id === "string" ? payload.from_user_id.trim() : "";
    const toAddress = typeof payload.to_address === "string" ? payload.to_address.trim() : "";
    const amountRaw = parseRawAmount(payload.amount_raw);

    if (!transferKey || !fromUserId || !isValidEvmAddress(toAddress) || !amountRaw) {
      return Response.json({ error: "INVALID_REQUEST — transfer_key, from_user_id, to_address (0x…) and amount_raw (positive integer string) are required" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.id !== fromUserId && user.role !== "admin") {
      return Response.json({ error: "Forbidden — a sponsored transfer can only be sent from the caller's own CRIXCOIN address" }, { status: 403 });
    }

    const service = base44.asServiceRole;

    // GATE 0 — EMERGENCY PAUSE (spec §27): fail-closed and checked FIRST,
    // before any other gate. The frontend can never disable this; the block
    // is itself audited.
    const pause = await assertNotPaused(service, "onchain_transfer");
    if (pause.blocked) {
      await appendAudit(service, { operation: "send", user_id: fromUserId, idempotency_key: transferKey, old_state: "CREATED", new_state: "PAUSED", selected_rail: "BASE", chain: "BASE_MAINNET", asset: "CRXS", actor: "crxs-sponsored-transfer", reason: pause.reason, payload_json: { switches: pause.switches } }).catch(() => {});
      return Response.json({ error: pause.reason, gate: "EMERGENCY_PAUSE", pause_switches: pause.switches }, { status: 423 });
    }

    // GATE 1 — external on-chain transfers stay PAUSED until every real
    // condition is independently verified on-chain. Never by configuration.
    const gateState = await readTransferGate(service);
    if (gateState !== "OPERATIONAL") {
      return Response.json({
        error: "EXTERNAL_TRANSFERS_PAUSED — the server-side transfer gate is " + gateState + ". No on-chain movement was attempted. The gate opens ONLY on real on-chain evidence: production CRXS contract deployed and verified, a real sponsored UserOperation confirmed on Base Mainnet, and gas actually funded.",
        gate_state: gateState,
      }, { status: 423 });
    }

    // GATE 2 — a real production CRXS contract must exist on Base Mainnet.
    const contract = await readMainnetCrxsContract(service);
    if (!contract) {
      return Response.json({ error: "CONTRACT_NOT_DEPLOYED — there is no production CRXS contract on Base Mainnet. Nothing was sent." }, { status: 409 });
    }

    // GATE 3 — idempotency: the same transfer_key NEVER sends twice.
    const existing = await service.entities.CrxsSponsoredTransfer.filter({ transfer_key: transferKey });
    const prior = (existing || [])[0] || null;
    if (prior) {
      return Response.json({
        ok: true,
        duplicate: true,
        transfer_key: prior.transfer_key,
        status: prior.status,
        tx_hash: prior.tx_hash,
        note: "This transfer was already submitted — idempotency refused a second send",
      });
    }

    // The sending smart account must be real and created.
    const accounts = await service.entities.CrxsSmartAccount.filter({ user_id: fromUserId });
    const account = (accounts || [])[0] || null;
    if (!account || account.status !== "CREATED" || !account.account_address) {
      return Response.json({ error: "NO_CRIXCOIN_ADDRESS — the sending user has no CRIXCOIN address yet. Nothing was sent." }, { status: 409 });
    }

    // Credential gate.
    const creds = readCdpCredentials();
    if (creds.missing.length > 0) {
      return Response.json({ error: "CDP_NOT_CONFIGURED — still missing: " + creds.missing.join(" · ") + ". Nothing was sent." }, { status: 409 });
    }

    // Fee wallet — where the 0.2% network fee (paid in CRIXCOIN) accumulates.
    const feeWallet = readPlatformFeeWallet();
    if (!feeWallet || !isValidEvmAddress(feeWallet)) {
      return Response.json({ error: "PLATFORM_FEE_WALLET_NOT_CONFIGURED — the platform fee collection address is not set yet. Nothing was sent." }, { status: 409 });
    }

    const feeAmount = (amountRaw * PLATFORM_FEE_BPS) / 10000n;

    // Record the transfer BEFORE any chain movement — created state.
    const created = await service.entities.CrxsSponsoredTransfer.create({
      transfer_key: transferKey,
      from_user_id: fromUserId,
      to_address: String(toAddress).toLowerCase(),
      amount_raw: amountRaw.toString(),
      fee_raw: feeAmount.toString(),
      fee_wallet: String(feeWallet).toLowerCase(),
      user_op_hash: "",
      tx_hash: "",
      status: "created",
      block_number: 0,
      confirmed_at: "",
      evidence_json: "[]",
      failure_reason: "",
    });
    const updateTransfer = (patch) => service.entities.CrxsSponsoredTransfer.update(created.id, patch);

    const evidence = [];
    let submittedHash = "";

    try {
      const cdp = buildCdpClient(creds);
      const smartAccount = await cdp.evm.getSmartAccount({ name: account.account_name });

      // 1) The recipient transfer.
      const calls = [
        { to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [toAddress, amountRaw] }) },
        // 2) The 0.2% network fee, paid in CRIXCOIN to the platform fee wallet.
        { to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [feeWallet, feeAmount] }) },
      ];

      // 3) ERC-20 paymaster: gas is paid in CRIXCOIN — ensure the paymaster is
      //    allowed to spend enough, adding an approval in the same operation
      //    when the live allowance is low.
      let allowance = 0n;
      try {
        const allowanceResult = await rpcCall("eth_call", [
          { to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [account.account_address, CRXS_ERC20_PAYMASTER_BASE_MAINNET] }) },
          "latest",
        ]);
        allowance = BigInt(allowanceResult);
      } catch (allowanceError) {
        allowance = 0n;
      }
      if (allowance < feeAmount * 100n) {
        calls.push({ to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [CRXS_ERC20_PAYMASTER_BASE_MAINNET, feeAmount * 1000n] }) });
      }

      // 4) Send the UserOperation — the paymaster sponsors gas in CRIXCOIN.
      const userOp = await smartAccount.sendUserOperation({
        network: "base",
        calls,
        paymasterUrl: creds.paymasterUrl,
        context: { erc20: { tokenAddress: contract } },
      });
      submittedHash = userOp.userOpHash;
      evidence.push({ check: "user_operation_submitted", pass: true, value: submittedHash, source: "CDP sendUserOperation live response" });
      await updateTransfer({ status: "submitted", user_op_hash: submittedHash, evidence_json: JSON.stringify(evidence) });

      await updateTransfer({ status: "pending" });
      const result = await smartAccount.waitForUserOperation({ userOpHash: submittedHash });
      const mapped = mapUserOpStatus(result.status);
      evidence.push({ check: "user_operation_settled", pass: true, value: String(result.status), source: "CDP waitForUserOperation live response" });

      if (mapped !== "confirmed") {
        await updateTransfer({ status: mapped, failure_reason: "CDP reported status " + String(result.status), evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, transfer_key: transferKey, status: mapped, note: "The transfer did not confirm — nothing is marked confirmed without a real receipt" });
      }

      // CONFIRMED ONLY with an independent Base Mainnet receipt.
      const receipt = await rpcCall("eth_getTransactionReceipt", [result.transactionHash]);
      if (!receipt || receipt.status !== "0x1") {
        await updateTransfer({
          status: "unknown",
          tx_hash: result.transactionHash || "",
          failure_reason: "CDP reported complete but the independent Base Mainnet receipt was not a successful confirmation",
          evidence_json: JSON.stringify(evidence),
        });
        return Response.json({ ok: false, transfer_key: transferKey, status: "unknown", note: "UNKNOWN is not a failure — the chain is queried before any action; never blindly resent" });
      }
      const blockNumber = parseInt(receipt.blockNumber, 16);
      evidence.push({ check: "base_mainnet_receipt_independently_verified", pass: true, value: receipt.transactionHash + " @ block " + blockNumber, source: "Base Mainnet RPC eth_getTransactionReceipt" });
      await updateTransfer({
        status: "confirmed",
        tx_hash: result.transactionHash,
        block_number: blockNumber,
        confirmed_at: new Date().toISOString(),
        evidence_json: JSON.stringify(evidence),
      });
      // AUDIT (§40) — confirmed only with an independently verified receipt.
      await appendAudit(service, {
        operation: "send", user_id: fromUserId, transaction_id: transferKey, idempotency_key: transferKey,
        old_state: "pending", new_state: "confirmed", selected_rail: "BASE", chain: "BASE_MAINNET", asset: "CRXS",
        fee: Number(feeAmount) / 1e18, provider: "cdp", wallet: String(toAddress).toLowerCase(),
        blockchain_hash: result.transactionHash, actor: "crxs-sponsored-transfer",
        reason: "confirmed with an independently verified Base Mainnet receipt",
      }).catch(() => {});
      return Response.json({ ok: true, transfer_key: transferKey, status: "confirmed", tx_hash: result.transactionHash, block_number: blockNumber, fee_raw: feeAmount.toString() });
    } catch (sendError) {
      const reason = String(sendError.message || sendError).slice(0, 300);
      // If the UserOperation WAS submitted, its fate is UNKNOWN until the
      // chain answers — never failed, never blindly resent. Only a failure
      // BEFORE submission is honestly "failed".
      const status = submittedHash ? "unknown" : "failed";
      await updateTransfer({ status, user_op_hash: submittedHash, failure_reason: reason, evidence_json: JSON.stringify(evidence) });
      // AUDIT (§40) — UNKNOWN is a real state: the chain is queried before
      // any action, never blindly resent, never re-railed.
      await appendAudit(service, {
        operation: "send", user_id: fromUserId, transaction_id: transferKey, idempotency_key: transferKey,
        old_state: "created", new_state: status, selected_rail: "BASE", chain: "BASE_MAINNET", asset: "CRXS",
        actor: "crxs-sponsored-transfer", reason,
      }).catch(() => {});
      return Response.json({ ok: false, transfer_key: transferKey, status, error: reason, note: submittedHash ? "UNKNOWN — the chain is queried before any retry; never blindly resent" : "Failed before submission — no on-chain movement was attempted" }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}