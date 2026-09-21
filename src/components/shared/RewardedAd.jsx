import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/lib/catalog";
import { loadAdVideos } from "@/lib/adCreatives";
import { loadAdCreative, reportSponsorAdPlay } from "@/lib/sponsorAds";
import { Volume2, Loader2, Gift } from "lucide-react";
import { showAdMobRewarded, isNativeAdMobAvailable } from "@/lib/admob";

// Real rewarded ad. On the native iOS/Android build a real AdMob rewarded ad is
// shown first (your ADMOB_APP_ID + ADMOB_REWARDED_AD_UNIT_ID secrets are already
// configured). On the web app / preview AdMob has no SDK, so it falls back to a
// real video creative (sponsor ad or Ride X trailer) — no credits needed.
const MIN_WATCH = 8;

export default function RewardedAd({ open, onOpenChange, movieTitle, onReward }) {
  const [src, setSrc] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);
  const [ended, setEnded] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [sponsorAd, setSponsorAd] = React.useState(null);
  const [sponsorName, setSponsorName] = React.useState("");
  const videoRef = React.useRef(null);
  // One-grant lock — duplicate SDK callbacks, double-taps or re-fires can
  // NEVER grant the reward twice for the same ad view.
  const claimedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    claimedRef.current = false;
    setElapsed(0);
    setEnded(false);
    setReady(false);
    setSponsorAd(null);
    setSponsorName("");
    (async () => {
      // Native build: show a real AdMob rewarded ad first. If it rewards, grant
      // the reward and skip the web video creative.
      if (isNativeAdMobAvailable()) {
        const earned = await showAdMobRewarded();
        if (earned && !claimedRef.current) {
          claimedRef.current = true; // SDK confirmed the reward — grant exactly once
          await base44.entities.AdEvent.create({ ad_type: "rewarded", event: "complete", movie_title: movieTitle, revenue: 0.08, opay_account: CONTACT.opay }).catch(() => {});
          onOpenChange(false);
          await onReward?.();
          return;
        }
      }
      const fallback = await loadAdVideos();
      const creative = await loadAdCreative("movies", fallback);
      setSrc(creative.videoUrl);
      setSponsorAd(creative.sponsorAd);
      setSponsorName(creative.sponsorName);
    })();
    base44.entities.AdEvent.create({ ad_type: "rewarded", event: "impression", movie_title: movieTitle, revenue: 0.02, opay_account: CONTACT.opay }).catch(() => {});
  }, [open, movieTitle]);

  const canClaim = ended || elapsed >= MIN_WATCH;

  const claim = async () => {
    if (!canClaim || claimedRef.current) return; // double-tap can never double-grant
    claimedRef.current = true;
    if (sponsorAd) reportSponsorAdPlay(sponsorAd);
    await base44.entities.AdEvent.create({ ad_type: "rewarded", event: "complete", movie_title: movieTitle, revenue: 0.08, opay_account: CONTACT.opay }).catch(() => {});
    onOpenChange(false);
    await onReward?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            src={src}
            className="video-8k w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            preload="auto"
            onTimeUpdate={(e) => setElapsed(e.target.currentTime)}
            onEnded={() => setEnded(true)}
            onCanPlay={() => setReady(true)}
          />
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.3em] bg-black/70 px-2 py-1 rounded-full flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> {sponsorName ? `Sponsored by ${sponsorName}` : "Sponsored"}
          </span>
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all" style={{ width: `${Math.min(100, (elapsed / MIN_WATCH) * 100)}%` }} />
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {canClaim ? "Ad complete — claim your reward" : `Watch the ad to unlock · ${Math.max(0, Math.ceil(MIN_WATCH - elapsed))}s`}
          </p>
          <Button className="rounded-full" disabled={!canClaim} onClick={claim}>
            <Gift className="w-4 h-4 mr-1" /> {canClaim ? "Claim reward" : `${Math.max(0, Math.ceil(MIN_WATCH - elapsed))}s`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}