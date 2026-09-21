import React from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { subscribeLivePing } from "@/lib/livePingScanner";

// GLOBAL LIVE PING — mounted once in the app shell so the live-game scanner
// runs on EVERY page, not just the sports page. The moment a new match goes
// in play anywhere in the world, an in-app toast pops immediately (the
// sports page already shows its own scanner banner, so the toast is skipped
// there). Sound, voice call and system notification are fired by the
// scanner itself — exactly once per kickoff.
export default function GlobalLivePing() {
  const { toast } = useToast();
  const { pathname } = useLocation();

  React.useEffect(() => {
    return subscribeLivePing((state, newOnes) => {
      if (!newOnes || !newOnes.length || pathname === "/sports") return;
      const first = newOnes[0];
      toast({
        title:
          newOnes.length === 1
            ? `LIVE NOW: ${first.home} vs ${first.away}`
            : `${newOnes.length} new live matches`,
        description:
          newOnes.length === 1
            ? `${first.league || "Live now"} — kickoff detected on the worldwide scanner.`
            : `${first.home} vs ${first.away} and more just kicked off — open Live Scores.`,
      });
    });
  }, [toast, pathname]);

  return null;
}