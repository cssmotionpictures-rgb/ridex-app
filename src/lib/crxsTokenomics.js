// CRXS APPROVED TOKENOMICS — single source of truth (owner decision 2026-09-11).
// Fixed: 500,000,000,000 CRXS total supply, 18 decimals, minted ONCE to the
// deployment wallet, no mint function, no tax, no blacklist, no owner controls.
// CONSTRUCTOR_ARG is the exact raw-units value the owner enters in Remix and
// verifies in MetaMask: 500,000,000,000 × 10^18 = 5 × 10^29.
export const CRXS = {
  NAME: "CrixCoin",
  SYMBOL: "CRXS",
  DECIMALS: 18,
  TOTAL_SUPPLY_WHOLE: 500_000_000_000,
  CONSTRUCTOR_ARG: "500000000000000000000000000000",
  DEPLOYER: "0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1",
  NETWORK_TARGET: "Base",
  TESTNET_NAME: "Base Sepolia",
  TESTNET_CHAIN_ID: 84532,
};