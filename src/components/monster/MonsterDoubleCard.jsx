import React from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// TODAY'S MONSTER DOUBLE — the top two no-draw value-zone favorites behind a
// green→cyan glow frame. Odds are exact model fair odds and the badge shows
// the honest combined win chance — never an invented "edge".

export default function MonsterDoubleCard({ double, loading }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  if (loading) {
    return (
      <div className="mdouble-frame">
        <div className="mdouble-inner px-4 py-5 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin mtext-cyan" />
          <span className="text-xs text-[#8a99ad] font-bold">Scanning live pools for today's double…</span>
        </div>
      </div>
    );
  }

  if (!double || double.legs.length < 2) {
    return (
      <div className="mdouble-frame">
        <div className="mdouble-inner px-4 py-4 text-center">
          <p className="text-xs font-black text-white mb-1">🔥 TODAY'S MONSTER DOUBLE</p>
          <p className="text-[10px] text-[#8a99ad]">
            Fewer than two in-zone favorites (1.25–1.55 fair odds) with verified form right now — the double is only dealt when real data fills it.
          </p>
        </div>
      </div>
    );
  }

  const combinedShown = double.combinedReal || double.combined;
  const combinedLabel = double.combinedReal ? "REAL BOOK ODDS" : "MODEL FAIR ODDS";
  const legLines = double.legs
    .map((l, i) => `${i + 1}) ${l.marketLabel} — ${(l.realOdds?.price || l.fairOdds).toFixed(2)}${l.realOdds ? " (real book price)" : " (model fair)"} · ${Math.round(l.probability * 100)}% model\n   ${l.home} vs ${l.away} · ${l.league} · ${l.date}`)
    .join("\n");
  const slipCode = `🔥 RIDE X — MONSTER DOUBLE\n${legLines}\nCombined: ${combinedShown.toFixed(2)} ${combinedLabel} · honest win chance ≈ ${Math.round(double.winProb * 100)}%`;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(slipCode);
      } else {
        // legacy fallback for browsers without the async clipboard API
        const ta = document.createElement("textarea");
        ta.value = slipCode;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      toast({ title: "Slip code copied", description: "Paste it anywhere — every number is straight from the model engine." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy not available on this device", variant: "destructive" });
    }
  };

  return (
    <div className="mdouble-frame">
      <div className="mdouble-inner p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-black text-white">🔥 TODAY'S MONSTER DOUBLE</p>
          <span className="px-2 py-0.5 rounded-md bg-[#00e676] text-[#0b0e14] text-[10px] font-black shrink-0">
            {Math.round(double.winProb * 100)}% WIN CHANCE
          </span>
        </div>
        <div className="space-y-1">
          {double.legs.map((l, i) => (
            <div key={i}>
              {i > 0 && <div className="h-px bg-white/10 my-2.5" />}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#8a99ad]">
                    MATCH {i + 1} · {l.sport.toUpperCase()}{double.fromToday ? "" : ` · ${l.date}`}
                  </p>
                  <p className="text-[13px] font-bold text-white truncate">{l.marketLabel}</p>
                  <p className="text-[9px] text-[#8a99ad] truncate">{l.home} vs {l.away} · {l.league}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="mtext-cyan text-[14px] font-black">{(l.realOdds?.price || l.fairOdds).toFixed(2)}</p>
                  <p className="text-[9px] mtext-green font-bold">{Math.round(l.probability * 100)}% MODEL</p>
                  <p className="text-[8px] text-[#8a99ad] font-bold">{l.realOdds ? `REAL · ${l.realOdds.bookmaker || "BOOK"}` : "MODEL FAIR"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 mt-3 mb-3">
          <p className="text-[10px] text-[#8a99ad] font-bold">
            COMBINED <span className="mtext-cyan font-black">{combinedShown.toFixed(2)}</span> {combinedLabel}
          </p>
          <p className="text-[10px] text-[#8a99ad] font-bold">
            BOTH WIN ≈ <span className="mtext-green font-black">{Math.round(double.winProb * 100)}%</span>
          </p>
        </div>
        <button onClick={copy} className="mcopy-btn w-full h-11 rounded-lg text-[13px] font-black tracking-wide flex items-center justify-center gap-2">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "SLIP CODE COPIED" : "COPY BET SLIP CODE"}
        </button>
      </div>
    </div>
  );
}