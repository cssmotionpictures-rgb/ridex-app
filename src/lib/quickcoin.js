// QUICK COIN client helpers — display + invocation only. All money logic lives
// in the server-side crix-wallet function; the client never computes or trusts
// a balance. Invocation reuses the Crix layer (@/lib/crix).

export const QC_NETWORK = {
  mode: "TESTNET",
  name: "Base Sepolia",
  chainId: 84532,
  label: "TESTNET — BASE SEPOLIA",
};

export const isHandle = (v) => /^@?[a-z0-9_]{3,24}$/.test(String(v || "").trim().toLowerCase());
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
export const normalizeHandle = (v) => {
  const h = String(v || "").trim().toLowerCase();
  return h.startsWith("@") ? h : "@" + h;
};
export const payUri = (handle) => "quickcoin://pay/" + normalizeHandle(handle);

export const formatCrxs = (n) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " CRXS";