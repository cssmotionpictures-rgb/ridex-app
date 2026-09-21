import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Loader2, Wallet, Megaphone, ArrowUpRight } from "lucide-react";
import { money } from "@/lib/pricing";

// Internal earnings dashboard (admin only): daily ad revenue from the AdEvent
// ledger plus the platform transaction history settled to the linked OPay
// account. Never shown to end users.
const OPAY_ACCOUNT = "8061197339";

const fmtUsd = (v) => `$${(v || 0).toFixed(2)}`;
const fmtAmount = (t) => (t.currency === "USD" ? `$${(t.amount || 0).toFixed(2)}` : money(t.amount));

export default function AdEarnings() {
  const [user, setUser] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [txs, setTxs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        setUser(me);
        const [ev, tx] = await Promise.all([
          base44.entities.AdEvent.list("-created_date", 500),
          base44.entities.Transaction.list("-created_date", 100),
        ]);
        setEvents(ev || []);
        setTxs(tx || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading earnings…</p>
  );

  if (user && user.role !== "admin") return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">This dashboard is restricted to RIDE X admins.</p>
    </div>
  );

  const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
  const todayEvents = events.filter((e) => isToday(e.created_date));
  const todayEarnings = todayEvents.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalEarnings = events.reduce((s, e) => s + (e.revenue || 0), 0);
  const byType = ["rewarded", "banner", "interstitial", "native", "pause"]
    .map((t) => ({
      type: t,
      count: events.filter((e) => e.ad_type === t).length,
      revenue: events.filter((e) => e.ad_type === t).reduce((s, e) => s + (e.revenue || 0), 0),
    }))
    .filter((t) => t.count > 0);

  return (
    <div>
      <PageHeader
        eyebrow="Internal · Ad Revenue"
        title="Ad earnings & settlements"
        subtitle={`Daily ad revenue from the ad ledger, with platform transaction history settled to your OPay account (${OPAY_ACCOUNT}).`}
      />

      <div className="grid sm:grid-cols-3 gap-5 mb-8">
        <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-[0.2em]"><Megaphone className="w-4 h-4" /> Today</div>
          <p className="text-3xl font-extrabold mt-2">{fmtUsd(todayEarnings)}</p>
          <p className="text-xs text-muted-foreground mt-1">{todayEvents.length} ad event{todayEvents.length === 1 ? "" : "s"} today</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.2em]"><ArrowUpRight className="w-4 h-4" /> All-time</div>
          <p className="text-3xl font-extrabold mt-2">{fmtUsd(totalEarnings)}</p>
          <p className="text-xs text-muted-foreground mt-1">Last {events.length} recorded events</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.2em]"><Wallet className="w-4 h-4" /> Settlement</div>
          <p className="text-2xl font-extrabold mt-2">OPay</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{OPAY_ACCOUNT}</p>
        </div>
      </div>

      {byType.length > 0 && (
        <div className="rounded-3xl border border-border/60 bg-card p-6 mb-8">
          <p className="font-semibold mb-4">Earnings by ad format</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {byType.map((t) => (
              <div key={t.type} className="rounded-2xl bg-secondary p-4">
                <p className="text-xs capitalize text-muted-foreground">{t.type}</p>
                <p className="text-lg font-bold mt-1">{fmtUsd(t.revenue)}</p>
                <p className="text-[11px] text-muted-foreground">{t.count} events</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="font-semibold">Transaction history</p>
          <span className="text-[11px] rounded-full border border-border px-3 py-1 text-muted-foreground">Settled to OPay {OPAY_ACCOUNT}</span>
        </div>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {txs.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.description || t.service}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(t.created_date).toLocaleString()} · {t.service} · {t.method}
                    {t.opay_account ? ` · OPay ${t.opay_account}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{fmtAmount(t)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}