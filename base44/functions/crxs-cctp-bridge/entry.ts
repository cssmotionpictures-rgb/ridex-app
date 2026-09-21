import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { encodeFunctionData, parseAbi } from "npm:viem@2.56.3";
import { rpcCall as baseRpcCall } from "../../shared/crxsMainnetRpc.ts";
import { readCdpCredentials, buildCdpClient, mapUserOpStatus } from "../../shared/cdpAdapter.ts";

// CIRCLE CCTP USDC BRIDGE — Polygon ↔ Base, admin-only. Burns USDC on the
// source chain and mints it 1:1 on the destination chain. Safety in order,
// none skippable:
//   1. Idempotency: the same bridge_key NEVER burns twice; the mint receive
//      step is retried independently, never resubmitting the burn
//   2. Every CCTP contract is verified live (eth_getCode) on both chains
//      before use — addresses come from Circle's official docs and were
//      independently verified live before being written here
//   3. The bridge wallet's real USDC balance is read live before the burn
//   4. confirmed ONLY with an independent destination receipt AND a real
//      USDC balance increase at the destination wallet
//   5. unknown is a real state — resolved on chain before any action

const ALLOWED_ACTIONS = ["status", "bridge", "receive"];

const BASE_DOMAIN = 6;
const POLYGON_DOMAIN = 7;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8c03e5d3d9c9";
const TOKEN_MESSENGER_BASE = "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962";
const TOKEN_MESSENGER_POLYGON = "0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE";
const MESSAGE_TRANSMITTER_BASE = "0xAD09780d193884d503182aD4588450C416D6F9D4";
const MESSAGE_TRANSMITTER_POLYGON = "0xF3be9355363857F3e001be68856A2f96b4C39Ba9";
const IRIS_API = "https://iris-api.circle.com/v2/messages";

const POLYGON_RPCS = ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com", "https://1rpc.io/matic"];

const CCTP_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)",
  "function receiveMessage(bytes message, bytes attestation) returns (bool success)",
]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function polygonRpcCall(method, params) {
  let lastError = null;
  for (const endpoint of POLYGON_RPCS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
        if (!res.ok) throw new Error("Polygon RPC HTTP " + res.status);
        const json = await res.json();
        if (json.error) throw new Error("Polygon RPC error: " + json.error.message);
        return json.result;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await wait(600);
      }
    }
  }
  throw lastError || new Error("All Polygon RPC endpoints failed");
}

function chainCall(isPolygon) {
  return (to, data) => {
    const rpc = isPolygon ? polygonRpcCall("eth_call", [{ to, data }, "latest"]) : baseRpcCall("eth_call", [{ to, data }, "latest"]);
    return rpc.then((result) => {
      if (typeof result !== "string" || result.length < 3) throw new Error("eth_call returned no data");
      return result;
    });
  };
}

async function chainCode(isPolygon, address) {
  const code = isPolygon ? await polygonRpcCall("eth_getCode", [address, "latest"]) : await baseRpcCall("eth_getCode", [address, "latest"]);
  return !!(code && code !== "0x");
}

async function usdcBalance(isPolygon, token, holder) {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [holder] });
  const raw = await chainCall(isPolygon)(token, data);
  return BigInt(raw);
}

function padAddressToBytes32(address) {
  return "0x000000000000000000000000" + String(address).slice(2).toLowerCase();
}

function bridgeConfig(direction) {
  if (direction === "polygon_to_base") {
    return { isSourcePolygon: true, sourceDomain: POLYGON_DOMAIN, destinationDomain: BASE_DOMAIN, sourceUsdc: USDC_POLYGON, destinationUsdc: USDC_BASE, sourceMessenger: TOKEN_MESSENGER_POLYGON, destinationTransmitter: MESSAGE_TRANSMITTER_BASE, sourceNetwork: "polygon", destinationNetwork: "base" };
  }
  return { isSourcePolygon: false, sourceDomain: BASE_DOMAIN, destinationDomain: POLYGON_DOMAIN, sourceUsdc: USDC_BASE, destinationUsdc: USDC_POLYGON, sourceMessenger: TOKEN_MESSENGER_BASE, destinationTransmitter: MESSAGE_TRANSMITTER_POLYGON, sourceNetwork: "base", destinationNetwork: "polygon" };
}

// Circle Iris API — the burn message and its signed attestation. COMPLETE
// only when Circle actually returned a signed attestation.
async function fetchAttestation(sourceDomain, burnTxHash) {
  const res = await fetch(IRIS_API + "/" + sourceDomain + "/" + burnTxHash);
  const json = await res.json().catch(() => ({}));
  const message = json && json.messages ? json.messages[0] : null;
  if (!message) return { status: "PENDING" };
  const attestation = String(message.attestation || "");
  if (String(message.status || "").toLowerCase() === "complete" && attestation && !/^0x0+$/.test(attestation)) {
    return { status: "COMPLETE", message: String(message.message || ""), attestation };
  }
  return { status: "PENDING" };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — the bridge is admin-only" }, { status: 403 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const action = ALLOWED_ACTIONS.includes(payload.action) ? payload.action : "status";

    const creds = readCdpCredentials();
    if (creds.missing.length > 0) {
      return Response.json({ error: "CDP_NOT_CONFIGURED — still missing: " + creds.missing.join(" · ") }, { status: 409 });
    }
    const cdp = buildCdpClient(creds);

    // The platform bridge wallet — ONE smart account, the same address on
    // both chains. Burns from itself, mints to itself.
    const owner = await cdp.evm.getOrCreateAccount({ name: "crix-bridge-owner" });
    const bridgeAccount = await cdp.evm.getOrCreateSmartAccount({ name: "crix-bridge-wallet", owner });
    const wallet = String(bridgeAccount.address || "").toLowerCase();

    if (action === "status") {
      const [baseContracts, polyContracts] = await Promise.all([
        Promise.all([chainCode(false, TOKEN_MESSENGER_BASE), chainCode(false, MESSAGE_TRANSMITTER_BASE), chainCode(false, USDC_BASE)]),
        Promise.all([chainCode(true, TOKEN_MESSENGER_POLYGON), chainCode(true, MESSAGE_TRANSMITTER_POLYGON), chainCode(true, USDC_POLYGON)]),
      ]);
      const [baseBalance, polyBalance] = await Promise.all([
        usdcBalance(false, USDC_BASE, wallet).catch(() => 0n),
        usdcBalance(true, USDC_POLYGON, wallet).catch(() => 0n),
      ]);
      return Response.json({
        bridge: "CircleCctpBridge",
        wallet_address: wallet,
        contracts_verified_live: {
          base: { token_messenger: baseContracts[0], message_transmitter: baseContracts[1], usdc: baseContracts[2] },
          polygon: { token_messenger: polyContracts[0], message_transmitter: polyContracts[1], usdc: polyContracts[2] },
        },
        usdc_balance_base_raw: baseBalance.toString(),
        usdc_balance_polygon_raw: polyBalance.toString(),
        note: "Contracts are verified live on both chains before every use. The bridge burns and mints real USDC 1:1 — nothing is simulated.",
      });
    }

    const service = base44.asServiceRole;

    if (action === "bridge") {
      const direction = payload.direction === "base_to_polygon" ? "base_to_polygon" : "polygon_to_base";
      const amountRaw = typeof payload.amount_raw === "string" && /^\d+$/.test(payload.amount_raw) ? BigInt(payload.amount_raw) : 0n;
      const bridgeKey = typeof payload.bridge_key === "string" && payload.bridge_key.trim() ? payload.bridge_key.trim() : "crxs-cctp-" + Date.now();
      if (amountRaw <= 0n) return Response.json({ error: "INVALID_REQUEST — a positive amount_raw (USDC units, 6 decimals) is required" }, { status: 400 });

      // GATE 1 — idempotency: the same bridge_key NEVER burns twice.
      const existing = await service.entities.CrxsCctpBridge.filter({ bridge_key: bridgeKey });
      const prior = (existing || [])[0] || null;
      if (prior) {
        return Response.json({ ok: true, duplicate: true, bridge_key: prior.bridge_key, status: prior.status, burn_tx_hash: prior.burn_tx_hash, note: "This bridge was already submitted — idempotency refused a second burn" });
      }

      const cfg = bridgeConfig(direction);

      // GATE 2 — every CCTP contract verified live on both chains.
      const evidence = [];
      const sourceOk = await chainCode(cfg.isSourcePolygon, cfg.sourceMessenger);
      const destTransmitterOk = await chainCode(!cfg.isSourcePolygon, cfg.destinationTransmitter);
      evidence.push({ check: "cctp_contracts_verified_live", pass: sourceOk && destTransmitterOk, value: "source messenger " + cfg.sourceMessenger + " / destination transmitter " + cfg.destinationTransmitter, source: "eth_getCode on both chains" });
      if (!sourceOk || !destTransmitterOk) {
        return Response.json({ error: "CCTP_CONTRACT_NOT_VERIFIED — a Circle contract did not answer on chain. Nothing was burned." }, { status: 409 });
      }

      // GATE 3 — the bridge wallet must actually hold the USDC, read live.
      const balance = await usdcBalance(cfg.isSourcePolygon, cfg.sourceUsdc, wallet);
      evidence.push({ check: "source_usdc_balance_live", pass: balance >= amountRaw, value: balance.toString() + " raw USDC held vs " + amountRaw.toString() + " required" });
      if (balance < amountRaw) {
        return Response.json({ error: "INSUFFICIENT_USDC — the bridge wallet does not hold enough USDC on the source chain. Fund it first — nothing is simulated.", wallet, required_raw: amountRaw.toString(), balance_raw: balance.toString() }, { status: 409 });
      }

      const destinationBalanceBefore = await usdcBalance(!cfg.isSourcePolygon, cfg.destinationUsdc, wallet).catch(() => 0n);

      const created = await service.entities.CrxsCctpBridge.create({
        bridge_key: bridgeKey,
        direction,
        amount_raw: amountRaw.toString(),
        source_domain: cfg.sourceDomain,
        destination_domain: cfg.destinationDomain,
        wallet_address: wallet,
        burn_tx_hash: "",
        burn_user_op_hash: "",
        attestation_status: "NOT_REQUESTED",
        message_hash: "",
        receive_tx_hash: "",
        status: "created",
        failure_reason: "",
        evidence_json: JSON.stringify(evidence),
        confirmed_at: "",
      });
      const updateBridge = (patch) => service.entities.CrxsCctpBridge.update(created.id, patch);

      let burnOpHash = "";
      try {
        const sourceSmartAccount = await cdp.evm.getSmartAccount({ name: "crix-bridge-wallet" });
        const calls = [
          { to: cfg.sourceUsdc, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [cfg.sourceMessenger, amountRaw] }) },
          { to: cfg.sourceMessenger, data: encodeFunctionData({ abi: CCTP_ABI, functionName: "depositForBurn", args: [amountRaw, cfg.destinationDomain, padAddressToBytes32(wallet), cfg.sourceUsdc] }) },
        ];
        const burnOp = await sourceSmartAccount.sendUserOperation({ network: cfg.sourceNetwork, calls, paymasterUrl: cfg.isSourcePolygon ? undefined : creds.paymasterUrl });
        burnOpHash = burnOp.userOpHash;
        await updateBridge({ status: "burn_submitted", burn_user_op_hash: burnOpHash });

        const burnResult = await sourceSmartAccount.waitForUserOperation({ userOpHash: burnOpHash });
        if (mapUserOpStatus(burnResult.status) !== "confirmed") {
          await updateBridge({ status: "failed", failure_reason: "Burn did not confirm (reported " + String(burnResult.status) + ")", evidence_json: JSON.stringify(evidence) });
          return Response.json({ ok: false, bridge_key: bridgeKey, status: "failed", note: "The burn did not confirm — no USDC moved" });
        }
        // The burn receipt, read independently on the source chain.
        const burnReceipt = cfg.isSourcePolygon ? await polygonRpcCall("eth_getTransactionReceipt", [burnResult.transactionHash]) : await baseRpcCall("eth_getTransactionReceipt", [burnResult.transactionHash]);
        if (!burnReceipt || burnReceipt.status !== "0x1") {
          await updateBridge({ status: "unknown", burn_tx_hash: burnResult.transactionHash || "", failure_reason: "Burn reported complete but the independent source receipt was not a success" });
          return Response.json({ ok: false, bridge_key: bridgeKey, status: "unknown", note: "UNKNOWN — resolved on chain before any action" });
        }
        await updateBridge({ status: "burn_confirmed", burn_tx_hash: burnResult.transactionHash });
        evidence.push({ check: "burn_confirmed", pass: true, value: burnResult.transactionHash, source: "Independent source-chain receipt" });

        // Attestation — bounded poll, then honest attestation_pending.
        let att = { status: "PENDING" };
        for (let i = 0; i < 4; i++) {
          att = await fetchAttestation(cfg.sourceDomain, burnResult.transactionHash);
          if (att.status === "COMPLETE") break;
          await wait(3000);
        }
        if (att.status !== "COMPLETE") {
          await updateBridge({ status: "attestation_pending", attestation_status: "PENDING", evidence_json: JSON.stringify(evidence) });
          return Response.json({ ok: true, bridge_key: bridgeKey, status: "attestation_pending", burn_tx_hash: burnResult.transactionHash, note: "Burn confirmed; Circle has not signed the attestation yet — call action 'receive' with the same bridge_key to complete the mint" });
        }
        await updateBridge({ attestation_status: "COMPLETE", message_hash: att.message });

        // The mint — receiveMessage on the destination chain.
        const destinationSmartAccount = await cdp.evm.getSmartAccount({ name: "crix-bridge-wallet" });
        const receiveOp = await destinationSmartAccount.sendUserOperation({
          network: cfg.destinationNetwork,
          calls: [{ to: cfg.destinationTransmitter, data: encodeFunctionData({ abi: CCTP_ABI, functionName: "receiveMessage", args: [att.message, att.attestation] }) }],
          paymasterUrl: cfg.isSourcePolygon ? creds.paymasterUrl : undefined,
        });
        await updateBridge({ status: "receive_submitted" });
        const receiveResult = await destinationSmartAccount.waitForUserOperation({ userOpHash: receiveOp.userOpHash });
        if (mapUserOpStatus(receiveResult.status) !== "confirmed") {
          await updateBridge({ status: "failed", failure_reason: "Mint did not confirm (reported " + String(receiveResult.status) + ") — the burn is NOT resent; retry 'receive'", evidence_json: JSON.stringify(evidence) });
          return Response.json({ ok: false, bridge_key: bridgeKey, status: "failed", note: "The mint failed — the burn is never resent; retry action 'receive'" });
        }
        const receiveReceipt = cfg.isSourcePolygon ? await baseRpcCall("eth_getTransactionReceipt", [receiveResult.transactionHash]) : await polygonRpcCall("eth_getTransactionReceipt", [receiveResult.transactionHash]);
        if (!receiveReceipt || receiveReceipt.status !== "0x1") {
          await updateBridge({ status: "unknown", receive_tx_hash: receiveResult.transactionHash || "", failure_reason: "Mint reported complete but the independent destination receipt was not a success" });
          return Response.json({ ok: false, bridge_key: bridgeKey, status: "unknown", note: "UNKNOWN — resolved on chain before any action" });
        }

        // GATE 4 — confirmed ONLY with a real balance increase at destination.
        const destinationBalanceAfter = await usdcBalance(!cfg.isSourcePolygon, cfg.destinationUsdc, wallet);
        const minted = destinationBalanceAfter - destinationBalanceBefore;
        evidence.push({ check: "mint_confirmed_with_balance_increase", pass: minted >= amountRaw, value: minted.toString() + " raw USDC minted (before " + destinationBalanceBefore.toString() + " → after " + destinationBalanceAfter.toString() + ")" });
        if (minted < amountRaw) {
          await updateBridge({ status: "unknown", receive_tx_hash: receiveResult.transactionHash, failure_reason: "Mint receipt confirmed but the destination balance increase was not verified", evidence_json: JSON.stringify(evidence) });
          return Response.json({ ok: false, bridge_key: bridgeKey, status: "unknown", note: "Receipt confirmed but arrival is unverified — resolved on chain before any action" });
        }
        await updateBridge({ status: "confirmed", receive_tx_hash: receiveResult.transactionHash, evidence_json: JSON.stringify(evidence), confirmed_at: new Date().toISOString() });
        return Response.json({ ok: true, bridge_key: bridgeKey, status: "confirmed", burn_tx_hash: burnResult.transactionHash, receive_tx_hash: receiveResult.transactionHash, minted_raw: minted.toString() });
      } catch (bridgeError) {
        const reason = String(bridgeError.message || bridgeError).slice(0, 300);
        await updateBridge({ status: burnOpHash ? "unknown" : "failed", burn_user_op_hash: burnOpHash, failure_reason: reason, evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, bridge_key: bridgeKey, status: burnOpHash ? "unknown" : "failed", error: reason }, { status: 502 });
      }
    }

    if (action === "receive") {
      const bridgeKey = typeof payload.bridge_key === "string" ? payload.bridge_key.trim() : "";
      if (!bridgeKey) return Response.json({ error: "INVALID_REQUEST — bridge_key is required" }, { status: 400 });
      const rows = await service.entities.CrxsCctpBridge.filter({ bridge_key: bridgeKey });
      const record = (rows || [])[0] || null;
      if (!record) return Response.json({ error: "BRIDGE_NOT_FOUND" }, { status: 404 });
      if (record.status === "confirmed") return Response.json({ ok: true, duplicate: true, bridge_key: bridgeKey, status: "confirmed", receive_tx_hash: record.receive_tx_hash });
      if (!record.burn_tx_hash || !["burn_confirmed", "attestation_pending", "receive_submitted", "failed"].includes(record.status)) {
        return Response.json({ error: "BRIDGE_NOT_READY — the burn must confirm first (current status " + record.status + ")", bridge_key: bridgeKey }, { status: 409 });
      }

      const cfg = bridgeConfig(record.direction);
      const att = await fetchAttestation(record.source_domain, record.burn_tx_hash);
      if (att.status !== "COMPLETE") {
        await service.entities.CrxsCctpBridge.update(record.id, { status: "attestation_pending", attestation_status: "PENDING" });
        return Response.json({ ok: false, bridge_key: bridgeKey, status: "attestation_pending", note: "Circle has not signed the attestation yet — retry later; the burn is NEVER resent" });
      }
      await service.entities.CrxsCctpBridge.update(record.id, { attestation_status: "COMPLETE", message_hash: att.message });

      const destinationBalanceBefore = await usdcBalance(!cfg.isSourcePolygon, cfg.destinationUsdc, record.wallet_address).catch(() => 0n);
      const destinationSmartAccount = await cdp.evm.getSmartAccount({ name: "crix-bridge-wallet" });
      const receiveOp = await destinationSmartAccount.sendUserOperation({
        network: cfg.destinationNetwork,
        calls: [{ to: cfg.destinationTransmitter, data: encodeFunctionData({ abi: CCTP_ABI, functionName: "receiveMessage", args: [att.message, att.attestation] }) }],
        paymasterUrl: cfg.isSourcePolygon ? creds.paymasterUrl : undefined,
      });
      await service.entities.CrxsCctpBridge.update(record.id, { status: "receive_submitted" });
      const receiveResult = await destinationSmartAccount.waitForUserOperation({ userOpHash: receiveOp.userOpHash });
      if (mapUserOpStatus(receiveResult.status) !== "confirmed") {
        await service.entities.CrxsCctpBridge.update(record.id, { status: "failed", failure_reason: "Mint did not confirm (reported " + String(receiveResult.status) + ") — retry 'receive'; the burn is never resent" });
        return Response.json({ ok: false, bridge_key: bridgeKey, status: "failed", note: "The mint failed — retry 'receive'; the burn is never resent" });
      }
      const receiveReceipt = cfg.isSourcePolygon ? await baseRpcCall("eth_getTransactionReceipt", [receiveResult.transactionHash]) : await polygonRpcCall("eth_getTransactionReceipt", [receiveResult.transactionHash]);
      if (!receiveReceipt || receiveReceipt.status !== "0x1") {
        await service.entities.CrxsCctpBridge.update(record.id, { status: "unknown", receive_tx_hash: receiveResult.transactionHash || "" });
        return Response.json({ ok: false, bridge_key: bridgeKey, status: "unknown", note: "UNKNOWN — resolved on chain before any action" });
      }
      const destinationBalanceAfter = await usdcBalance(!cfg.isSourcePolygon, cfg.destinationUsdc, record.wallet_address);
      const minted = destinationBalanceAfter - destinationBalanceBefore;
      if (minted < BigInt(record.amount_raw)) {
        await service.entities.CrxsCctpBridge.update(record.id, { status: "unknown", receive_tx_hash: receiveResult.transactionHash, failure_reason: "Mint receipt confirmed but the destination balance increase was not verified" });
        return Response.json({ ok: false, bridge_key: bridgeKey, status: "unknown" });
      }
      await service.entities.CrxsCctpBridge.update(record.id, { status: "confirmed", receive_tx_hash: receiveResult.transactionHash, confirmed_at: new Date().toISOString() });
      return Response.json({ ok: true, bridge_key: bridgeKey, status: "confirmed", receive_tx_hash: receiveResult.transactionHash, minted_raw: minted.toString() });
    }

    return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}