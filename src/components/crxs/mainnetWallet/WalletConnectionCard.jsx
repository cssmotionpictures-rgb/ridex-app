import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Plus, XCircle } from "lucide-react";
import { BASE_MAINNET } from "@/lib/baseMainnetNetwork";
import { walletRequest } from "@/lib/metamaskConnect";
import { readAddressBalance, readTokenState } from "@/lib/crxsChain";
import { formatRawAmount, shortAddr } from "./amount";

// Connection card — the connected address ALWAYS comes from the wallet
// provider (never typed), the network is shown live from the wallet, the
// CRXS balance is read straight from the chain contract, and DISCONNECT
// clears every wallet-specific value in the app.
export default function WalletConnectionCard({
  account, chainId, onMainnet, connecting, connectError, contractAddress,
  crxsBalance, ethBalance, onConnect, onDisconnect, onSwitch, onBalanceRefresh,
}) {
  const [importState, setImportState] = React.useState("idle"); // idle | working | added | error
  const [importMsg, setImportMsg] = React.useState("");

  const addToMetaMask = async () => {
    setImportState("working");
    setImportMsg("");
    try {
      if (!contractAddress) throw new Error("No verified production contract yet — CRXS cannot be imported.");
      // Token identity comes from the chain itself — never guessed.
      const token = await readTokenState(contractAddress, contractAddress);
      const added = await walletRequest("wallet_requestWatchAsset", [{
        type: "ERC20",
        options: { address: contractAddress, symbol: token.symbol, decimals: token.decimals },
      }]);
      if (added !== true) throw new Error("MetaMask did not confirm the token import.");
      setImportState("added");
      setImportMsg(token.symbol + " added to MetaMask.");
    } catch (e) {
      setImportState("error");
      setImportMsg(String((e && e.message) || e));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Your external wallet</p>

      {!account ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            Connect your own MetaMask wallet. Every user connects their own independent address — it always comes from the wallet itself, never typed in. The app never requests or stores your private key or seed phrase.
          </p>
          <Button className="w-full" disabled={connecting} onClick={onConnect}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {connecting ? "Connecting…" : "Connect Wallet"}
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Connected wallet</span>
              <span className="font-mono break-all text-right">{account}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Network</span>
              <span className={onMainnet ? "text-emerald-400 font-semibold" : "text-yellow-500 font-semibold"}>
                {onMainnet ? "Connected ✓" : "Wrong network — switch to continue"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">CRXS balance</span>
              <span className="font-mono text-right">
                {crxsBalance === null
                  ? (contractAddress ? "…" : "Available at launch")
                  : formatRawAmount(crxsBalance) + " CRXS"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">ETH balance</span>
              <span className="font-mono text-right">{ethBalance === null ? "…" : Number(ethBalance).toFixed(6) + " ETH"}</span>
            </div>
          </div>

          {!onMainnet && (
            <Button className="w-full" variant="outline" onClick={onSwitch}>Switch network</Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={onBalanceRefresh}>Refresh balance</Button>
            <Button variant="outline" size="sm" onClick={onDisconnect}><LogOut className="w-4 h-4" /> Disconnect</Button>
          </div>

          {onMainnet && contractAddress && (
            <Button className="w-full" variant="secondary" disabled={importState === "working"} onClick={addToMetaMask}>
              {importState === "working" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {importState === "working" ? "Reading CRXS…" : "Add CRXS to MetaMask"}
            </Button>
          )}
          {importState === "added" && <p className="text-[11px] text-emerald-400">{importMsg}</p>}
          {importState === "error" && <p className="text-[11px] text-destructive flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {importMsg}</p>}
        </>
      )}

      {connectError && <p className="text-[11px] text-destructive">{connectError}</p>}

      {!account && (
        <p className="text-[10px] text-muted-foreground">
          After connection the app listens for wallet account and network changes — switching accounts or chains in MetaMask immediately refreshes everything shown here. A wallet address alone never proves ownership: claiming your Crix ID requires a wallet signature verified by the server.
        </p>
      )}
    </div>
  );
}