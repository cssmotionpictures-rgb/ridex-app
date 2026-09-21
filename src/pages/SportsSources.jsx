import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import LiveFootballEmbeds from "@/components/sports/LiveFootballEmbeds";
import StreamMatchGrid from "@/components/sports/StreamMatchGrid";
import AutoTuneDialog from "@/components/sports/AutoTuneDialog";
import { Tv } from "lucide-react";

export default function SportsSources() {
  const [watchQuery, setWatchQuery] = React.useState("");
  const [autoTune, setAutoTune] = React.useState(null);

  // Watch Live → auto-tune engine detects a working station for this match
  const handleWatch = (e) => setAutoTune(e);

  return (
    <div>
      <PageHeader
        eyebrow="📺 Where to Watch"
        title="Watch Football In-App"
        subtitle="Everything plays right here in the Ride X in-app player. Pick a match or channel below and press play — no redirects, no external sites."
      />

      <LiveFootballEmbeds watchQuery={watchQuery} />

      <h2 className="text-lg font-bold mt-6 mb-3">Choose a match to watch</h2>
      <StreamMatchGrid onWatch={handleWatch} />

      <AutoTuneDialog
        match={autoTune}
        onClose={() => setAutoTune(null)}
        onBrowse={(m) => {
          setWatchQuery(m?.league || m?.strLeague || m?.strEvent || "");
          setAutoTune(null);
        }}
      />

      <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
        <Tv className="w-3.5 h-3.5 inline mr-1" />
        All viewing happens inside the Ride X in-app player — pick a match and press play. No external redirects.
      </p>
    </div>
  );
}