// ONE authoritative MetaMask wallet layer for CRXS Launch Control.
//
// Current MetaMask Connect architecture (@metamask/connect-evm):
//   Priority 1 — injected MetaMask provider, discovered via EIP-6963 (MetaMask's
//     recommended interop standard) with a window.ethereum fallback. This is
//     the path inside MetaMask Mobile's own Explore/browser and the desktop
//     extension — used directly, never routed through an external handoff.
//   Priority 2 — MetaMask Connect EVM (createEVMClient() singleton →
//     client.connect()). MetaMask's own window handles the desktop QR code and
//     the official mobile transport (opens MetaMask Mobile, returns the user
//     to this dapp, persists the session). No custom deeplinks, no metamask://
//     URLs, no hand-made "Open in MetaMask" links — ever.
//
// The app NEVER requests or stores a seed phrase, private key or wallet
// password; every signature happens inside MetaMask itself.
import { BASE_SEPOLIA } from "@/lib/baseSepoliaNetwork";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";

export const DAPP_URL = "https://ridex-all-go.base44.app";

let activeProvider = null; // EIP-1193 provider of the current connection
let clientPromise = null; // createEVMClient() singleton — created once, never per render

const isBrowser = typeof window !== "undefined";

function looksLikeMetaMask(info) {
  const label = ((info && ((info.name || "") + " " + (info.rdns || ""))) || "").toLowerCase();
  return label.includes("metamask");
}

function injectedFallback() {
  if (!isBrowser || !window.ethereum) return null;
  if (window.ethereum.isMetaMask || looksLikeMetaMask(window.ethereum)) return window.ethereum;
  return null;
}

// EIP-6963 provider discovery. Wallets answer 'eip6963:announceProvider'
// immediately after the request event; MetaMask Mobile injects window.ethereum
// AFTER page load, so we also listen for 'ethereum#initialized' and poll
// briefly instead of judging on one synchronous look.
export function findInjectedMetaMask(timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!isBrowser) return resolve(null);
    const early = injectedFallback();
    if (early) return resolve(early);
    let resolved = false;
    let timer = null;
    let timeout = null;
    const finish = (provider) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.removeEventListener("ethereum#initialized", onInit);
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      resolve(provider || injectedFallback());
    };
    const onAnnounce = (event) => {
      const { info, provider } = (event && event.detail) || {};
      if (provider && looksLikeMetaMask(info)) finish(provider);
    };
    const onInit = () => { const p = injectedFallback(); if (p) finish(p); };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("ethereum#initialized", onInit);
    try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) { /* older browsers */ }
    timer = setInterval(() => { const p = injectedFallback(); if (p) finish(p); }, 250);
    timeout = setTimeout(() => finish(null), timeoutMs);
  });
}

export function hasWallet() {
  return !!injectedFallback();
}

export function waitForWallet(timeoutMs = 4000) {
  return findInjectedMetaMask(timeoutMs);
}

// MetaMask Connect EVM client — async singleton, never recreated per render.
// The dynamic import keeps the package out of the initial bundle.
async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createEVMClient } = await import("@metamask/connect-evm");
      return createEVMClient({
        dapp: {
          name: "CRXS Launch Control",
          url: DAPP_URL,
          iconUrl: DAPP_URL + "/favicon.ico",
        },
        api: {
          supportedNetworks: {
            [BASE_SEPOLIA.chainIdHex]: BASE_SEPOLIA.rpcUrls[0],
            [BASE_MAINNET.chainIdHex]: BASE_MAINNET.rpcUrls[0],
          },
        },
      });
    })();
  }
  return clientPromise;
}

async function request(provider, method, params) {
  return provider.request({ method, params: params || [] });
}

// Full connection — injected provider first, MetaMask Connect second.
// Returns { account, chainId (lowercase hex), provider, mode }.
export async function connectMetaMask() {
  // MetaMask Mobile can inject window.ethereum several seconds after load
  // on a slow connection — wait long enough that the injected path is used
  // instead of falling back to the external wallet handoff, which shows no
  // confirmation prompt inside MetaMask's own browser.
  const injected = await findInjectedMetaMask(5000);
  if (injected) {
    const accounts = await request(injected, "eth_requestAccounts");
    if (!accounts || !accounts.length) throw new Error("No account was authorized by MetaMask.");
    const chainId = String(await request(injected, "eth_chainId")).toLowerCase();
    activeProvider = injected;
    return { account: accounts[0], chainId, provider: injected, mode: "injected" };
  }
  const client = await getClient();
  const { accounts, chainId } = await client.connect({ chainIds: [BASE_SEPOLIA.chainIdHex, BASE_MAINNET.chainIdHex] });
  if (!accounts || !accounts.length) throw new Error("No account was authorized by MetaMask.");
  const provider = client.getProvider();
  activeProvider = provider;
  return { account: accounts[0], chainId: String(chainId || "").toLowerCase(), provider, mode: "connect" };
}

// Back-compat thin helper: just the account address.
export async function connectWallet() {
  const s = await connectMetaMask();
  return s.account;
}

// Silent session restore on page load — eth_accounts only, so an already
// authorized wallet reconnects without a second connection modal.
export async function restoreSession() {
  try {
    const injected = await findInjectedMetaMask(1200);
    if (injected) {
      const accounts = await request(injected, "eth_accounts");
      if (accounts && accounts.length) {
        const chainId = String(await request(injected, "eth_chainId")).toLowerCase();
        activeProvider = injected;
        return { account: accounts[0], chainId, provider: injected, mode: "injected" };
      }
      return null;
    }
    const client = await getClient();
    const provider = client.getProvider();
    const accounts = await request(provider, "eth_accounts");
    if (accounts && accounts.length) {
      const chainId = String(await request(provider, "eth_chainId")).toLowerCase();
      activeProvider = provider;
      return { account: accounts[0], chainId, provider, mode: "connect" };
    }
  } catch (e) {
    return null; // no session yet — the user taps Connect MetaMask
  }
  return null;
}

// All later EIP-1193 calls (chain checks, deploy, reads, receipt polls) route
// through the active provider of the current connection.
export async function walletRequest(method, params) {
  if (!activeProvider) {
    const s = await restoreSession();
    if (!s) throw new Error("MetaMask is not connected yet — tap Connect MetaMask first.");
  }
  return activeProvider.request({ method, params: params || [] });
}

export async function currentChainId() {
  return String(await walletRequest("eth_chainId")).toLowerCase();
}

// wallet_switchEthereumChain → wallet_addEthereumChain (error 4902) → switch
// again. 4001 / -32002 bubble up so the UI can phrase them exactly.
// Generic over the network so testnet and MAINNET stay strictly separate —
// the app can never silently send a production transaction while the wallet
// is on Sepolia, or vice versa.
export async function switchToNetwork(network) {
  const id = await currentChainId();
  if (id === network.chainIdHex) return id;
  try {
    await walletRequest("wallet_switchEthereumChain", [{ chainId: network.chainIdHex }]);
  } catch (e) {
    if (e && (e.code === 4902 || /unrecognized chain/i.test(e.message || ""))) {
      await walletRequest("wallet_addEthereumChain", [{
        chainId: network.chainIdHex,
        chainName: network.name,
        nativeCurrency: network.nativeCurrency,
        rpcUrls: network.rpcUrls,
        blockExplorerUrls: [network.explorer],
      }]);
      await walletRequest("wallet_switchEthereumChain", [{ chainId: network.chainIdHex }]);
    } else {
      throw e;
    }
  }
  return currentChainId();
}

export async function switchToBaseSepolia() {
  return switchToNetwork(BASE_SEPOLIA);
}

export async function ensureBaseSepolia() {
  await switchToBaseSepolia();
}

export async function switchToBaseMainnet() {
  return switchToNetwork(BASE_MAINNET);
}

export async function ensureBaseMainnet() {
  await switchToBaseMainnet();
}