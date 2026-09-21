import React from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Loader2, Trophy, BarChart3 } from "lucide-react";
import { settleBankuPicks, getBankuHistory } from "@/lib/bankuLedger";
import { celebrateWin } from "@/lib/winCelebration";

const SLIPS = [
  { key: "banku", label: "BANKu", note: "the morning 15" },
  { key: "kala", label: "KALA", note: "the daily verified 10 · 80%+" },
];

// PICK WIN RATE — LAST 7 DAYS. Every stored drop is graded against the real
// final score; this card settles any still-open past picks (wins fire the
// voice + badge celebration) and shows each slip's honest hit rate over the
// last week, day by day. Voids count toward nothing; awaiting games are
// shown, never hidden.
export default function BankuKalaWinRate() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await settleBankuPicks();
        (s.wins || []).forEach((w) => celebrateWin({ home: w.home, away: w.away, market: w.market }));
      } catch {}
      try {
        const [banku, kala] = await Promise.all([getBankuHistory(7, "banku"), getBankuHistory(7, "kala")]);
        if (alive) setData({ banku: banku || [], kala: kala || [] });
      } catch {
        if (alive) setData({ banku: [], kala: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card px-4 py-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <p className="text-[11px]">Grading last week's BANKu & KALA picks against real final scores…</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold">PICK WIN RATE — LAST 7 DAYS</p>
          <p className="text-[11px] text-muted-foreground">
            Settled against real final scores · honest counts, never guarantees · 18+
          </p>
        </div>
        <Link to="/sports" className="text-[10px] font-bold text-primary whitespace-nowrap hover:underline shrink-0">
          See the drops →
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {SLIPS.map(({ key, label, note }) => {
          const rows = data[key] || [];
          const decided = rows.filter((r) => r.status === "win" || r.status === "loss");
          const wins = decided.filter((r) => r.status === "win").length;
          const losses = decided.length - wins;
          const awaiting = rows.filter((r) => r.status === "open").length;
          const voids = rows.filter((r) => r.status === "void").length;
          const rate = decided.length ? Math.round((wins / decided.length) * 100) : null;

          // day-by-day hit rate for the last 7 days
          const today = new Date();
          const days = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
            const dayRows = rows.filter((r) => r.date_key === d);
            const dayDecided = dayRows.filter((r) => r.status === "win" || r.status === "loss");
            const dayWins = dayDecided.filter((r) => r.status === "win").length;
            days.push({
              d,
              hit: dayDecided.length ? Math.round((dayWins / dayDecided.length) * 100) : null,
              picks: dayRows.length,
            });
          }

          return (
            <div key={key} className="rounded-2xl bg-black/30 border border-border/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-extrabold">
                  {label} <span className="text-[10px] font-bold text-muted-foreground">· {note}</span>
                </p>
                <p className={`font-heading font-extrabold text-2xl tabular-nums ${rate == null ? "text-muted-foreground" : "text-primary"}`}>
                  {rate == null ? "—" : `${rate}%`}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {decided.length
                  ? `${wins}W · ${losses}L of ${decided.length} settled`
                  : "No games finished yet — drops settle as the games end"}
                {awaiting > 0 ? ` · ${awaiting} awaiting kickoff` : ""}
                {voids > 0 ? ` · ${voids} no-result (void)` : ""}
              </p>

              <div className="mt-3">
                <div className="flex items-end justify-between gap-1">
                  {days.map((d) => (
                    <div key={d.d} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full h-14 rounded-md bg-secondary/60 relative overflow-hidden">
                        {d.hit != null && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-primary/80 rounded-md"
                            style={{ height: `${Math.max(d.hit, 6)}%` }}
                          />
                        )}
                        {d.hit != null && (
                          <p className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums">
                            {d.hit}%
                          </p>
                        )}
                      </div>
                      <p className="text-[8px] text-muted-foreground truncate w-full text-center">{d.d.slice(5)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-muted-foreground/70 mt-3 flex items-center gap-1.5">
        <BarChart3 className="w-3 h-3 shrink-0" />
        Each bar is that day's settled hit rate (wins ÷ settled picks from the real final score). Awaiting and
        no-result legs are shown, never silently dropped. Percentages are history, never a promise — 18+, play responsibly.
      </p>
    </div>
  );
}