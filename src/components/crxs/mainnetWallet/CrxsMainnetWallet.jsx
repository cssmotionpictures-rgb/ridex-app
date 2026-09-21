import React from "react";
import { base44 } from "@/api/base44Client";
import { connectMetaMask, restoreSession, switchToBaseMainnet, walletRequest } from "@/lib/metamaskConnect";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";
import { readAddressBalance } from "@/lib/crxsChain";
import WalletConnectionCard from "./WalletConnectionCard";
import CrixIdCard from "./CrixIdCard";
import SendCard from "./SendCard";
import ReceiveCard from "./ReceiveCard";
import CurveMarketCard from "./CurveMarketCard";

// PRODUCTION CRXS WALLET — every user connects their OWN independent wallet;
// the address always comes from the wallet provider; wallet account/network
// changes are listened for live; balances are read from the chain only; and
// the identity (Crix ID) is granted exclusively by server-verified wallet
// signatures. Send stays blocked until the real verified Base Mainnet
// contract exists — nothing is simulated.
export default function CrxsMainnetWallet() {
  const [account, setAccount] = React.useState("");
  const [chainId, setChainId] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState("");
  const [identity, setIdentity] = React.useState(null);
  const [mainnetRecord, setMainnetRecord] = React.useState(null);
  const [crxsBalance, setCrxsBalance] = React.useState(null);
  const [ethBalance, setEthBalance] = React.useState(null);
  const cleanupRef = React.useRef(null);

  const contractAddress = mainnetRecord?.deployment_status === "DEPLOYED" ? mainnetRecord.contract_address : null;
  const onMainnet = chainId === BASE_MAINNET.chainIdHex;

  const loadIdentity = React.useCallback(() => {
    base44.auth.me().then((u) => {
      if (!u) { setIdentity(null); return; }
      base44.entities.CrixWalletIdentity.filter({ user_id: u.id })
        .then((r) => setIdentity(r[0] || null))
        .catch(() => {});
    }).catch(() => {});
  }, []);

  const loadRecord = React.useCallback(() => {
    base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" })
      .then((r) => setMainnetRecord(r[0] || null))
      .catch(() => {});
  }, []);

  const refreshBalance = React.useCallback(async () => {
    setCrxsBalance(null);
    setEthBalance(null);
    if (!account || !onMainnet) return;
    try {
      const eth = await walletRequest("eth_getBalance", [account, "latest"]);
      setEthBalance(Number(BigInt(eth)) / 1e18);
    } catch (e) { /* wallet unavailable */ }
    if (contractAddress) {
      try {
        setCrxsBalance(await readAddressBalance(contractAddress, account));
      } catch (e) { setCrxsBalance(null); }
    }
  }, [account, onMainnet, contractAddress]);

  // Listen for wallet account/network changes — the app NEVER keeps showing
  // stale wallet data after the user switches in MetaMask.
  const attachEvents = (provider) => {
    if (!provider || typeof provider.on !== "function") return;
    if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    const onAccounts = (accs) => {
      if (!accs || !accs.length) { setAccount(""); setChainId(""); setCrxsBalance(null); setEthBalance(null); return; }
      setAccount(accs[0]);
      refreshBalance();
    };
    const onChain = (cid) => {
      setChainId(String(cid).toLowerCase());
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    cleanupRef.current = () => {
      try {
        provider.removeListener("accountsChanged", onAccounts);
        provider.removeListener("chainChanged", onChain);
      } catch (e) { /* noop */ }
    };
  };

  React.useEffect(() => {
    loadIdentity();
    loadRecord();
    const unsubRecord = base44.entities.CrxsMainnetDeploymentRecord.subscribe(loadRecord);
    let alive = true;
    (async () => {
      try {
        const s = await restoreSession();
        if (alive && s && s.account) {
          setAccount(s.account);
          setChainId(String(s.chainId || "").toLowerCase());
          attachEvents(s.provider);
        }
      } catch (e) { /* not connected yet */ }
    })();
    return () => {
      alive = false;
      unsubRecord();
      if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    };
  }, [loadIdentity, loadRecord]);

  React.useEffect(() => { refreshBalance(); }, [refreshBalance]);

  const connect = async () => {
    setConnectError("");
    setConnecting(true);
    try {
      const s = await connectMetaMask();
      setAccount(s.account);
      setChainId(String(s.chainId || "").toLowerCase());
      attachEvents(s.provider);
    } catch (e) {
      if (e && e.code === 4001) setConnectError("Connection rejected in MetaMask.");
      else if (e && e.code === -32002) setConnectError("MetaMask request already pending — open MetaMask and complete or cancel it.");
      else setConnectError(String((e && e.message) || e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (cleanupRef.current) { try { cleanupRef.current(); } catch (e) { /* noop */ } }
    setAccount("");
    setChainId("");
    setCrxsBalance(null);
    setEthBalance(null);
    setConnectError("");
  };

  const switchNetwork = async () => {
    setConnectError("");
    try {
      await switchToBaseMainnet();
    } catch (e) {
      if (e && e.code === 4001) setConnectError("Network switch rejected in MetaMask.");
      else setConnectError(String((e && e.message) || e));
    }
  };

  return (
    <div className="space-y-4">
      {!contractAddress && (
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-[11px] text-yellow-500">
          <p className="font-bold">CRIXCOIN NETWORK IS LAUNCHING SOON</p>
          <p>Connect your wallet and claim your Crix ID now — they work today. Sending and balances activate automatically at launch.</p>
        </div>
      )}
      <WalletConnectionCard
        account={account}
        chainId={chainId}
        onMainnet={onMainnet}
        connecting={connecting}
        connectError={connectError}
        contractAddress={contractAddress}
        crxsBalance={crxsBalance}
        ethBalance={ethBalance}
        onConnect={connect}
        onDisconnect={disconnect}
        onSwitch={switchNetwork}
        onBalanceRefresh={refreshBalance}
      />
      <CurveMarketCard />
      <CrixIdCard account={account} identity={identity} onVerified={loadIdentity} />
      <SendCard account={account} onMainnet={onMainnet} contractAddress={contractAddress} onSent={refreshBalance} />
      <ReceiveCard account={account} identity={identity} />
    </div>
  );
}