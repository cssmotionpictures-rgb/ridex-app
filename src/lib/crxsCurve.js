// CRIXCOIN LAUNCH CURVE — client layer for the OWNER-SIGNED bonding curve on
// Base Mainnet. The curve sells the EXISTING verified CRXS token
// (0xb7a1…453f) — no new token is ever created, no third-party launchpad is
// involved, and the private key never touches this app: the owner deploys,
// approves, funds and migrates personally in MetaMask.
//
// The exact compiled artifact (solc 0.8.37, optimizer 200 runs — identical
// settings to the verified CRXS token) is imported VERBATIM from
// contracts/crxs-curve-bytecode.json so the deploy bytes can never be
// mistyped by hand. The console appends the constructor arguments at deploy
// time.
import artifact from "../../contracts/crxs-curve-bytecode.json";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";

export const CRXS_TOKEN_ADDRESS = "0xb7a10024941f5286d9686b0bb8ebf6cb88c7453f";
export const CRXS_CURVE_COMPILER = { version: artifact.compiler_version, optimizer: artifact.optimizer };
export const CRXS_CURVE_BYTECODE_SHA256 = artifact.creation_bytecode_sha256;
export const CRXS_CURVE_CREATION_BYTECODE = "0x" + artifact.creation_bytecode_hex;

// Every function selector of the curve contract, straight from the compiler.
const norm = (s) => (String(s).startsWith("0x") ? String(s) : "0x" + String(s));
export const CURVE_SELECTORS = {};
for (const [name, selector] of Object.entries(artifact.method_identifiers || {})) {
  // "tokenReserve()" → "tokenReserve", "fund(uint256)" → "fund" — call sites
  // look functions up by bare name, so the argument signature must be stripped.
  CURVE_SELECTORS[name.replace(/\(.*$/, "")] = norm(selector);
}
// Standard ERC-20 selectors the console also needs.
export const TOKEN_APPROVE_SELECTOR = "0x095ea7b3";
// ERC-20 allowance(owner, spender) selector — proves whether an approve is still needed.
const TOKEN_ALLOWANCE_SELECTOR = "0xdd62ed3e";

// ——— minimal ABI encoding (fixed shapes only) ———

export function padUint256(value) {
  const v = BigInt(value);
  if (v < 0n) throw new Error("Value must not be negative.");
  return v.toString(16).padStart(64, "0");
}

export function padAddress(address) {
  const a = String(address).toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(a)) throw new Error("Invalid Ethereum address.");
  return "0".repeat(24) + a;
}

// Deployment data = creation bytecode + the 5 ABI-encoded constructor args.
export function buildCurveDeployData({ token, virtualEthOffsetWei, graduationThresholdWei, buyFeeBps, sellFeeBps }) {
  return (
    CRXS_CURVE_CREATION_BYTECODE +
    padAddress(token) +
    padUint256(virtualEthOffsetWei) +
    padUint256(graduationThresholdWei) +
    padUint256(buyFeeBps) +
    padUint256(sellFeeBps)
  );
}

export function encodeFundData(amountRaw) {
  return CURVE_SELECTORS.fund + padUint256(amountRaw);
}

export function encodeApproveData(spender, amountRaw) {
  return TOKEN_APPROVE_SELECTOR + padAddress(spender) + padUint256(amountRaw);
}

// ——— unit helpers (CRXS has 18 decimals; 1 billion CRXS = 10^27 raw) ———

export const billionToRaw = (billions) => {
  const n = BigInt(billions);
  if (n <= 0n) throw new Error("Amount must be positive.");
  return n * 10n ** 27n;
};
export const rawToBillion = (raw) => (BigInt(raw) / 10n ** 27n).toString();
export const ethToWei = (ethString) => {
  const n = Number(ethString);
  if (!isFinite(n) || n < 0) throw new Error("Invalid ETH amount.");
  return BigInt(Math.round(n * 1e6)) * 10n ** 12n;
};
export const weiToEthNumber = (wei) => Number(BigInt(wei)) / 1e18;
export const formatEth = (wei) => {
  const n = weiToEthNumber(wei);
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(4);
  return String(Number(n.toFixed(8)));
};
export const formatPrice = (ethNumber) =>
  ethNumber === 0 ? "0" : Math.abs(ethNumber) < 1e-6 ? ethNumber.toExponential(3) : String(Number(ethNumber.toFixed(9)));

// ——— public RPC reads (no wallet connection needed) ———
// Real chain data only, with endpoint fallbacks so one rate-limited RPC
// never blanks the honest state.
const CURVE_RPCS = ["https://mainnet.base.org", "https://base.meowrpc.com", "https://base-rpc.publicnode.com"];

async function curveCall(to, data) {
  let lastError = null;
  for (const rpc of CURVE_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_call", params: [{ to, data }, "latest"] }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      if (!json.result || json.result === "0x") throw new Error("empty eth_call result");
      return json.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Curve RPC unavailable");
}

// Live ERC-20 allowance read (raw units) — lets the fund flow skip a redundant
// approve signature when an earlier one is already confirmed on-chain.
export async function readTokenAllowance(tokenAddress, ownerAddress, spenderAddress) {
  const data = TOKEN_ALLOWANCE_SELECTOR + padAddress(ownerAddress) + padAddress(spenderAddress);
  return BigInt(await curveCall(tokenAddress, data)).toString();
}

// Live curve state read straight from Base Mainnet — never cached or assumed.
export async function readCurveState(curveAddress) {
  const s = CURVE_SELECTORS;
  const [tokenReserve, ethReserve, virtualEthOffset, graduationThresholdEth, buyFeeBps, sellFeeBps, graduated, migratedTo, pricePerToken] =
    await Promise.all([
      curveCall(curveAddress, s.tokenReserve),
      curveCall(curveAddress, s.ethReserve),
      curveCall(curveAddress, s.virtualEthOffset),
      curveCall(curveAddress, s.graduationThresholdEth),
      curveCall(curveAddress, s.buyFeeBps),
      curveCall(curveAddress, s.sellFeeBps),
      curveCall(curveAddress, s.graduated),
      curveCall(curveAddress, s.migratedTo),
      curveCall(curveAddress, s.pricePerToken),
    ]);
  const migratedRaw = BigInt(migratedTo).toString(16).padStart(40, "0");
  return {
    tokenReserveRaw: BigInt(tokenReserve).toString(),
    ethReserveWei: BigInt(ethReserve).toString(),
    virtualEthOffsetWei: BigInt(virtualEthOffset).toString(),
    graduationThresholdWei: BigInt(graduationThresholdEth).toString(),
    buyFeeBps: Number(BigInt(buyFeeBps)),
    sellFeeBps: Number(BigInt(sellFeeBps)),
    graduated: BigInt(graduated) !== 0n,
    migratedTo: "0x" + migratedRaw,
    pricePerTokenWei: BigInt(pricePerToken).toString(),
    priceEthPerCrxs: weiToEthNumber(pricePerToken),
  };
}