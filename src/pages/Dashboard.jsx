import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import AdBanner from "@/components/shared/AdBanner";
import StatusBadge from "@/components/shared/StatusBadge";
import { SERVICES } from "@/lib/catalog";
import { money } from "@/lib/pricing";
import { motion } from "framer-motion";
import { Gift, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import WealthProgressChart from "@/components/dashboard/WealthProgressChart";
import RolloverProgress from "@/components/sports/RolloverProgress";
import RolloverSummaryTable from "@/components/sports/RolloverSummaryTable";
import BankrollChart from "@/components/dashboard/BankrollChart";
import BankrollProgressionChart from "@/components/dashboard/BankrollProgressionChart";
import BookingCalendarSync from "@/components/shared/BookingCalendarSync";
import BankrollSnapshot from "@/components/dashboard/BankrollSnapshot";
import RolloverHistory from "@/components/sports/RolloverHistory";
import AccuracyTrendChart from "@/components/dashboard/AccuracyTrendChart";
import PredictedVsActualChart from "@/components/dashboard/PredictedVsActualChart";
import EngineConfidenceChart from "@/components/dashboard/EngineConfidenceChart";
import InstantLock from "@/components/cards/InstantLock";
import BankuDrop from "@/components/dashboard/BankuDrop";
import BankuKalaWinRate from "@/components/dashboard/BankuKalaWinRate";
import InvestorProposalPanel from "@/components/dashboard/InvestorProposalPanel";
import CrxsVolumeChart from "@/components/dashboard/CrxsVolumeChart";
import CrxsTransferIndex from "@/components/dashboard/CrxsTransferIndex";
import CrixDashboardMoneyCard from "@/components/crix/CrixDashboardMoneyCard";

export default function Dashboard() {
  const [user, setUser] = React.useState(null);
  const [rides, setRides] = React.useState([]);
  const [deliveries, setDeliveries] = React.useState([]);
  const [txs, setTxs] = React.useState([]);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Ride.list("-created_date", 3).then(setRides);
    base44.entities.LogisticsRequest.list("-created_date", 3).then(setDeliveries);
    base44.entities.Transaction.list("-created_date", 5).then(setTxs);
  }, []);

  const spent = txs.filter((t) => t.currency !== "NGN").reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Welcome back"
        title={user?.full_name ? user.full_name.split(" ")[0] : "Your ecosystem"}
        subtitle="Everything you need in one place — pick a service to get moving."
      />

      <InstantLock />

      <div className="mb-8">
        <CrixDashboardMoneyCard user={user} />
      </div>

      <div className="mb-8">
        <BankuDrop />
        <div className="mt-5">
          <BankuKalaWinRate />
        </div>
      </div>

      <InvestorProposalPanel user={user} />

      <Link to="/rewards" className="block rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 mb-8 hover:border-primary transition-colors">
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0"><Gift className="w-7 h-7 text-primary" /></div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Reward Hub</p>
            <p className="text-xl font-extrabold">Earn points · Level up · Unlock perks</p>
            <p className="text-sm text-muted-foreground mt-0.5">Daily check-ins, weekly rewards, badges, and a leaderboard.</p>
          </div>
          <span className="text-sm text-primary font-semibold shrink-0">Open →</span>
        </div>
      </Link>

      <div className="mb-8">
        <WealthProgressChart />
      </div>

      <div className="space-y-5 mb-8">
        <CrxsVolumeChart />
        <CrxsTransferIndex userId={user?.id} />
      </div>

      <div className="space-y-5 mb-8">
        <BankrollSnapshot />
        <BankrollProgressionChart />
        <PredictedVsActualChart />
        <EngineConfidenceChart />
        <AccuracyTrendChart />
        <RolloverProgress />
        <BankrollChart />
        <RolloverSummaryTable />
        <RolloverHistory />
      </div>

      <div className="mb-8">
        <BookingCalendarSync />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {SERVICES.map((s, i) => (
          <motion.div key={s.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link
              to={s.path}
              className="block glass rounded-3xl border border-border/60 p-7 h-full hover:border-primary/50 hover:-translate-y-0.5 transition-all"
            >
              <div className="text-3xl mb-4">{s.emoji}</div>
              <h3 className="text-lg font-bold">{s.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.tagline}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <Link to="/driver-signup" className="mt-8 block glass rounded-3xl border border-primary/40 p-6 flex items-center gap-4 hover:border-primary transition-colors">
        <div className="size-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0"><Car className="w-6 h-6 text-primary" /></div>
        <div className="flex-1">
          <p className="font-semibold">Drive with RIDE X</p>
          <p className="text-sm text-muted-foreground">Sign up as a driver, get approved, and start receiving ride pings — earn on your schedule.</p>
        </div>
        <span className="text-sm text-primary font-semibold shrink-0">Get started →</span>
      </Link>

      <div className="mt-8"><AdBanner type="native" label="Sponsored · List your venue on Vibe & Tap today" /></div>

      <div className="grid lg:grid-cols-3 gap-5 mt-8">
        <Panel title="Recent rides" empty="No rides yet">
          {rides.map((r) => (
            <Row key={r.id} left={r.dest_address} right={<StatusBadge status={r.status} />} sub={money(r.accepted_amount || r.offer_amount)} to={`/ride-tracking?id=${r.id}`} />
          ))}
        </Panel>
        <Panel title="Deliveries" empty="No deliveries yet">
          {deliveries.map((d) => (
            <Row key={d.id} left={d.tracking_number || d.delivery_address} right={<StatusBadge status={d.status} />} sub={money(d.amount)} to={`/delivery-tracking?id=${d.id}`} />
          ))}
        </Panel>
        <Panel title={`Spend · ${money(spent)}`} empty="No transactions yet">
          {txs.map((t) => (
            <Row key={t.id} left={t.description} right={<StatusBadge status={t.status} />} sub={money(t.amount, t.currency)} />
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children, empty }) {
  const items = React.Children.toArray(children);
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6">
      <h3 className="font-semibold mb-4">{title}</h3>
      {items.length ? <div className="space-y-3">{items}</div> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Row({ left, right, sub, to }) {
  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm truncate">{left || "—"}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {right}
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-80">{body}</Link> : body;
}