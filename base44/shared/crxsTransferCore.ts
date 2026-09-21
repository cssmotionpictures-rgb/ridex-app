// Shared CRIXCOIN transfer primitives — used by every transfer function
// (mainnet sponsored transfer, Sepolia zero-ETH transfer) so the money-safety
// parsing rules exist in exactly one place.

export function parseRawAmount(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  try {
    const n = BigInt(value);
    return n > 0n ? n : null;
  } catch (error) {
    return null;
  }
}