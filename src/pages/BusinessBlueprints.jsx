import React, { useMemo, useState } from "react";
import { LOAN_GUIDE, LOAN_CHECKLIST, TIERS } from "@/lib/businessBlueprints";
import PageHeader from "@/components/shared/PageHeader";
import LoanFinder from "@/components/blueprint/LoanFinder";
import LenderDirectory from "@/components/blueprint/LenderDirectory";
import LoanApplicationForm from "@/components/blueprint/LoanApplicationForm";
import WealthProgressChart from "@/components/dashboard/WealthProgressChart";
import { Button } from "@/components/ui/button";
import { Wallet, Landmark, CheckCircle2, Banknote, Lightbulb, TrendingUp, Megaphone, Repeat, Wrench, Send } from "lucide-react";

// The lever that unlocks each capital tier — the reinvestment discipline and
// structural move that graduates a business from one tier to the next.
const SCALING_LEVERS = [
  "Reinvest 100% of profit for 90 days — no salary yet. Master one product, one channel.",
  "Buy in bulk, cut unit cost 15%. Add a 2nd sales channel (WhatsApp + Instagram live).",
  "Hire your first helper (₦40k/mo). Write a daily routine so the work runs without you watching.",
  "Open a 2nd outlet or production line. Separate personal and business bank accounts.",
  "Register a LTD, get a TIN, and approach BOI for working-capital debt (not equity).",
  "Build a 3–5 person team. Add machinery to 3x output without 3x labor cost.",
  "Launch your own brand / DTC. Move up the value chain from trading to making.",
  "Branch into 2–3 cities. Appoint a GM so you stop running daily operations yourself.",
  "Build distribution partnerships and start exporting within ECOWAS.",
  "Acquire a smaller competitor. Professionalize finance with monthly board review.",
  "Franchise or raise institutional capital. Build a legacy holding company that outlives you.",
];

function Naira() { return <span className="font-heading">₦</span>; }

function CapitalRow({ item, budget }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground flex-1">{item[0]}</span>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{item[1]}</span>
    </div>
  );
}

function BlueprintCard({ biz, capital }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden card-lift">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left p-4 sm:p-5 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
          <Wrench className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base sm:text-lg leading-tight">{biz.name}</h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{biz.why}</p>
          <p className="text-xs mt-2 text-primary font-semibold">Expected profit: {biz.profit}</p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-secondary/60 text-muted-foreground">{open ? "Hide" : "Blueprint"}</span>
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 space-y-4 animate-fade-in">
          {/* Capital split */}
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> {capital} Capital Split</p>
            <div className="rounded-xl bg-secondary/40 px-3 py-1">
              {biz.capital_split.map((it, i) => <CapitalRow key={i} item={it} />)}
            </div>
          </div>

          {/* Production */}
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> Production & Operations</p>
            <ol className="space-y-1.5">
              {biz.production.map((p, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Marketing */}
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Marketing</p>
            <ul className="space-y-1.5">
              {biz.marketing.map((p, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>)}
            </ul>
          </div>

          {/* Promotion */}
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Promotion</p>
            <ul className="space-y-1.5">
              {biz.promotion.map((p, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>)}
            </ul>
          </div>

          {/* Consistency */}
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Consistency & Growth</p>
            <ul className="space-y-1.5">
              {biz.consistency.map((p, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusinessBlueprints() {
  const [tierIdx, setTierIdx] = useState(0);
  const [showApply, setShowApply] = useState(false);
  const tier = TIERS[tierIdx];

  const totalLoanSources = useMemo(() => LOAN_GUIDE.length, []);

  return (
    <div>
      <PageHeader
        eyebrow="💼 Ride X Wealth"
        title="Small-Capital Business Blueprints"
        subtitle="Real, single-person Nigerian businesses you can start alone — from ₦200k starter hustles to ₦1bn enterprise builds. Tap any business to reveal its full blueprint: capital split, production, marketing, promotion, consistency — plus the Scaling Roadmap and how to secure a loan."
        action={<div className="inline-flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-full font-semibold"><Banknote className="w-4 h-4" /> {totalLoanSources} loan sources</div>}
      />

      {/* Progress chart — track your climb toward ₦1bn across all 11 tiers */}
      <div className="mb-6">
        <WealthProgressChart />
      </div>

      {/* Tier selector */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
        {TIERS.map((t, i) => (
          <button
            key={t.capital}
            onClick={() => setTierIdx(i)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition ${i === tierIdx ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60 hover:border-primary/50"}`}
          >
            {t.capital}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mb-5 max-w-2xl">{tier.summary}</p>

      <div className="grid gap-3 sm:gap-4">
        {tier.businesses.map((biz) => (
          <BlueprintCard key={biz.name} biz={biz} capital={tier.capital} />
        ))}
      </div>

      {/* Scaling Roadmap */}
      <div className="mt-10">
        <PageHeader
          eyebrow="📈 Scale Up"
          title="The Scaling Roadmap"
          subtitle="From ₦200k to ₦1bn — the single lever that unlocks each tier and the reinvestment discipline that gets you there."
        />
        <div className="space-y-2">
          {TIERS.map((t, i) => (
            <div key={t.capital} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 card-lift">
              <span className="shrink-0 w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-extrabold text-sm tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm sm:text-base">{t.capital}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{SCALING_LEVERS[i] || "Compound reinvestment."}</p>
              </div>
              {i < TIERS.length - 1 && <TrendingUp className="w-4 h-4 text-primary/50 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Loan section */}
      <div className="mt-10">
        <PageHeader
          eyebrow="💰 Funding"
          title="How to Secure a Loan"
          subtitle="From microfinance banks to CBN schemes — the realistic paths, amounts, and paperwork to get capital in Nigeria."
          action={<Button onClick={() => setShowApply(true)} className="rounded-full"><Send className="w-4 h-4" /> Apply for funding</Button>}
        />

        <LoanApplicationForm tier={tier} open={showApply} onClose={() => setShowApply(false)} />

        <LoanFinder amount={tier.capital} />

        {/* Manual lender directory — reliable fallback emails, admin-managed */}
        <LenderDirectory />

        {/* Checklist */}
        <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <p className="text-sm font-bold text-primary mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Documents you'll need for almost any loan</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {LOAN_CHECKLIST.map((c, i) => (
              <div key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-primary font-bold">{i + 1}.</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border/60 bg-card p-4 sm:p-5 flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">The one rule that beats all the rest:</span> bank 20% of every sale from day one — before you pay rent, buy stock, or touch profit. A business that can't pay itself first for 90 days dies by month four. Start small, stay consistent, and let compound reinvestment grow you from ₦200k to ₦2m inside a year.
        </p>
      </div>
    </div>
  );
}