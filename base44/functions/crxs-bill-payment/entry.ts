import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "npm:viem@2.56.3";
import { secrets } from "base44:runtime";
import { rpcCall, isValidEvmAddress } from "../../shared/crxsMainnetRpc.ts";
import { readCdpCredentials, buildCdpClient, readTransferGate, readMainnetCrxsContract, mapUserOpStatus, CRXS_ERC20_PAYMASTER_BASE_MAINNET } from "../../shared/cdpAdapter.ts";
import { AERODROME_ROUTER, AERODROME_POOL_FACTORY, WETH_BASE_MAINNET } from "../../shared/gasFeeEngine.ts";
import { flwV3Request, fetchUsdNgnRate } from "../../shared/flutterwaveV3.ts";

// CRIXCOIN bill payments (Nigeria) — AIRTIME, MOBILEDATA, CABLEBILLS,
// INTSERVICE, UTILITYBILLS, TAX. Money safety in order, none skippable:
//   1. Idempotency: the same bill_key NEVER pays twice
//   2. External transfer gate must be OPERATIONAL and the production CRXS
//      contract must exist — the CRIXCOIN debit is a real on-chain transfer
//   3. The CRXS price is computed ONLY from live quotes: the real Aerodrome
//      pool route (CRXS → WETH → USDC) plus the real USD→NGN rate — never a
//      typed or guessed rate
//   4. CRIXCOIN is debited FIRST and the bill provider is called ONLY after
//      an independently verified Base Mainnet receipt
//   5. A provider failure triggers a REAL on-chain refund; a refund that
//      cannot complete is refund_pending with evidence — never silently lost
// (User-facing copy shows only CRIXCOIN — no provider or chain terminology.)

const BILL_CATEGORIES = ["AIRTIME", "MOBILEDATA", "CABLEBILLS", "INTSERVICE", "UTILITYBILLS", "TAX"];
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
]);
const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

async function ethCall(to, data) {
  const result = await rpcCall("eth_call", [{ to, data }, "latest"]);
  if (typeof result !== "string" || result.length < 3) throw new Error("eth_call returned no data");
  return result;
}

// Live CRXS price: the real Aerodrome route CRXS → WETH → USDC, quoted by the
// router itself. No pool, no route → no price → the bill honestly refuses.
async function quoteUsdcForOneCrxs(contract) {
  const routes = [
    { from: contract, to: WETH_BASE_MAINNET, stable: false, factory: AERODROME_POOL_FACTORY },
    { from: WETH_BASE_MAINNET, to: USDC_BASE_MAINNET, stable: false, factory: AERODROME_POOL_FACTORY },
  ];
  const raw = await ethCall(AERODROME_ROUTER, encodeFunctionData({ abi: ROUTER_ABI, functionName: "getAmountsOut", args: [10n ** 18n, routes] }));
  const amounts = decodeFunctionResult({ abi: ROUTER_ABI, functionName: "getAmountsOut", data: raw });
  return { usdcPerCrxsRaw: BigInt(amounts[amounts.length - 1]), routes };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const billKey = typeof payload.bill_key === "string" ? payload.bill_key.trim() : "";
    const billCategory = typeof payload.bill_category === "string" ? payload.bill_category.trim().toUpperCase() : "";
    const billerName = typeof payload.biller_name === "string" ? payload.biller_name.trim() : "";
    const customerReference = typeof payload.customer_reference === "string" ? payload.customer_reference.trim() : "";
    const amountNgn = Number(payload.amount_ngn);

    if (!billKey || !BILL_CATEGORIES.includes(billCategory) || !billerName || !customerReference || !(amountNgn > 0)) {
      return Response.json({ error: "INVALID_REQUEST — bill_key, bill_category (" + BILL_CATEGORIES.join("/") + "), biller_name, customer_reference and a positive amount_ngn are required" }, { status: 400 });
    }

    const service = base44.asServiceRole;

    // GATE 1 — idempotency: the same bill_key NEVER pays twice.
    const existing = await service.entities.CrxsBillPayment.filter({ bill_key: billKey });
    const prior = (existing || [])[0] || null;
    if (prior) {
      return Response.json({ ok: true, duplicate: true, bill_key: prior.bill_key, status: prior.status, note: "This bill was already submitted — idempotency refused a second payment" });
    }

    // GATE 2 — the CRIXCOIN debit is a real on-chain transfer: the external
    // transfer gate must be OPERATIONAL and the production contract must exist.
    const gateState = await readTransferGate(service);
    if (gateState !== "OPERATIONAL") {
      return Response.json({ error: "CRIXCOIN_PAYMENTS_PAUSED — on-chain CRIXCOIN payments are not enabled yet. No CRIXCOIN was debited and no bill was paid.", gate_state: gateState }, { status: 423 });
    }
    const contract = await readMainnetCrxsContract(service);
    if (!contract) {
      return Response.json({ error: "CONTRACT_NOT_DEPLOYED — no production CRIXCOIN exists yet. Nothing was debited." }, { status: 409 });
    }

    // The user's CRIXCOIN account.
    const accounts = await service.entities.CrxsSmartAccount.filter({ user_id: user.id });
    const account = (accounts || [])[0] || null;
    if (!account || account.status !== "CREATED" || !account.account_address) {
      return Response.json({ error: "NO_CRIXCOIN_ADDRESS — you have no CRIXCOIN address yet" }, { status: 409 });
    }

    // The platform bill wallet — CRIXCOIN debits land here and refunds leave
    // from here, so it must be configured.
    const billWallet = secrets.get("CRXS_BILL_PAYMENT_WALLET") || "";
    if (!isValidEvmAddress(billWallet)) {
      return Response.json({ error: "BILL_WALLET_NOT_CONFIGURED — the platform bill collection address is not set yet. Nothing was debited." }, { status: 409 });
    }

    // GATE 3 — live pricing only.
    let price;
    try {
      const quote = await quoteUsdcForOneCrxs(contract);
      const fx = await fetchUsdNgnRate();
      if (!fx.ok || quote.usdcPerCrxsRaw <= 0n) throw new Error("no live price");
      // CRXS needed = amountNGN ÷ (USD→NGN rate × USDC per CRXS). Computed
      // in high precision and rounded UP so the price is never short.
      const crxsNeededRaw = BigInt(Math.ceil((amountNgn * 1e18 * 1e6) / (fx.rate * Number(quote.usdcPerCrxsRaw))));
      if (crxsNeededRaw <= 0n) throw new Error("price computed to zero");
      price = {
        crxs_needed_raw: crxsNeededRaw.toString(),
        usdc_per_crxs_raw: quote.usdcPerCrxsRaw.toString(),
        usd_ngn_rate: fx.rate,
        evidence: [
          { check: "pool_route_quote", pass: true, value: quote.usdcPerCrxsRaw.toString() + " USDC units per CRXS", source: "Aerodrome Router getAmountsOut (CRXS → WETH → USDC) — live" },
          { check: "fx_rate", pass: true, value: String(fx.rate) + " NGN per USD", source: "Flutterwave transfers/rates — live" },
        ],
      };
    } catch (priceError) {
      return Response.json({ error: "PRICE_UNAVAILABLE — CRIXCOIN cannot be priced yet (no live market route). Nothing was debited and no bill was paid." }, { status: 409 });
    }

    // The user must actually hold the CRIXCOIN — checked live before any op.
    const balanceRaw = BigInt(await ethCall(contract, encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [account.account_address] })));
    if (balanceRaw < BigInt(price.crxs_needed_raw)) {
      return Response.json({ error: "INSUFFICIENT_CRIXCOIN — you do not hold enough CRIXCOIN for this bill", required_raw: price.crxs_needed_raw, balance_raw: balanceRaw.toString() }, { status: 409 });
    }

    const creds = readCdpCredentials();
    if (creds.missing.length > 0) {
      return Response.json({ error: "CDP_NOT_CONFIGURED — still missing: " + creds.missing.join(" · ") + ". Nothing was debited." }, { status: 409 });
    }

    // Record the bill BEFORE any movement.
    const bill = await service.entities.CrxsBillPayment.create({
      bill_key: billKey,
      user_id: user.id,
      bill_category: billCategory,
      biller_name: billerName,
      customer_reference: customerReference,
      amount_ngn: amountNgn,
      crxs_amount_raw: price.crxs_needed_raw,
      price_evidence_json: JSON.stringify(price.evidence),
      crxs_debit_tx_hash: "",
      crxs_debit_user_op_hash: "",
      flutterwave_ref: "",
      status: "debit_pending",
      crxs_refund_tx_hash: "",
      failure_reason: "",
      evidence_json: "[]",
    });
    const updateBill = (patch) => service.entities.CrxsBillPayment.update(bill.id, patch);

    // GATE 4 — the CRIXCOIN debit, a real on-chain transfer confirmed by an
    // independent receipt BEFORE the provider is ever called.
    const evidence = [...price.evidence];
    let debitHash = "";
    try {
      const cdp = buildCdpClient(creds);
      const smartAccount = await cdp.evm.getSmartAccount({ name: account.account_name });
      const calls = [{ to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [billWallet, BigInt(price.crxs_needed_raw)] }) }];

      // Gas is paid in CRIXCOIN — top up the paymaster allowance if low.
      let allowance = 0n;
      try {
        allowance = BigInt(await ethCall(contract, encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [account.account_address, CRXS_ERC20_PAYMASTER_BASE_MAINNET] })));
      } catch (e) { allowance = 0n; }
      if (allowance < BigInt(price.crxs_needed_raw) * 100n) {
        calls.push({ to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [CRXS_ERC20_PAYMASTER_BASE_MAINNET, BigInt(price.crxs_needed_raw) * 1000n] }) });
      }

      const userOp = await smartAccount.sendUserOperation({
        network: "base",
        calls,
        paymasterUrl: creds.paymasterUrl,
        context: { erc20: { tokenAddress: contract } },
      });
      debitHash = userOp.userOpHash;
      await updateBill({ crxs_debit_user_op_hash: debitHash });

      const result = await smartAccount.waitForUserOperation({ userOpHash: debitHash });
      if (mapUserOpStatus(result.status) !== "confirmed") {
        await updateBill({ status: "failed", failure_reason: "Debit did not confirm (reported " + String(result.status) + ") — no bill was paid", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, bill_key: billKey, status: "failed", note: "The CRIXCOIN debit did not confirm — no bill was paid" });
      }
      const receipt = await rpcCall("eth_getTransactionReceipt", [result.transactionHash]);
      if (!receipt || receipt.status !== "0x1") {
        await updateBill({ status: "unknown", crxs_debit_tx_hash: result.transactionHash || "", failure_reason: "Debit reported complete but the independent receipt was not a success — resolved on chain before any action", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, bill_key: billKey, status: "unknown", note: "The debit's fate is being resolved on chain — no bill was paid and nothing is blindly resent" });
      }
      await updateBill({ status: "debit_confirmed", crxs_debit_tx_hash: result.transactionHash });
      evidence.push({ check: "crxs_debit_confirmed", pass: true, value: result.transactionHash, source: "Independent Base Mainnet receipt" });

      // GATE 5 — the provider is called only after the debit confirmed.
      await updateBill({ status: "bill_submitted" });
      const flw = await flwV3Request("POST", "/v3/bills", {
        country: "NG",
        customer: customerReference,
        amount: amountNgn,
        recurrence: "ONCE",
        type: billCategory,
        biller_name: billerName,
        reference: billKey,
      });
      const flwData = flw.json && flw.json.data ? flw.json.data : null;
      const flwSuccess = flw.ok && flw.json && String(flw.json.status) === "success" && flwData;
      evidence.push({ check: "bill_provider_response", pass: !!flwSuccess, value: flw.ok ? String((flw.json && flw.json.status) || "ok") + (flwData && flwData.tx_ref ? " tx_ref=" + flwData.tx_ref : "") : "HTTP " + flw.status, source: "Provider bills API live response" });

      if (flwSuccess) {
        await updateBill({ status: "confirmed", flutterwave_ref: String(flwData.tx_ref || billKey), evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: true, bill_key: billKey, status: "confirmed", crixcoin_spent_raw: price.crxs_needed_raw, note: "Bill paid successfully" });
      }

      // Provider refused — a REAL refund of the debited CRIXCOIN follows.
      await updateBill({ status: "failed", failure_reason: "Provider refused: " + String((flw.json && flw.json.message) || "HTTP " + flw.status).slice(0, 200), evidence_json: JSON.stringify(evidence) });

      // The refund executes from the platform bill wallet, which must be a
      // smart account this project controls.
      const owner = await cdp.evm.getOrCreateAccount({ name: "crix-platform-bill-owner" });
      const billAccount = await cdp.evm.getOrCreateSmartAccount({ name: "crix-platform-bill-wallet", owner });
      const billAccountAddress = String(billAccount.address || "").toLowerCase();
      if (billAccountAddress !== String(billWallet).toLowerCase()) {
        await updateBill({ status: "refund_pending", failure_reason: "Provider failed AND the configured bill wallet is not the platform bill smart account — the refund needs manual resolution", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, bill_key: billKey, status: "refund_pending", note: "The bill failed and the refund could not be executed automatically — flagged for resolution" }, { status: 502 });
      }
      const billSmartAccount = await cdp.evm.getSmartAccount({ name: "crix-platform-bill-wallet" });
      const refundOp = await billSmartAccount.sendUserOperation({
        network: "base",
        calls: [{ to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [account.account_address, BigInt(price.crxs_needed_raw)] }) }],
        paymasterUrl: creds.paymasterUrl,
      });
      const refundResult = await billSmartAccount.waitForUserOperation({ userOpHash: refundOp.userOpHash });
      if (mapUserOpStatus(refundResult.status) === "confirmed") {
        const refundReceipt = await rpcCall("eth_getTransactionReceipt", [refundResult.transactionHash]);
        if (refundReceipt && refundReceipt.status === "0x1") {
          await updateBill({ status: "refunded", crxs_refund_tx_hash: refundResult.transactionHash, evidence_json: JSON.stringify([...evidence, { check: "crxs_refund_confirmed", pass: true, value: refundResult.transactionHash, source: "Independent Base Mainnet receipt" }]) });
          return Response.json({ ok: false, bill_key: billKey, status: "refunded", note: "The bill could not be paid — your CRIXCOIN was returned in full" });
        }
      }
      await updateBill({ status: "refund_pending", failure_reason: "Provider failed and the refund did not confirm (reported " + String(refundResult.status) + ") — resolved on chain before any action", evidence_json: JSON.stringify(evidence) });
      return Response.json({ ok: false, bill_key: billKey, status: "refund_pending", note: "The bill failed and the refund is being resolved on chain" }, { status: 502 });
    } catch (flowError) {
      const reason = String(flowError.message || flowError).slice(0, 300);
      await updateBill({ status: debitHash ? "unknown" : "failed", crxs_debit_user_op_hash: debitHash, failure_reason: reason, evidence_json: JSON.stringify(evidence) });
      return Response.json({ ok: false, bill_key: billKey, status: debitHash ? "unknown" : "failed", error: reason, note: debitHash ? "UNKNOWN — resolved on chain before any action, never blindly resent" : "Failed before any movement — nothing was debited or paid" }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}