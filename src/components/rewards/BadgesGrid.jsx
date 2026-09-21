import React from "react";
import { BADGES } from "@/lib/rewards";

export default function BadgesGrid({ profile }) {
  const earned = new Set(profile.badges || []);
  return (
    <div>
      <h3 className="font-semibold mb-3">Badges & achievements <span className="text-muted-foreground font-normal">({earned.size}/{BADGES.length} earned)</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {BADGES.map((b) => {
          const got = earned.has(b.key);
          return (
            <div
              key={b.key}
              className={`rounded-2xl border p-4 text-center transition ${
                got ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card opacity-50 grayscale"
              }`}
            >
              <div className="text-3xl">{b.emoji}</div>
              <p className="text-sm font-semibold mt-1">{b.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{b.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}