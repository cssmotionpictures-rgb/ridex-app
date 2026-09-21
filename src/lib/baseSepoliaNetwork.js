// Base Sepolia network facts — the ONE network CRXS deploys to.
// Chain ID 84532 (0x14a34), official Base RPC and explorer endpoints.
// CRXS is never deployed to Ethereum Mainnet, Base Mainnet or any other network.
export const BASE_SEPOLIA = {
  chainId: 84532,
  chainIdHex: "0x14a34",
  name: "Base Sepolia",
  rpcUrls: ["https://sepolia.base.org"],
  explorer: "https://sepolia.basescan.org",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};