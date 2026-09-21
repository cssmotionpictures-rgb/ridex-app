import React from "react";
import { invokeCrixFunction } from "@/lib/crix";
import { Sprout, Loader2, Info } from "lucide-react";

const TIERS = [
  { id: "root", label: "Root", min: 10000, pct: "0.25%" },
  { id: "branch", label: "Branch", min: 100000, pct: "0.5%" },
  { id: "canopy", label: "Canopy", min: 500000, pct: "0.75%" },
  { id: "symbiosis", label: "Symbiosis", min: 2000000, pct: "1%" },
];

const TIER_LABEL = { root: "Root", branch: "Branch", canopy: "Canopy", symbiosis: "Symbiosis" };
const ngn = (v) => "₦" + Number(v || 0).toLocaleString();

// SYMBIOTIC RESTORATION REWARDS — the customer's loyalty view. All math runs
// on the secured server function from real settled records; the screen only
// displays what it computed.
export default function SymbioticRewards({ user }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    setError("");
    invokeCrixFunction("symbiotic-rewards", { action: "me" })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  if (error) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <p className="font-semibold">Rewards are not available right now</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <button onClick={load} className="mt-4 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[40px]">Try again</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const cur = data.current || {};
  const tierIdx = TIERS.findIndex((t) => t.id === cur.tier);
  const next = tierIdx >= 0 ? TIERS[tierIdx + 1] : TIERS[0];
  const progress = next ? Math.min(100, Math.round((Number(cur.volume_ngn || 0) / next.min) * 100)) : 100;

  return (
    <div className="space-y-4">
      {data.settled_now ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-300">Loyalty bonus granted 🌿</p>
          <p className="text-muted-foreground mt-0.5">
            {ngn(data.settled_now.bonus_ngn)} for your {data.settled_now.period} activity — it is already in your Naira wallet.
          </p>
        </div>
      ) : null}

      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
            <Sprout className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Symbiotic tier</p>
            <p className="text-2xl font-extrabold gold-text">{cur.tier === "none" ? "Seed" : TIER_LABEL[cur.tier] || cur.tier}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-2xl bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground">This month's activity</p>
            <p className="text-sm font-bold mt-0.5">{ngn(cur.volume_ngn)}</p>
          </div>
          <div className="rounded-2xl bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground">Active days</p>
            <p className="text-sm font-bold mt-0.5">{Number(cur.activity_days || 0)}</p>
          </div>
          <div className="rounded-2xl bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground">Projected bonus</p>
            <p className="text-sm font-bold mt-0.5 text-primary">{ngn(cur.bonus_ngn)}</p>
          </div>
        </div>

        {next ? (
          <div className="mt-5">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>Progress to {next.label}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: progress + "%" }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {ngn(Math.max(0, next.min - Number(cur.volume_ngn || 0)))} more activity this month unlocks {next.label} ({next.pct} bonus rate).
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-4">You are at the highest tier — Symbiosis.</p>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-3">How it works</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TIERS.map((t) => (
            <div key={t.id} className={"rounded-2xl p-3 text-center " + (cur.tier === t.id ? "bg-primary/15 border border-primary/40" : "bg-secondary/50")}>
              <p className="text-xs font-bold">{t.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{ngn(t.min)}+ monthly</p>
              <p className="text-[11px] font-semibold text-primary mt-0.5">{t.pct} back</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 text-[11px] text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>Your bonus is counted from real settled activity — bills paid, betting top-ups, dollar cards and crix sends. It settles automatically as a Naira wallet credit the month after it is earned, funded from platform fee revenue. No tokens are ever minted for rewards, and the bonus caps at ₦5,000 a month.</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-3">Your reward history</h3>
        {!data.rewards || !data.rewards.length ? (
          <p className="text-sm text-muted-foreground">No rewards yet — keep paying bills and using CRIXCOIN; your first bonus settles next month.</p>
        ) : (
          <div className="space-y-2">
            {data.rewards.map((r) => (
              <div key={r.period + r.status} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/40 border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">{r.period} · {r.tier === "none" ? "—" : TIER_LABEL[r.tier] || r.tier}</p>
                  <p className="text-[11px] text-muted-foreground">{ngn(r.volume_ngn)} activity · {Number(r.activity_days || 0)} active days</p>
                </div>
                <div className="text-right">
                  <p className={"text-sm font-bold " + (r.status === "granted" ? "text-emerald-400" : "text-destructive")}>{ngn(r.bonus_ngn)}</p>
                  <p className="text-[11px] text-muted-foreground">{r.status === "granted" ? "Credited" : "Failed"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}