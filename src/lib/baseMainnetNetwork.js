// Base MAINNET (production) network facts — completely separate from Base
// Sepolia. Chain ID 8453 (0x2105), official Base RPC and explorer endpoints.
// The production CRXS contract address does NOT exist in this file and is
// never hardcoded — it can only ever come from a real verified deployment
// record written by the server after the owner signs the real deployment.
export const BASE_MAINNET = {
  chainId: 8453,
  chainIdHex: "0x2105",
  name: "Base",
  rpcUrls: ["https://mainnet.base.org"],
  explorer: "https://basescan.org",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};