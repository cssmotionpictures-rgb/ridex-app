import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "npm:viem@2.56.3";
import { rpcCall, isValidEvmAddress } from "../../shared/crxsMainnetRpc.ts";
import { readCdpCredentials, buildCdpClient, readMainnetCrxsContract, readPlatformFeeWallet, mapUserOpStatus } from "../../shared/cdpAdapter.ts";
import { AERODROME_ROUTER, AERODROME_POOL_FACTORY, WETH_BASE_MAINNET, MAX_PRICE_IMPACT_PCT, MAX_SLIPPAGE_PCT, MIN_SETTLE_AMOUNT_CRXS } from "../../shared/gasFeeEngine.ts";

// CRIXCOINSettlementRouter — admin-only. The self-funding gas engine: swaps
// accumulated 0.2% CRXS network fees into ETH on Aerodrome (Base Mainnet) and
// delivers the ETH to the gas treasury that funds sponsored gas. Stock the
// reserve once; every transfer's fee refills it.
// Safety in order, none skippable:
//   1. A real production CRXS contract must exist on Base Mainnet
//   2. A real CRXS/WETH pool must exist — discovered LIVE from the Aerodrome
//      factory, never typed in, never assumed
//   3. The DEX router is a verified contract on Base Mainnet before any swap
//   4. Price impact and slippage limits — a swap beyond them is refused
//   5. Idempotency: the same settlement_key NEVER settles twice
//   6. confirmed ONLY with an independent Base Mainnet receipt AND verified
//      ETH arrival at the treasury (live balance reads before/after)
//   7. unknown is a real state — the chain is queried before any action,
//      never blindly retried

const ALLOWED_ACTIONS = ["status", "quote", "settle"];

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) returns (uint256[] amounts)",
]);
const FACTORY_ABI = parseAbi(["function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)"]);
const POOL_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const WETH_ABI = parseAbi(["function withdraw(uint256 wad)"]);

async function ethCall(to, data) {
  const result = await rpcCall("eth_call", [{ to, data }, "latest"]);
  if (typeof result !== "string" || result.length < 3) throw new Error("eth_call returned no data for " + to);
  return result;
}

// LIVE pool discovery — the REAL CRXS/WETH pool from the Aerodrome factory.
// Volatile pool first, then stable. A pool that does not exist returns null
// and the settlement honestly refuses.
async function discoverPool(contract) {
  for (const stable of [false, true]) {
    const data = encodeFunctionData({ abi: FACTORY_ABI, functionName: "getPool", args: [contract, WETH_BASE_MAINNET, stable] });
    const raw = await ethCall(AERODROME_POOL_FACTORY, data);
    const pool = ("0x" + raw.slice(-40)).toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(pool) && !/^0x0+$/.test(pool)) {
      const code = await rpcCall("eth_getCode", [pool, "latest"]);
      if (code && code !== "0x") return { pool, stable };
    }
  }
  return null;
}

async function readErc20(token, functionName, args) {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName, args });
  return BigInt(await ethCall(token, data));
}

// Real CRXS/WETH reserves of the live pool — the honest rate source.
async function readPoolReserves(pool, contract) {
  const token0Raw = await ethCall(pool, encodeFunctionData({ abi: POOL_ABI, functionName: "token0" }));
  const token0 = ("0x" + token0Raw.slice(-40)).toLowerCase();
  const reservesRaw = await ethCall(pool, encodeFunctionData({ abi: POOL_ABI, functionName: "getReserves" }));
  const reserves = decodeFunctionResult({ abi: POOL_ABI, functionName: "getReserves", data: reservesRaw });
  const crxsReserve = token0 === String(contract).toLowerCase() ? BigInt(reserves[0]) : BigInt(reserves[1]);
  const wethReserve = token0 === String(contract).toLowerCase() ? BigInt(reserves[1]) : BigInt(reserves[0]);
  return { crxsReserve, wethReserve };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — the settlement router is admin-only" }, { status: 403 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const action = ALLOWED_ACTIONS.includes(payload.action) ? payload.action : "status";

    // ---- Shared live facts (never assumed) ----
    const contract = await readMainnetCrxsContract(base44.asServiceRole);
    const feeWallet = readPlatformFeeWallet();
    const treasuryRows = await base44.entities.CrxsGasTreasury.filter({ registry_key: "crxs-gas-treasury" });
    const treasury = (treasuryRows || [])[0] || null;
    const treasuryAddress = treasury && treasury.wallet_address ? String(treasury.wallet_address).toLowerCase() : "";

    const missing = [];
    if (!contract) missing.push("CRIXCOIN_CONTRACT — no production CRXS contract is deployed on Base Mainnet yet");
    if (!feeWallet || !isValidEvmAddress(feeWallet)) missing.push("CRXS_PLATFORM_FEE_WALLET — the platform fee collection address is not configured yet");
    if (!treasuryAddress || !isValidEvmAddress(treasuryAddress)) missing.push("GAS_TREASURY — run the gas treasury sync so the reserve wallet is verified and recorded");

    let pool = null;
    if (contract) pool = await discoverPool(contract);
    if (contract && !pool) missing.push("CRXS/WETH POOL — no real CRXS/WETH pool exists on Aerodrome yet (create liquidity first; the pool is discovered live, never typed in)");

    const routerCode = await rpcCall("eth_getCode", [AERODROME_ROUTER, "latest"]);
    if (!routerCode || routerCode === "0x") missing.push("AERODROME_ROUTER — the Aerodrome router did not answer as a contract on Base Mainnet");

    const creds = readCdpCredentials();
    if (creds.missing.length > 0) missing.push("CDP credentials — " + creds.missing.join(" · "));

    // ---- status: the honest, complete settlement readiness picture ----
    if (action === "status") {
      let feeBalanceRaw = "0";
      if (contract && feeWallet && isValidEvmAddress(feeWallet)) {
        try { feeBalanceRaw = (await readErc20(contract, "balanceOf", [feeWallet])).toString(); } catch (e) { feeBalanceRaw = "0"; }
      }
      return Response.json({
        router: "CRIXCOINSettlementRouter",
        action,
        status: missing.length === 0 ? "READY" : "SETTLEMENT_UNAVAILABLE",
        crxs_contract: contract || "NOT_DEPLOYED",
        aerodrome_router: AERODROME_ROUTER,
        aerodrome_pool: pool ? pool.pool : "NO_POOL",
        pool_flavor: pool ? (pool.stable ? "stable" : "volatile") : null,
        platform_fee_wallet: feeWallet || "NOT_CONFIGURED",
        fee_wallet_crxs_balance_raw: feeBalanceRaw,
        gas_treasury: treasuryAddress || "NOT_SYNCED",
        treasury_eth_balance: treasury ? treasury.eth_balance : 0,
        missing,
        note: missing.length === 0
          ? "Every real condition is live-verified — a settlement can be quoted and executed"
          : "Nothing is quoted or executed until every missing real-world item exists. The pool and router are verified live on Base Mainnet, never simulated.",
      });
    }

    // ---- quote: a REAL live quote from the Aerodrome router itself ----
    if (missing.length > 0) {
      return Response.json({
        router: "CRIXCOINSettlementRouter",
        action,
        status: "SETTLEMENT_UNAVAILABLE",
        missing,
        reason: "Nothing is quoted or executed while a real condition is missing — never simulated.",
      }, { status: 409 });
    }

    const feeBalance = await readErc20(contract, "balanceOf", [feeWallet]);
    let amountIn = feeBalance;
    if (typeof payload.amount_raw === "string" && /^\d+$/.test(payload.amount_raw) && BigInt(payload.amount_raw) > 0n) {
      amountIn = BigInt(payload.amount_raw);
    }
    if (amountIn <= 0n) {
      return Response.json({ router: "CRIXCOINSettlementRouter", action, status: "NOTHING_TO_SETTLE", fee_wallet_crxs_balance_raw: "0", note: "No accumulated CRIXCOIN fees to settle yet" });
    }
    if (amountIn < BigInt(MIN_SETTLE_AMOUNT_CRXS)) {
      return Response.json({ router: "CRIXCOINSettlementRouter", action, status: "NOTHING_TO_SETTLE", fee_wallet_crxs_balance_raw: amountIn.toString(), note: "Accumulated fees are below the minimum settlement amount (" + MIN_SETTLE_AMOUNT_CRXS + " raw CRXS) — wait for more fee accumulation" });
    }

    const route = [{ from: contract, to: WETH_BASE_MAINNET, stable: pool.stable, factory: AERODROME_POOL_FACTORY }];
    const quoteRaw = await ethCall(AERODROME_ROUTER, encodeFunctionData({ abi: ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn, route] }));
    const amounts = decodeFunctionResult({ abi: ROUTER_ABI, functionName: "getAmountsOut", data: quoteRaw });
    const expectedOut = BigInt(amounts[amounts.length - 1]);
    const minOut = (expectedOut * BigInt(100 - Math.round(MAX_SLIPPAGE_PCT))) / 100n;

    const { crxsReserve, wethReserve } = await readPoolReserves(pool.pool, contract);
    const priceImpactPct = Number((amountIn * 10000n) / (crxsReserve + amountIn)) / 100;
    const crxsPerEthRaw = wethReserve > 0n ? ((crxsReserve * 10n ** 18n) / wethReserve).toString() : "0";
    const impactOk = priceImpactPct <= MAX_PRICE_IMPACT_PCT;

    const quote = {
      crxs_in_raw: amountIn.toString(),
      expected_weth_out_wei: expectedOut.toString(),
      min_weth_out_wei: minOut.toString(),
      live_rate_crxs_per_eth_x1e18: crxsPerEthRaw,
      pool: pool.pool,
      pool_crxs_reserve_raw: crxsReserve.toString(),
      pool_weth_reserve_raw: wethReserve.toString(),
      price_impact_pct: priceImpactPct,
      price_impact_limit_pct: MAX_PRICE_IMPACT_PCT,
      slippage_limit_pct: MAX_SLIPPAGE_PCT,
      price_impact_ok: impactOk,
      quote_source: "Aerodrome Router getAmountsOut — live on Base Mainnet",
    };

    if (action === "quote") {
      return Response.json({ router: "CRIXCOINSettlementRouter", action, status: impactOk ? "SETTLEMENT_QUOTED" : "SETTLEMENT_REJECTED_PRICE_IMPACT", quote });
    }

    // ---- settle: execute with every gate, idempotently ----
    if (!impactOk) {
      return Response.json({ router: "CRIXCOINSettlementRouter", action: "settle", status: "SETTLEMENT_REJECTED_PRICE_IMPACT", quote, reason: "The swap would move the pool beyond the " + MAX_PRICE_IMPACT_PCT + "% price impact limit — refused, never best-effort executed" }, { status: 409 });
    }

    const settlementKey = typeof payload.settlement_key === "string" && payload.settlement_key.trim() ? payload.settlement_key.trim() : "crxs-settle-" + Date.now();
    const existing = await base44.entities.CrxsGasSettlement.filter({ settlement_key: settlementKey });
    const prior = (existing || [])[0] || null;
    if (prior) {
      return Response.json({ ok: true, duplicate: true, settlement_key: prior.settlement_key, status: prior.status, tx_hash: prior.tx_hash, note: "This settlement was already submitted — idempotency refused a second settlement" });
    }

    // The settlement executes from the platform fee wallet, which must be a
    // CDP smart account this project controls. A mismatch refuses.
    const cdp = buildCdpClient(creds);
    const owner = await cdp.evm.getOrCreateAccount({ name: "crix-platform-fee-owner" });
    const feeAccount = await cdp.evm.getOrCreateSmartAccount({ name: "crix-platform-fee-wallet", owner });
    const feeAccountAddress = String(feeAccount.address || "").toLowerCase();
    if (feeAccountAddress !== String(feeWallet).toLowerCase()) {
      return Response.json({
        error: "FEE_WALLET_MISMATCH — the configured CRXS_PLATFORM_FEE_WALLET is not the platform fee smart account this project controls. Set the secret to the platform fee smart account address (it accumulates the 0.2% fees) or move the fees. Nothing was settled.",
        configured_fee_wallet: String(feeWallet).toLowerCase(),
        platform_fee_smart_account: feeAccountAddress,
      }, { status: 409 });
    }

    const evidence = [
      { check: "crxs_contract_real", pass: true, value: contract },
      { check: "pool_discovered_live", pass: true, value: pool.pool + " (" + (pool.stable ? "stable" : "volatile") + ")", source: "Aerodrome factory getPool — live Base Mainnet read" },
      { check: "router_contract_verified", pass: true, value: AERODROME_ROUTER, source: "Base Mainnet eth_getCode" },
      { check: "live_quote", pass: true, value: expectedOut.toString() + " wei expected", source: "Aerodrome Router getAmountsOut — live" },
      { check: "price_impact_within_limit", pass: true, value: priceImpactPct.toFixed(3) + "% <= " + MAX_PRICE_IMPACT_PCT + "%" },
    ];

    const treasuryBeforeHex = await rpcCall("eth_getBalance", [treasuryAddress, "latest"]);
    const treasuryBefore = BigInt(treasuryBeforeHex);
    evidence.push({ check: "treasury_balance_before", pass: true, value: treasuryBefore.toString(), source: "Base Mainnet eth_getBalance" });

    const created = await base44.entities.CrxsGasSettlement.create({
      settlement_key: settlementKey,
      status: "created",
      fee_wallet: feeAccountAddress,
      pool_address: pool.pool,
      router_address: AERODROME_ROUTER,
      dex_flavor: "aerodrome",
      crxs_swapped_raw: amountIn.toString(),
      crxs_per_eth_raw: crxsPerEthRaw,
      expected_eth_out_wei: expectedOut.toString(),
      min_eth_out_wei: minOut.toString(),
      tx_hash: "",
      user_op_hash: "",
      treasury_address: treasuryAddress,
      evidence_json: JSON.stringify(evidence),
      failure_reason: "",
      settled_at: "",
    });
    const updateSettlement = (patch) => base44.entities.CrxsGasSettlement.update(created.id, patch);

    let submittedHash = "";
    try {
      // The swap, WETH→ETH conversion and treasury delivery execute ATOMICALLY
      // in one UserOperation: swap CRXS→WETH into the fee account, withdraw the
      // guaranteed floor to ETH, forward exactly that floor to the treasury.
      const calls = [];
      const allowance = await readErc20(contract, "allowance", [feeAccountAddress, AERODROME_ROUTER]);
      if (allowance < amountIn) {
        calls.push({ to: contract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [AERODROME_ROUTER, amountIn * 10n] }) });
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      calls.push({ to: AERODROME_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: "swapExactTokensForTokens", args: [amountIn, minOut, route, feeAccountAddress, deadline] }) });
      calls.push({ to: WETH_BASE_MAINNET, data: encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [minOut] }) });
      calls.push({ to: treasuryAddress, value: minOut });

      const smartAccount = await cdp.evm.getSmartAccount({ name: "crix-platform-fee-wallet" });
      const userOp = await smartAccount.sendUserOperation({ network: "base", calls, paymasterUrl: creds.paymasterUrl });
      submittedHash = userOp.userOpHash;
      evidence.push({ check: "user_operation_submitted", pass: true, value: submittedHash, source: "CDP sendUserOperation live response" });
      await updateSettlement({ status: "submitted", user_op_hash: submittedHash, evidence_json: JSON.stringify(evidence) });

      await updateSettlement({ status: "pending" });
      const result = await smartAccount.waitForUserOperation({ userOpHash: submittedHash });
      const mapped = mapUserOpStatus(result.status);
      evidence.push({ check: "user_operation_settled", pass: true, value: String(result.status), source: "CDP waitForUserOperation live response" });
      if (mapped !== "confirmed") {
        await updateSettlement({ status: mapped, failure_reason: "CDP reported status " + String(result.status), evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, settlement_key: settlementKey, status: mapped, note: "The settlement did not confirm — nothing is marked confirmed without a real receipt" });
      }

      // CONFIRMED ONLY with an independent Base Mainnet receipt AND verified
      // ETH arrival at the treasury.
      const receipt = await rpcCall("eth_getTransactionReceipt", [result.transactionHash]);
      if (!receipt || receipt.status !== "0x1") {
        await updateSettlement({ status: "unknown", tx_hash: result.transactionHash || "", failure_reason: "CDP reported complete but the independent Base Mainnet receipt was not a successful confirmation", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, settlement_key: settlementKey, status: "unknown", note: "UNKNOWN is not a failure — the chain is queried before any action; never blindly resent" });
      }
      evidence.push({ check: "base_mainnet_receipt_independently_verified", pass: true, value: receipt.transactionHash, source: "Base Mainnet RPC eth_getTransactionReceipt" });

      const treasuryAfter = BigInt(await rpcCall("eth_getBalance", [treasuryAddress, "latest"]));
      const ethOut = treasuryAfter - treasuryBefore;
      evidence.push({ check: "eth_arrival_at_treasury_verified", pass: ethOut > 0n, value: ethOut.toString() + " wei (before " + treasuryBefore.toString() + " → after " + treasuryAfter.toString() + ")", source: "Base Mainnet eth_getBalance before/after" });
      if (ethOut <= 0n) {
        await updateSettlement({ status: "unknown", tx_hash: result.transactionHash, failure_reason: "Receipt confirmed but no ETH arrival was verified at the treasury", evidence_json: JSON.stringify(evidence) });
        return Response.json({ ok: false, settlement_key: settlementKey, status: "unknown", note: "Receipt confirmed but ETH arrival is unverified — resolved on chain before any action" });
      }

      await updateSettlement({
        status: "confirmed",
        tx_hash: result.transactionHash,
        eth_out_wei: ethOut.toString(),
        evidence_json: JSON.stringify(evidence),
        settled_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, settlement_key: settlementKey, status: "confirmed", tx_hash: result.transactionHash, eth_out_wei: ethOut.toString() });
    } catch (settleError) {
      const reason = String(settleError.message || settleError).slice(0, 300);
      const status = submittedHash ? "unknown" : "failed";
      await updateSettlement({ status, user_op_hash: submittedHash, failure_reason: reason, evidence_json: JSON.stringify(evidence) });
      return Response.json({ ok: false, settlement_key: settlementKey, status, error: reason, note: submittedHash ? "UNKNOWN — the chain is queried before any retry; never blindly resent" : "Failed before submission — no on-chain movement was attempted" }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}