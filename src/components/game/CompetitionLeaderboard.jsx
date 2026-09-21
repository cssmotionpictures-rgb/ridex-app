import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Trophy, Medal, Crown, Calendar } from "lucide-react";

// COMPETITION LEADERBOARD — shows active competitions + the top warriors by
// battles won, plus the leading competition entries. All client-side entity
// reads (no backend functions, no credits). Synced live from the database.

export default function CompetitionLeaderboard({ me }) {
  const [comps, setComps] = useState([]);
  const [entries, setEntries] = useState([]);
  const [warriors, setWarriors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [activeComps, topEntries, topProfiles] = await Promise.all([
          base44.entities.Competition.filter({ status: "active" }, "-start_date", 10).catch(() => []),
          base44.entities.CompetitionEntry.list("-score", 20).catch(() => []),
          base44.entities.GameProfile.list("-battles_won", 20).catch(() => []),
        ]);
        if (!alive) return;
        setComps(activeComps || []);
        setEntries(topEntries || []);
        setWarriors(topProfiles || []);
      } catch (e) {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5">
      {/* Active competitions */}
      <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-[#d97757]" />
          <h3 className="font-bold text-[#d1a985] tracking-wide">Active Competitions</h3>
        </div>
        {loading ? (
          <p className="text-xs text-[#8a6d3b] text-center py-4">Loading competitions…</p>
        ) : comps.length === 0 ? (
          <p className="text-xs text-[#8a6d3b] text-center py-4">No active competitions right now. Check back soon.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {comps.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#c5a059]/20 bg-[#0a0706]/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-foreground leading-tight">{c.title}</p>
                  <span className="text-[9px] uppercase tracking-wider text-[#d97757] font-bold shrink-0">{c.competition_type?.replace("_", " ")}</span>
                </div>
                {c.theme && <p className="text-[10px] text-[#8a6d3b] mt-0.5">{c.theme}</p>}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-[#d1a985]">
                  <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-[#f7c948]" /> {(c.prize_coins || 0).toLocaleString()} coins</span>
                  <span className="flex items-center gap-1"><Medal className="w-3 h-3" /> {c.entry_count || 0} entries</span>
                  {c.end_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(c.end_date).toLocaleDateString()}</span>}
                </div>
                {c.prize_description && <p className="text-[10px] text-[#f0d9a8] mt-1.5 italic">{c.prize_description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Competition entries leaderboard */}
      {entries.length > 0 && (
        <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Medal className="w-5 h-5 text-[#c5a059]" />
            <h3 className="font-bold text-[#d1a985] tracking-wide">Competition Leaders</h3>
          </div>
          <div className="space-y-1.5">
            {entries.slice(0, 15).map((e, i) => {
              const mine = me && e.user_id === me.id;
              return (
                <div key={e.id} className={`flex items-center gap-3 p-2 rounded-xl border ${mine ? "bg-[#2a1a0e]/60 border-[#d97757]/50" : "bg-[#0a0706]/60 border-[#c5a059]/12"}`}>
                  <span className={`w-7 text-center font-bold text-sm ${i < 3 ? "text-[#d1a985]" : "text-[#6a5a3b]"}`}>{i === 0 ? "★" : i < 3 ? ["◆", "◇"][i - 1] : i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-foreground">{e.user_name || "Anonymous"}{mine && " (you)"}</p>
                    <p className="text-[10px] text-[#8a6d3b] truncate">{e.competition_title || ""}</p>
                  </div>
                  <span className="text-xs font-bold text-[#d1a985]">{e.score || e.votes || 0} pts</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top warriors by battles won */}
      <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-[#f7c948]" />
          <h3 className="font-bold text-[#d1a985] tracking-wide">Top Warriors</h3>
        </div>
        {warriors.length === 0 ? (
          <p className="text-xs text-[#8a6d3b] text-center py-4">No warriors ranked yet.</p>
        ) : (
          <div className="space-y-1.5">
            {warriors.slice(0, 10).map((w, i) => {
              const mine = me && w.id === me.id;
              return (
                <div key={w.id} className={`flex items-center gap-3 p-2 rounded-xl border ${mine ? "bg-[#2a1a0e]/60 border-[#d97757]/50" : "bg-[#0a0706]/60 border-[#c5a059]/12"}`}>
                  <span className={`w-7 text-center font-bold text-sm ${i < 3 ? "text-[#d1a985]" : "text-[#6a5a3b]"}`}>{i === 0 ? "★" : i < 3 ? ["◆", "◇"][i - 1] : i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-foreground">{w.player_name || "Player"}{mine && " (you)"}</p>
                    <p className="text-[10px] text-[#8a6d3b]">Lv {w.level || 1}</p>
                  </div>
                  <span className="text-xs font-bold text-[#d1a985]">{w.battles_won || 0} wins</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}