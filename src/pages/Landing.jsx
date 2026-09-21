import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/lib/catalog";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Clock, MapPin, Wallet } from "lucide-react";

const WELCOME_LINE = "Welcome to Ride X, how may we help you today?";

// The ONLY three brands this platform presents to the public —
// RIDE X, CRIXCOIN and CSS Entertainment. No other services are shown.
const BRANDS = [
  {
    key: "crixcoin",
    emoji: "🪙",
    name: "CRIXCOIN",
    tagline: "Your crypto wallet",
    body: "Hold and send CRXS, claim your Crix ID, pay bills and shop with a virtual dollar card — your money, your keys.",
    path: "/crix",
    accent: "from-amber-400/30 to-yellow-700/20",
  },
  {
    key: "ridex",
    emoji: "🚗",
    name: "RIDE X",
    tagline: "Move anything, anywhere",
    body: "Bid your own fare, track every ride live on the map and send parcels across town — with escrow-protected payments.",
    path: "/ride",
    accent: "from-sky-500/30 to-indigo-700/20",
  },
  {
    key: "css",
    emoji: "🎬",
    name: "CSS ENTERTAINMENT",
    tagline: "Stream & vibe",
    body: "Stream CSS Motion Pictures, live TV stations, concerts and RIDE X Sounds — non-stop entertainment.",
    path: "/movies",
    accent: "from-fuchsia-500/30 to-purple-700/20",
  },
];

const PILLARS = [
  { icon: Zap, title: "Three brands, one login", body: "RIDE X, CRIXCOIN and CSS Entertainment — one free account unlocks them all." },
  { icon: Wallet, title: "CRIXCOIN wallet & escrow", body: "Pay from your CRIXCOIN wallet — money is held safely and only released when the job is done right." },
  { icon: MapPin, title: "Live tracking & SOS", body: "Watch every ride and delivery move in real time, with a one-tap SOS that alerts our safety team." },
];

export default function Landing() {
  const [spoken, setSpoken] = React.useState(false);

  const speak = React.useCallback(() => {
    if (spoken || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(WELCOME_LINE);
      u.lang = "en-US"; u.rate = 0.98; u.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /en-US|en_US|en-GB|en_GB/i.test(v.lang) && /female|samantha|google/i.test(v.name)) || voices.find((v) => /en/i.test(v.lang));
      if (preferred) u.voice = preferred;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setSpoken(true);
    } catch {}
  }, [spoken]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const t = setTimeout(speak, 600);
    const onFirst = () => { speak(); window.removeEventListener("pointerdown", onFirst); };
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", onFirst); window.speechSynthesis?.cancel?.(); };
  }, [speak]);

  const stats = [
    { icon: Zap, label: "3 brands · 1 app" },
    { icon: MapPin, label: "Live tracking" },
    { icon: ShieldCheck, label: "Escrow-protected" },
    { icon: Clock, label: "24/7 support" },
  ];

  return (
    <div className="min-h-screen app-bg-template">
      <header className="sticky top-0 z-[500] border-b border-border/40 glass">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="font-heading font-extrabold text-xl tracking-tight">RIDE <span className="text-primary">X</span></Link>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" className="rounded-full">Log in</Button></Link>
            <Link to="/register"><Button className="rounded-full font-semibold">Get started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-mesh">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xs uppercase tracking-[0.35em] text-primary mb-6">
            RIDE X · CRIXCOIN · CSS Entertainment
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.05]"
          >
            Ride, pay and<br />
            <span className="gold-text">stream</span> — all in RIDE X.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="text-muted-foreground text-base sm:text-lg mt-7 max-w-2xl mx-auto"
          >
            Hail rides and track them live, hold your own CRIXCOIN, and stream the best of
            CSS Entertainment — three powerhouses in one premium app.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/register"><Button size="lg" className="rounded-full h-12 px-8 font-semibold">Create account <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/login"><Button size="lg" variant="outline" className="rounded-full h-12 px-8">I have an account</Button></Link>
            <Link to="/admin/crxs-launch">
              <Button size="lg" className="rounded-full h-12 px-8 font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400">
                🦊 Connect MetaMask — Deploy CRXS <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>

          <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-2">
                <s.icon className="w-4 h-4 text-primary" /> {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The three brands */}
      <section className="max-w-7xl mx-auto px-5 sm:px-6 pb-20">
        <div className="text-center mb-8 mt-6">
          <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">Everything we do</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold">Three powerhouses, one app</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
          {BRANDS.map((b, i) => (
            <Link key={b.key} to={b.path} className="group">
              <div
                className="relative h-full rounded-2xl sm:rounded-3xl border border-border/60 overflow-hidden card-lift animate-fade-in"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${b.accent}`} />
                <div className="absolute inset-0 bg-card/40 backdrop-blur-[1px]" />
                <div className="relative p-6 sm:p-7 flex flex-col h-full min-h-[240px]">
                  <div className="text-4xl mb-4">{b.emoji}</div>
                  <h3 className="text-lg font-bold leading-tight">{b.name}</h3>
                  <p className="text-xs uppercase tracking-wider text-primary/80 mt-1">{b.tagline}</p>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{b.body}</p>
                  <span className="mt-auto pt-5 inline-flex items-center text-sm font-semibold text-primary">
                    Open <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Why Ride X */}
      <section className="max-w-7xl mx-auto px-5 sm:px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => (
            <div key={p.title} className="glass rounded-3xl border border-border/60 p-6 animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-7xl mx-auto px-5 sm:px-6 pb-24">
        <div className="hero-mesh rounded-3xl border border-primary/30 p-10 sm:p-14 text-center">
          <h2 className="text-2xl sm:text-4xl font-extrabold">Ready to ride, pay and stream?</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Create your free account in seconds and unlock RIDE X, CRIXCOIN and CSS Entertainment in one place.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register"><Button size="lg" className="rounded-full h-12 px-8 font-semibold">Get started free <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/support"><Button size="lg" variant="outline" className="rounded-full h-12 px-8">Talk to support</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-xs text-muted-foreground space-y-1">
        <p className="text-foreground font-heading font-semibold">RIDE X — the all-in-one platform</p>
        <p>{CONTACT.email} · {CONTACT.website} · {CONTACT.social}</p>
        <p>
          <Link to="/terms" className="text-primary hover:underline">Terms</Link>
          {" · "}
          <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>
          {" · "}
          <Link to="/driver-terms" className="text-primary hover:underline">Driver Terms</Link>
        </p>
      </footer>
    </div>
  );
}