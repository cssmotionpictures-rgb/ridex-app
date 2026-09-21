import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import { BASE_SEPOLIA } from "@/lib/baseSepoliaNetwork";
import { connectMetaMask, restoreSession, walletRequest } from "@/lib/metamaskConnect";
import { readTokenState } from "@/lib/crxsChain";

// ADD CRXS TO METAMASK — symbol and decimals are READ DIRECTLY FROM THE
// CONTRACT at click time (never hardcoded), the import is only offered while
// the wallet is on Base Sepolia, and MetaMask itself stores what the chain
// returned. No values are fabricated.
export default function CrxsAddToMetaMask({ contractAddress }) {
  const [state, setState] = React.useState("idle"); // idle | working | added | error
  const [msg, setMsg] = React.useState("");

  const add = async () => {
    setState("working");
    setMsg("");
    try {
      const session = (await restoreSession()) || (await connectMetaMask());
      if (!session || !session.account) throw new Error("Connect MetaMask first.");
      if (session.chainId !== BASE_SEPOLIA.chainIdHex) {
        throw new Error("Switch MetaMask to Base Sepolia first — CRXS can only be imported on the correct network.");
      }
      // Token identity comes from the chain itself — never guessed.
      const token = await readTokenState(contractAddress, contractAddress);
      const added = await walletRequest("wallet_requestWatchAsset", [{
        type: "ERC20",
        options: {
          address: contractAddress,
          symbol: token.symbol,
          decimals: token.decimals,
        },
      }]);
      if (added !== true) throw new Error("MetaMask did not confirm the token import.");
      setState("added");
      setMsg(token.symbol + " added to MetaMask (network: " + BASE_SEPOLIA.name + ").");
    } catch (e) {
      setState("error");
      setMsg(String((e && e.message) || e));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <p className="font-heading font-bold text-sm">IMPORT TO METAMASK</p>
      <p className="text-[11px] text-muted-foreground">
        Adds CRXS to your wallet using the symbol and decimals read live from the contract at {contractAddress ? contractAddress.slice(0, 10) + "…" : "the contract"} — never guessed, and only on Base Sepolia.
      </p>
      <Button className="w-full" disabled={state === "working"} onClick={add}>
        {state === "working" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {state === "working" ? "Reading token from the chain…" : "Add CRXS to MetaMask"}
      </Button>
      {state === "added" && (
        <p className="text-[11px] text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {msg}</p>
      )}
      {state === "error" && (
        <p className="text-[11px] text-destructive flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {msg}</p>
      )}
    </div>
  );
}