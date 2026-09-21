import React from "react";
import { CHAIN_ID_HEX, RPCS } from "@/lib/buyCurveClient";

// Shared wallet connection state for the public buy/sell panels: account,
// Base-network check, MetaMask connect with automatic Base switch/add.
export default function useCurveWallet() {
  const [account, setAccount] = React.useState("");
  const [onBase, setOnBase] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState("");

  const renderWallet = React.useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const accs = await window.ethereum.request({ method: "eth_accounts" });
      if (accs && accs[0]) {
        setAccount(accs[0]);
        const cid = await window.ethereum.request({ method: "eth_chainId" });
        setOnBase(String(cid).toLowerCase() === CHAIN_ID_HEX);
      }
    } catch (e) { /* wallet locked — user taps Connect */ }
  }, []);

  React.useEffect(() => { renderWallet(); }, [renderWallet]);

  React.useEffect(() => {
    if (window.ethereum && window.ethereum.on) {
      const onAccs = (a) => setAccount((a && a[0]) || "");
      const onChain = () => renderWallet();
      window.ethereum.on("accountsChanged", onAccs);
      window.ethereum.on("chainChanged", onChain);
      return () => {
        window.ethereum.removeListener && window.ethereum.removeListener("accountsChanged", onAccs);
        window.ethereum.removeListener && window.ethereum.removeListener("chainChanged", onChain);
      };
    }
  }, [renderWallet]);

  const connect = async () => {
    setError("");
    if (!window.ethereum) {
      setError("No crypto wallet found. Open this page inside MetaMask (its in-app browser on your phone) or install the MetaMask extension, then reload.");
      return "";
    }
    setConnecting(true);
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount((accs && accs[0]) || "");
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
        setOnBase(true);
      } catch (e) {
        if (e && (e.code === 4902 || String(e.message || "").indexOf("Unrecognized chain") >= 0)) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CHAIN_ID_HEX, chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPCS[0]], blockExplorerUrls: ["https://basescan.org"],
            }],
          });
          setOnBase(true);
        } else {
          setOnBase(false);
          setError("Your wallet is not on Base Mainnet — switch to Base and tap Connect again.");
        }
      }
      return (accs && accs[0]) || "";
    } catch (e) {
      setError((e && e.message) || "Wallet connection was cancelled.");
      return "";
    } finally {
      setConnecting(false);
    }
  };

  return { account, onBase, connecting, error, setError, connect };
}