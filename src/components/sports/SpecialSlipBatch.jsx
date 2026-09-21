import React from "react";
import { Loader2, Share2 } from "lucide-react";
import html2canvas from "html2canvas";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LegRow from "@/components/sports/LegRow";
import SlipSceneHeader from "@/components/sports/SlipSceneHeader";

// One named SPECIAL ODDS ticket — max 50 legs (the SportyBet accumulator
// limit). Every leg carries the engine's strictest qualifying pick (90%+
// model confidence), a second verified padding pick (90%+) where scrutiny
// allows, and its verified-feed corners line. Combined odds, honest
// all-legs-win chance, and per-slip 2,000,000 odds target progress.

const TARGET_ODDS = 2000000;

function fmt(n) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}m`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k`;
  return `₦${Math.round(n).toLocaleString()}`;
}

export function oddsLabel(n) {
  return n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2);
}

// Cinematic scene per slip — the banner shows the sport's own playing surface
// (pitch stripes, hardwood planks, hard-court lines, clay, yard lines, ice).
const sceneOf = (n) =>
  /BBALL|BASKETBALL/i.test(n) ? "basketball" :
  /TENNIS/i.test(n) ? "tennis" :
  /NFL/i.test(n) ? "nfl" :
  /MLB|BASEBALL/i.test(n) ? "baseball" :
  /NHL|HOCKEY/i.test(n) ? "hockey" : "football";

// Per-leg combined odds: main market × padding picks × corners line (all live
// on the same ticket). EXACT PRICING, never an assumption: the main market
// uses its REAL captured bookmaker price whenever the live odds feed covers
// the leg; every other pick is priced at its EXACT model fair odds
// (1 ÷ its verified probability). No invented bookmaker margin anywhere —
// model numbers stay model numbers, bookmaker numbers stay bookmaker numbers.

// Correlation haircut per EXTRA pick on the same game — same convention as
// the value engine's two-pick pairing (same-game picks are not independent).
const CORRELATION_HAIRCUT = 0.92;

function priceOf(pick) {
  const real = Number(pick?.odds);
  if (real > 1) return real; // real captured price
  const fair = Number(pick?.fairOdds);
  if (fair > 1) return fair; // exact model fair odds
  const prob = Number(pick?.prob ?? pick?.probability);
  return prob > 0 && prob < 1 ? 1 / prob : 1;
}

export function legOdds(p) {
  const feedPrice = p?.realOdds && !p.realOdds.status ? Number(p.realOdds.price) : 0;
  const main =
    feedPrice > 1 ? feedPrice
    : Number(p?.marketOdds) > 1 ? Number(p.marketOdds)
    : priceOf({ fairOdds: p?.fairOdds, prob: p?.prob ?? p?.probability });
  const comp = priceOf(p?.companion);
  const comp2 = priceOf(p?.companion2);
  const cor = priceOf(p?.corners);
  return main > 1 ? main * comp * comp2 * cor : 1;
}

export default function SpecialSlipBatch({ name, legs, scanning }) {
  const [stake, setStake] = React.useState("100");
  const [sharing, setSharing] = React.useState(false);
  const ticketRef = React.useRef(null);
  const { toast } = useToast();

  let combined = 1, winProb = 1;
  for (const p of legs) {
    combined *= legOdds(p);
    const extras = [p.companion, p.companion2, p.corners].filter(Boolean).length;
    winProb *=
      Number(p.probability || 0.5) *
      (Number(p.companion?.prob) || 1) * (Number(p.companion2?.prob) || 1) * (Number(p.corners?.prob) || 1) *
      Math.pow(CORRELATION_HAIRCUT, extras); // same-game picks are correlated — same haircut as the value engine's pairing
  }
  const targetReached = combined >= TARGET_ODDS;
  const progress = Math.max(3, Math.min(100, (Math.log(combined) / Math.log(TARGET_ODDS)) * 100));
  const stakeAmt = Math.max(0, Number(stake) || 0);
  const expected = stakeAmt * combined;

  const shareTicket = async () => {
    if (!ticketRef.current || sharing) return;
    setSharing(true);
    try {
      const canvas = await html2canvas(ticketRef.current, { backgroundColor: "#0d0d12", scale: 2 });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("render failed");
      const file = new File([blob], "ride-x-special-slip.png", { type: "image/png" });
      const text = `${name} — ${legs.length} legs · ${oddsLabel(combined)} combined odds · ₦${stake} → ${fmt(expected)}. Built by the Ride X model engine.`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "Ride X Special Odds Slip" });
        toast({ title: "Ticket shared", description: "Pick Instagram or TikTok from the share sheet to post it." });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ride-x-special-slip.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({ title: "Ticket image saved", description: "Post it to Instagram or TikTok from your gallery." });
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      toast({ title: "Could not create the ticket image", description: "Try again in a moment." });
    } finally {
      setSharing(false);
    }
  };

  if (!legs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-5 text-center">
        <p className="text-sm font-bold text-amber-400">{name} — NO QUALIFIED LEGS</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Not enough qualified games left in the pool for this slip. Legs only enter after verified form on both sides, last-5 head-to-head and scoring/conceding scrutiny — never invented.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <SlipSceneHeader
        scene={sceneOf(name)}
        kicker="RIDE X SPECIAL ODDS · SPORTYBET-READY"
        title={name}
        badges={[`${legs.length}/50 LEGS`, scanning ? "SCANNING LIVE FEED…" : `${oddsLabel(combined)} MODEL EST.`]}
      />
      <div ref={ticketRef} className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground">
              {legs.length}/50 legs · SportyBet-ready · surest 90%+ picks first, verified qualified picks fill the rest — every leg shows its real model % · H2H + scoring scrutiny · verified corner feed
            </p>
          </div>
          {scanning ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-secondary text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> SCANNING
            </span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${targetReached ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {oddsLabel(combined)} MODEL EST.
            </span>
          )}
        </div>

        <div className="rounded-xl bg-black/30 border border-border/40 px-3 py-2.5 space-y-1.5">
          <div className="h-2.5 rounded-full bg-black/40 border border-border/40 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className={`text-[10px] ${targetReached ? "text-emerald-400 font-semibold" : "text-amber-400"}`}>
            {scanning
              ? "Deep-scanning verified season data for 90%+ qualified games…"
              : targetReached
              ? "2,000,000 ODDS TARGET REACHED — this slip is full."
              : `${legs.length} verified legs · ${oddsLabel(combined)} combined — the slip only stacks games that pass every scrutiny gate.`}
          </p>
        </div>

        <div className="rounded-xl bg-black/30 border border-border/40 divide-y divide-border/30 max-h-44 overflow-y-auto no-scrollbar">
          {legs.map((p, i) => (
            <LegRow
              key={p.fixtureId || i}
              leg={p}
              index={i}
              odds={legOdds(p)}
              meta={
                `${p.date ? `${p.date} · ` : ""}${p.league} · ${p.marketLabel} ${Math.round((p.probability || 0) * 100)}%` +
                (p.companion ? ` · + ${p.companion.label} ${Math.round(p.companion.prob * 100)}% (verified)` : "") +
                (p.companion2 ? ` · + ${p.companion2.label} ${Math.round(p.companion2.prob * 100)}% (verified)` : "") +
                (p.corners ? ` · ${p.corners.label} (verified feed)` : "")
              }
            />
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground/70 text-center">Tap any leg to open its full prediction — every pick, padding and the verified deep analysis behind it.</p>

        <div className="flex items-end gap-3">
          <div className="space-y-1 w-28 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Stake (₦)</p>
            <Input type="number" min="0" className="h-8 rounded-lg text-xs" value={stake} onChange={(e) => setStake(e.target.value)} />
            <div className="flex gap-1">
              {[100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(String(v))}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${Number(stake) === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  ₦{v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-primary/10 border border-primary/25 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Expected winning</p>
            <p className="text-2xl font-extrabold text-primary leading-none">{fmt(expected)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(stakeAmt)} × {oddsLabel(combined)} model-est. odds · all {legs.length} legs must win</p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Honest odds: chance ALL {legs.length} legs win ≈{" "}
          <span className="text-amber-400 font-semibold">
            {(winProb * 100) >= 0.01 ? `${(winProb * 100).toFixed(2)}%` : `1 in ${Math.max(1, Math.round(1 / Math.max(winProb, 1e-12))).toLocaleString()}`}
          </span>{" "}
          — a lottery-style ticket, not a sure thing. Corners lines come only from the verified corner-data feed (real match corner statistics) — legs without tracked corner history carry no corner line at all. The + padding picks are extra markets on the same game, added only at 90%+ model confidence from verified scoring rates, and dropped whenever the last-5 head-to-head contradicts them. Leg pricing is exact: the main market uses its REAL captured bookmaker price whenever the odds feed covers it, and every padding/corner pick uses its exact model fair odds (1 ÷ verified probability) — no invented bookmaker margin anywhere. Model probabilities, never guarantees.
        </p>
        <p className="text-[9px] text-muted-foreground/50 text-center tracking-wider">RIDE X · MODEL ENGINE · MODEL PROBABILITIES, NEVER GUARANTEES</p>
      </div>
      <button
        onClick={shareTicket}
        disabled={sharing}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-bold text-xs py-2.5 disabled:opacity-60"
      >
        {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
        {sharing ? "RENDERING TICKET…" : "SHARE TO INSTAGRAM / TIKTOK"}
      </button>
    </div>
  );
}