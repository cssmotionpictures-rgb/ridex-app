import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Live spectator commentary overlay — shows comments from other players on the
// host's battle screen in real time. Comments are scoped by room ("live:<id>")
// so only viewers of THIS live battle appear. Zero-credit (entities + realtime).
export default function LiveCommentary({ room }) {
  const [comments, setComments] = useState([]);

  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const recent = await base44.entities.GameChat.list("-created_date", 40);
        setComments(recent.filter((m) => m.room === room).slice(-8));
        unsub = base44.entities.GameChat.subscribe((ev) => {
          if (ev.type === "create" && ev.data?.room === room) {
            setComments((c) => [...c, ev.data].slice(-8));
          }
        });
      } catch { /* ignore */ }
    })();
    return () => { if (unsub) unsub(); };
  }, [room]);

  if (!room) return null;
  return (
    <div className="absolute left-3 top-28 z-25 w-[58%] max-w-[260px] space-y-1.5 pointer-events-none">
      <p className="text-[9px] uppercase tracking-[0.25em] text-[#e07466] flex items-center gap-1 font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-[#e07466] animate-pulse" /> LIVE · {comments.length} watching
      </p>
      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto noir-scrollbar">
        {comments.map((c) => (
          <div key={c.id} className="noir-panel rounded-xl px-2.5 py-1.5 animate-fade-in">
            <p className="text-[9px] text-[#d97757] font-semibold truncate">{c.user_name}{c.character_name ? ` · ${c.character_name}` : ""}</p>
            <p className="text-[11px] text-[#d1a985] leading-snug">{c.message}</p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-[10px] text-[#8a6d3b] italic">You're live! Spectators can cheer you on from the Online → Live tab.</p>
        )}
      </div>
    </div>
  );
}