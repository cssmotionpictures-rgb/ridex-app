import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { invokeCrix } from "@/lib/crix";
import { base44 } from "@/api/base44Client";
import QcOverview from "@/components/quickcoin/QcOverview";
import QcSend from "@/components/quickcoin/QcSend";
import QcReceive from "@/components/quickcoin/QcReceive";
import QcHistory from "@/components/quickcoin/QcHistory";
import PageHeader from "@/components/shared/PageHeader";
import { Send as SendIcon, QrCode, History as HistoryIcon } from "lucide-react";

export default function QuickCoin() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState("send");
  const [wallet, setWallet] = React.useState(null);
  const [identity, setIdentity] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const w = await invokeCrix({ action: "open_wallet", currency: "CRXS" });
      setWallet(w.wallet);
      const ids = await base44.entities.CrixWalletIdentity.filter({ user_id: user.id }, "-created_date", 1).catch(() => []);
      setIdentity((ids || [])[0] || null);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  React.useEffect(() => { load(); }, [load]);

  const tabs = [
    { k: "send", label: "Send", icon: SendIcon },
    { k: "receive", label: "Receive", icon: QrCode },
    { k: "history", label: "History", icon: HistoryIcon },
  ];

  return (
    <div>
      <PageHeader eyebrow="◆ CRIXCOIN" title="CRIXCOIN" subtitle="Send and receive CRXS instantly between CRIXCOIN users — simple, instant and secure." />
      <QcOverview wallet={wallet} loading={loading} />
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "send" && <QcSend user={user} wallet={wallet} onDone={load} />}
      {tab === "receive" && <QcReceive identity={identity} />}
      {tab === "history" && <QcHistory user={user} />}
    </div>
  );
}