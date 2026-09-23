import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import WalletOverview from "@/components/crix/WalletOverview";
import SendMoney from "@/components/crix/SendMoney";
import ActivityList from "@/components/crix/ActivityList";
import ProtectionCenter from "@/components/crix/ProtectionCenter";
import CrixBrandHero from "@/components/crix/CrixBrandHero";
import { invokeCrix } from "@/lib/crix";
import { useToast } from "@/components/ui/use-toast";
import { Wallet, Send, History, ShieldCheck, Layers, Zap, LayoutGrid, CreditCard, Sprout, Bitcoin } from "lucide-react";
import SymbioticRewards from "@/components/crix/SymbioticRewards";
import CrxsWalletDashboard from "@/components/crix/CrxsWalletDashboard";
import PayBills from "@/components/crix/PayBills";
import CrixHomeDashboard from "@/components/crix/CrixHomeDashboard";
import CrixDollarCardPanel from "@/components/crix/CrixDollarCardPanel";
import QuidaxOnrampPanel from "@/components/crix/QuidaxOnrampPanel";
import CrixCoinAddressCard from "@/components/crxs/CrixCoinAddressCard";
import CrixWalletDisplay from "@/components/crix/CrixWalletDisplay";
import CrixDeposit from "@/components/crix/CrixDeposit";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "home", label: "Wallets", icon: Wallet },
  { id: "send", label: "Send", icon: Send },
  { id: "bills", label: "Pay Bills", icon: Zap },
  { id: "dollar-card", label: "Dollar Card", icon: CreditCard },
  { id: "crypto", label: "Crypto", icon: Bitcoin },
  { id: "rewards", label: "Rewards", icon: Sprout },
  { id: "activity", label: "Activity", icon: History },
  { id: "protection", label: "Protection", icon: ShieldCheck },
  { id: "crxs", label: "CRIXCOIN", icon: Layers },
];

export default function CrixCoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const [tab, setTab] = React.useState(urlParams.get("tab") || "dashboard");
  const [user, setUser] = React.useState(null);
  const [wallets, setWallets] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  const loadWallets = React.useCallback(() => {
    base44.entities.CrixWallet.list("-created_date", 50).then(setWallets).catch(() => setWallets([]));
  }, []);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    loadWallets();
    const unsub = base44.entities.CrixWallet.subscribe(loadWallets);
    return unsub;
  }, [loadWallets]);

  const openWallet = async (code) => {
    setBusy(true);
    try {
      await invokeCrix({ action: "open_wallet", currency: code });
      toast({ title: code + " wallet opened", description: "It starts at zero — Crix never creates money." });
      loadWallets();
    } catch (e) {
      toast({ title: "Could not open wallet", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="CRIX NETWORK · CRXS (PRE-LAUNCH)"
        title={<span className="gold-text">CrixCoin</span>}
        subtitle="Send and receive CRIXCOIN instantly, fund your wallet with Naira, and pay anyone on the network."
      />

      <CrixBrandHero />

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[36px] " + (tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {wallets === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
          <div className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
        </div>
      ) : tab === "dashboard" ? (
        <CrixHomeDashboard user={user} wallets={wallets} />
      ) : tab === "home" ? (
        <div className="space-y-5"><CrixWalletDisplay /><CrixDeposit onSuccess={loadWallets} /><WalletOverview wallets={wallets} busy={busy} onOpenWallet={openWallet} user={user} /></div>
      ) : tab === "send" ? (
        <SendMoney wallets={wallets} myEmail={user?.email} onDone={loadWallets} />
      ) : tab === "bills" ? (
        <PayBills user={user} onChanged={loadWallets} />
      ) : tab === "dollar-card" ? (
        <CrixDollarCardPanel user={user} onChanged={loadWallets} />
      ) : tab === "crypto" ? (
        <QuidaxOnrampPanel />
      ) : tab === "rewards" ? (
        <SymbioticRewards user={user} />
      ) : tab === "activity" ? (
        <ActivityList myId={user?.id} />
      ) : tab === "protection" ? (
        <ProtectionCenter wallets={wallets} onChanged={loadWallets} />
      ) : tab === "crxs" ? (
        <div className="space-y-5">
          <CrixCoinAddressCard />
          <CrxsWalletDashboard userId={user?.id} />
        </div>
      ) : null}
    </div>
  );
}