import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatCrix } from "@/lib/crix";
import { Image } from "@/components/ui/image";
import { Coins, Car, Film, ArrowUpRight, ArrowDownLeft, BadgeCheck, ChevronRight } from "lucide-react";

// CLEAN WALLET DASHBOARD — exactly three things plus history: CRIXCOIN token
// details, the RIDE X (Naira) balance, and the CSS Entertainment feed, with
// one combined activity list (CrixCoin movements + recent Ride X rides).
// Nothing else is shown here. Every figure is read live from real records —
// never simulated.
export default function CrixHomeDashboard({ user, wallets }) {
  const [token, setToken] = React.useState(null);
  const [movies, setMovies] = React.useState(null);
  const [txs, setTxs] = React.useState(null);
  const [rides, setRides] = React.useState(null);

  React.useEffect(() => {
    base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" })
      .then((r) => setToken(r[0] || null))
      .catch(() => setToken(null));
    base44.entities.Movie.filter({ status: "published" }, "-created_date", 8)
      .then(setMovies)
      .catch(() => setMovies([]));
    const loadTxs = () => base44.entities.CrixTransaction.list("-created_date", 10).then(setTxs).catch(() => setTxs([]));
    loadTxs();
    const unsub = base44.entities.CrixTransaction.subscribe(loadTxs);
    return unsub;
  }, []);

  React.useEffect(() => {
    if (!user?.id) { setRides([]); return; }
    base44.entities.Ride.filter({ created_by_id: user.id }, "-created_date", 5)
      .then(setRides)
      .catch(() => setRides([]));
  }, [user?.id]);

  const crxsWallet = (wallets || [])[0] || null;
  const ngnWallet = null;
  const deployed = token?.deployment_status === "DEPLOYED";
  const verified = token?.verification_status === "SOURCE_VERIFIED" || token?.verification_status === "ONCHAIN_VERIFIED";

  const history = React.useMemo(() => {
    const t = (txs || []).map((x) => ({
      kind: "crix", id: x.id, date: x.created_date,
      title: (x.sender_id === user?.id ? "To " + (x.recipient_email || "recipient") : "From " + (x.sender_email || "sender")),
      sub: "CrixCoin · " + x.crix_id, amount: (x.sender_id === user?.id ? "−" : "+") + formatCrix(x.amount, x.currency),
    }));
    const r = (rides || []).map((x) => ({
      kind: "ride", id: x.id, date: x.created_date,
      title: (x.pickup_address || "Pickup") + " → " + (x.dest_address || "destination"),
      sub: "RIDE X · " + String(x.status || "").replace("_", " "),
      amount: formatCrix(x.accepted_amount || x.offer_amount, "NGN"),
    }));
    return [...t, ...r].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 12);
  }, [txs, rides, user?.id]);

  return (
    <div className="space-y-4">
      {/* CRIXCOIN token + RIDE X balance */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-amber-500/15 to-yellow-700/5 p-5">
          <div className="flex items-center gap-2 text-primary">
            <Coins className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">CRIXCOIN</span>
          </div>
          <p className="text-3xl font-extrabold font-heading mt-3 tabular-nums">
            {crxsWallet ? Number(crxsWallet.balance_crxs || 0).toLocaleString("en-NG") : "—"} <span className="text-base text-primary">CRXS</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Your internal CrixCoin balance</p>
          <div className="mt-3 pt-3 border-t border-border/50 text-xs space-y-1">
            <p className="flex items-center gap-1.5">
              {verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
              {deployed ? (verified ? "Verified token on Base Mainnet" : "Deployed on Base Mainnet") : "Pre-launch · internal ledger"}
            </p>
            <p className="text-muted-foreground font-mono text-[10px] break-all">
              {deployed ? token.contract_address : "CRXS · CrixCoin · 500,000,000,000 fixed supply"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-primary">
            <Car className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">RIDE X BALANCE</span>
          </div>
          <p className="text-3xl font-extrabold font-heading mt-3 tabular-nums">
            {ngnWallet ? formatCrix(ngnWallet.balance_crxs, "NGN") : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Spendable Naira across every RIDE X service</p>
          <Link to="/ride" className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1 text-xs font-semibold text-primary">
            Book a ride <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* CSS Entertainment feed */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-primary">
            <Film className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">CSS ENTERTAINMENT</span>
          </div>
          <Link to="/movies" className="text-xs font-semibold text-primary inline-flex items-center gap-1">
            Open <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {movies === null ? (
          <div className="flex gap-3 overflow-hidden">
            <div className="h-40 w-28 rounded-xl bg-secondary animate-pulse" />
            <div className="h-40 w-28 rounded-xl bg-secondary animate-pulse" />
            <div className="h-40 w-28 rounded-xl bg-secondary animate-pulse" />
          </div>
        ) : movies.length === 0 ? (
          <p className="text-sm text-muted-foreground">New releases land here — check back soon.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {movies.map((m) => (
              <Link key={m.id} to="/movies" className="shrink-0 w-28 group">
                <Image
                  src={m.poster_url}
                  alt={m.title}
                  className="h-40 w-28 rounded-xl border border-border group-hover:border-primary/60 transition-colors"
                />
                <p className="text-xs font-semibold mt-1.5 truncate">{m.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{m.genre}{m.release_year ? " · " + m.release_year : ""}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Combined history — CrixCoin movements + Ride X activity */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-3">Your activity</p>
        {txs === null || rides === null ? (
          <p className="text-sm text-muted-foreground animate-pulse">Loading your history…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet — CrixCoin transfers and Ride X rides all appear here in one place.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.kind + h.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <span className={"w-8 h-8 rounded-full flex items-center justify-center shrink-0 " + (h.kind === "ride" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                  {h.kind === "ride" ? <Car className="w-4 h-4" /> : user && h.amount?.startsWith("+") ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{h.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{h.sub}{h.date ? " · " + new Date(h.date).toLocaleString("en-NG") : ""}</span>
                </span>
                <span className="text-sm font-bold tabular-nums shrink-0">{h.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}