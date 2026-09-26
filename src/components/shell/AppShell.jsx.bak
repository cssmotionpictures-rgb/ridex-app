import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { SERVICES, CONTACT } from "@/lib/catalog";
import { LayoutGrid, User, ShieldCheck, LifeBuoy, LogOut, Car, Gift, CreditCard, ShieldAlert, Route, Megaphone, Plane, ShieldBan, Send, Receipt, Mic2, ScrollText, Copyright, Volume2, VolumeX, Briefcase, Radar, Radio, CalendarCheck, Sigma, Brain, Lightbulb, Zap, Trophy, Flame, Target, Heart, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNewBookings } from "@/hooks/useNewBookings";
import { useClickTone, isClickToneOn, setClickTone } from "@/hooks/useClickTone";
import RideXQueen from "@/components/assistant/RideXQueen";
import GlobalNewsAlert from "@/components/shell/GlobalNewsAlert";
import WinCelebrationOverlay from "@/components/sports/WinCelebrationOverlay";
import GlobalLivePing from "@/components/shell/GlobalLivePing";
import ErrorBoundary from "@/components/ErrorBoundary";
import BackButton from "@/components/shared/BackButton";
import { runWeeklyBroadcast, lagosNow, lagosDate } from "@/lib/clientBackdoor";
import { settleBankuPicks } from "@/lib/bankuLedger";
import { celebrateWin } from "@/lib/winCelebration";

export default function AppShell() {
  const { pathname } = useLocation();
  const [user, setUser] = React.useState(null);
  const [isDriver, setIsDriver] = React.useState(false);
  const [toneOn, setToneOnState] = React.useState(typeof window !== "undefined" && isClickToneOn());
  useClickTone();
  const toggleTone = () => { const next = !toneOn; setClickTone(next); setToneOnState(next); };

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      const d = await base44.entities.Driver.filter({ created_by_id: u.id }).catch(() => []);
      setIsDriver(d.length > 0);
      // Zero-credit weekly email heartbeat — fires the Monday newsletter + B2B
      // blast automatically when an admin opens the app. No Base44 scheduler is
      // used, so it costs 0 integration credits. The function is idempotent
      // (runs at most once each Monday) so fire-and-forget is safe.
      // Zero-credit weekly email heartbeat — fires the Monday newsletter + B2B
      // blast automatically when an admin opens the app. Backend function first;
      // if it's blocked (credits exhausted) fall back to the client-side back
      // door so the Monday broadcast NEVER misses. Idempotent (once/week).
      if (u?.role === "admin") {
        base44.functions.invoke("email-weekly", { force: false })
          .catch(() => { if (lagosNow().getDay() === 1) runWeeklyBroadcast(base44, { force: false }).catch(() => {}); });
        // Zero-credit weekly CRXS digest heartbeat (Gmail). Idempotent — the
        // function real-sends at most once per 7 days, so fire-and-forget is safe.
        base44.functions.invoke("crxs-weekly-digest", { force: false }).catch(() => {});
        // Significant CrixCoin transaction alert (Gmail → the admin). Idempotent —
        // only emails when a COMPLETED ledger movement crosses the threshold
        // since the last check window. Fires silently if the function is not
        // deployed (pipeline outage) — nothing is lost, the next open re-checks.
        base44.functions.invoke("crxs-tx-alert", {}).catch(() => {});
      }
    }).catch(() => setUser(null));
  }, []);

  // WIN NOTIFICATION SYSTEM — the moment any user opens the app, past-day
  // slip picks (BANKu & KALA) settle against the REAL final scores, wherever
  // the user is in the app. Every WIN fires the voice shout, the toast
  // notification and the congratulations badge overlay — each win celebrates
  // exactly once, no matter how often the settle runs.
  React.useEffect(() => {
    const t = setTimeout(() => {
      settleBankuPicks()
        .then(({ wins }) => (wins || []).forEach((w) => celebrateWin(w)))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const isAdmin = user?.role === "admin";
  const { count, markSeen } = useNewBookings(isAdmin);

  // Acknowledge new bookings shortly after the admin opens the Admin page.
  React.useEffect(() => {
    if (pathname !== "/admin") return;
    const t = setTimeout(() => markSeen(), 4000);
    return () => clearTimeout(t);
  }, [pathname, markSeen]);

  // PUBLIC MENU POLICY — regular users see ONLY the three brands (RIDE X,
  // CRIXCOIN, CSS Entertainment) plus their personal account essentials.
  // Admins keep the full service menu. Direct URLs keep working for everyone.
  const brandNav = [
    { name: "RIDE X", path: "/ride", emoji: "🚗" },
    { name: "CRIXCOIN", path: "/crix", icon: Coins },
    { name: "CSS Entertainment", path: "/movies", emoji: "🎬" },
  ];
  const essentialsNav = [
    { name: "Profile", path: "/profile", icon: User },
    { name: "Support", path: "/support", icon: LifeBuoy },
    { name: "Safety", path: "/safety", icon: ShieldAlert },
    ...(isDriver ? [{ name: "Driver", path: "/driver-app", icon: Car }, { name: "Driver Safety", path: "/driver-safety", icon: ShieldAlert }] : []),
  ];
  const nav = isAdmin
    ? [
        { name: "Home", path: "/dashboard", icon: LayoutGrid },
        ...SERVICES.map((s) => ({ name: s.name, path: s.path, emoji: s.emoji })),
        { name: "Mingle", path: "/mingle", icon: Heart },
        { name: "CrixCoin", path: "/crix", icon: Coins },
        { name: "CRXS", path: "/quickcoin", icon: Coins },
        { name: "Card", path: "/card", icon: CreditCard },
        { name: "Virtual Cards", path: "/virtual-cards", icon: CreditCard },
        { name: "Receipts", path: "/receipts", icon: Receipt },
        { name: "Rewards", path: "/rewards", icon: Gift },
        { name: "Watch Ads", path: "/watch-ads", emoji: "📺" },
        { name: "Wealth Lab", path: "/business-blueprints", icon: Briefcase },
        { name: "Opportunity Radar", path: "/opportunity-radar", icon: Radar },
        { name: "Live Monitor", path: "/live-sports-monitor", icon: Radio },
        { name: "WIN RABA", path: "/win-raba", icon: Sigma },
        { name: "KALA", path: "/kala", icon: Brain },
        { name: "RUN O", path: "/run-o", icon: Zap },
        { name: "MONSTER", path: "/monster", icon: Flame },
        { name: "SURE WINS", path: "/sure-wins", icon: Target },
        { name: "Results", path: "/results", icon: Trophy },
        { name: "Learning Hub", path: "/intelligence", icon: Lightbulb },
        { name: "Tour Runs", path: "/agency/tours", icon: Route },
        { name: "Bookings", path: "/agency/bookings", icon: CalendarCheck },
        { name: "Media Hub", path: "/agency/media", icon: Megaphone },
        { name: "Zero-Rejection", path: "/zero-rejection", icon: ShieldCheck },
        { name: "Tarmac", path: "/agency/tarmac", icon: Plane },
        { name: "Broadcast", path: "/agency/broadcast", icon: Send },
        { name: "Proposal Lab", path: "/proposal-lab", icon: Send },
        { name: "Blacklist", path: "/agency/blacklist", icon: ShieldBan },
        { name: "Studio Features", path: "/studio-features", icon: Mic2 },
        { name: "Sample Clearance", path: "/sample-clearance", icon: ScrollText },
        { name: "Copyright Desk", path: "/copyright", icon: Copyright },
        { name: "Profile", path: "/profile", icon: User },
        { name: "Support", path: "/support", icon: LifeBuoy },
        { name: "Safety", path: "/safety", icon: ShieldAlert },
        { name: "Refer & Earn", path: "/referral", icon: Gift },
        ...(isDriver ? [{ name: "Driver", path: "/driver-app", icon: Car }, { name: "Driver Safety", path: "/driver-safety", icon: ShieldAlert }] : []),
      ]
    : [
        { name: "Home", path: "/dashboard", icon: LayoutGrid },
        ...brandNav,
        ...essentialsNav,
      ];

  return (
    <div className="min-h-screen app-bg-template">
      <header className="sticky top-0 z-[500] border-b border-border/60 glass">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-6">
          <BackButton fallback="/dashboard" />
          <Link to="/dashboard" className="font-heading font-extrabold text-lg tracking-tight">
            RIDE <span className="text-primary">X</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto no-scrollbar">
            {nav.map((n) => (
              <Link
                key={n.path}
                to={n.path}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  pathname === n.path ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n.emoji ? `${n.emoji} ` : ""}
                {n.name}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user?.role === "admin" && (
              <Link to="/admin" className="relative inline-flex">
                <Button variant="outline" size="sm" className="rounded-full">
                  <ShieldCheck className="w-4 h-4 mr-1" /> Admin
                </Button>
                {count > 0 && pathname !== "/admin" && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            )}
            <Button variant="ghost" size="sm" className="rounded-full" onClick={toggleTone} aria-label="Toggle click sound" title={toneOn ? "Click sound on" : "Click sound off"}>
              {toneOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => base44.auth.logout()} aria-label="Log out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="lg:hidden px-3 pb-3 pt-1 flex gap-1.5 overflow-x-auto no-scrollbar scroll-pl-3">
          {nav.map((n) => (
            <Link
              key={n.path}
              to={n.path}
              className={`px-3.5 py-2 rounded-full text-xs whitespace-nowrap min-h-[36px] inline-flex items-center ${
                pathname === n.path ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"
              }`}
            >
              {n.emoji ? `${n.emoji} ` : ""}
              {n.name}
            </Link>
          ))}
        </div>
      </header>

      <GlobalNewsAlert />

      <main key={pathname} className="max-w-7xl mx-auto px-5 py-8">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-border/60 mt-16 py-10 text-center text-xs text-muted-foreground space-y-1">
        <p className="text-foreground font-heading font-semibold">RIDE X by CSS Entertainment</p>
        <p className="text-[10px]">RIDE X is a product/platform of CSS ENTERTAINMENT (RC 7573127), incorporated in Nigeria on June 11, 2024. RIDE X, CSS Entertainment and CRXS are not licensed, regulated, listed or exchange-traded financial products unless and until the relevant approval actually exists.</p>
        <p>{CONTACT.email} · {CONTACT.website} · {CONTACT.social}</p>
        <p>
          <Link to="/terms" className="text-primary hover:underline">Terms & Conditions</Link>
          {" · "}
          <Link to="/driver-terms" className="text-primary hover:underline">Driver Terms</Link>
          {" · "}
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </p>
      </footer>

      <RideXQueen />
      <WinCelebrationOverlay />
      <GlobalLivePing />
    </div>
  );
}