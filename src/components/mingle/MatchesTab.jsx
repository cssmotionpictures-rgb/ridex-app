import React from "react";
import { MessageCircle, Heart } from "lucide-react";
import { onlineStatusOf } from "@/lib/mingle/core";

const DOT = { ONLINE: "bg-green-500", RECENTLY_ACTIVE: "bg-purple-400", OFFLINE: "bg-slate-400" };

export default function MatchesTab({ matches, profilesById, presenceByUser, user, onOpen }) {
  if (!matches?.length) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
        <div className="text-3xl">💜</div>
        <p className="font-semibold">No matches yet</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          When someone you liked likes you back, the match — and the private chat, voice and video — opens here.
        </p>
      </div>
    );
  }
  const sorted = [...matches].sort((a, b) => (a.status === "ACTIVE" ? -1 : 0) - (b.status === "ACTIVE" ? -1 : 0));
  return (
    <div className="space-y-3">
      {sorted.map((m) => {
        const partnerId = (m.members || []).find((x) => x !== user.id);
        const partner = profilesById[partnerId] || null;
        const st = partner ? onlineStatusOf(partner, presenceByUser[partnerId]) : null;
        const inactive = m.status !== "ACTIVE";
        return (
          <button
            key={m.id}
            onClick={() => onOpen(m)}
            className={`w-full flex items-center gap-3 rounded-3xl border p-4 text-left card-lift ${inactive ? "border-border bg-card opacity-60" : "border-primary/25 bg-card"}`}
          >
            <div className="w-12 h-12 rounded-2xl bg-secondary overflow-hidden border border-border shrink-0 flex items-center justify-center">
              {partner?.photo_url
                ? <img src={partner.photo_url} alt="" className="w-full h-full object-cover" />
                : "💜"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {partner?.display_name || "Mingle member"}
                {partner?.age ? `, ${partner.age}` : ""}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {inactive
                  ? m.status === "BLOCKED" ? "Conversation blocked" : "Unmatched — chat closed"
                  : st
                    ? st === "ONLINE" ? "🟢 Online" : st === "RECENTLY_ACTIVE" ? "🟣 Recently active" : "⚪ Offline"
                    : "⚪ Status hidden"}
              </p>
            </div>
            {inactive ? <Heart className="w-4 h-4 text-muted-foreground" /> : <MessageCircle className="w-5 h-5 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}