import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CONTACT, ADMOB } from "@/lib/catalog";
import { loadAdVideos } from "@/lib/adCreatives";
import { loadAdCreative, reportSponsorAdPlay } from "@/lib/sponsorAds";
import { Volume2, Loader2, X } from "lucide-react";

// Real video ad creative shown when a user clicks an ad. Prefers a paid
// sponsor ad (revenue tracked server-side); falls back to a platform trailer.
// The "continue" action releases only after the creative finishes.
export default function VideoAdModal({ open, onOpenChange, label = "Sponsored", onComplete }) {
  const [src, setSrc] = React.useState("");
  const [ended, setEnded] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [sponsorAd, setSponsorAd] = React.useState(null);
  const [sponsorName, setSponsorName] = React.useState("");
  const dur = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    setEnded(false);
    setReady(false);
    setElapsed(0);
    setSponsorAd(null);
    setSponsorName("");
    (async () => {
      const fallback = await loadAdVideos();
      const creative = await loadAdCreative("any", fallback);
      setSrc(creative.videoUrl);
      setSponsorAd(creative.sponsorAd);
      setSponsorName(creative.sponsorName);
    })();
    base44.entities.AdEvent
      .create({ ad_type: "interstitial", event: "click", revenue: 0.15, opay_account: CONTACT.opay })
      .catch(() => {});
  }, [open]);

  const finish = async () => {
    if (sponsorAd) reportSponsorAdPlay(sponsorAd);
    await base44.entities.AdEvent
      .create({ ad_type: "interstitial", event: "complete", revenue: 0.08, opay_account: CONTACT.opay })
      .catch(() => {});
    onOpenChange(false);
    await onComplete?.();
  };

  const canSkip = ended || elapsed >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video
            className="video-8k w-full h-full object-cover"
            src={src}
            autoPlay
            muted
            playsInline
            preload="auto"
            onCanPlay={(e) => { setReady(true); dur.current = e.target.duration || 0; }}
            onTimeUpdate={(e) => setElapsed(e.target.currentTime)}
            onEnded={() => setEnded(true)}
          />
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.3em] bg-black/70 px-2 py-1 rounded-full flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> {sponsorName ? `Sponsored by ${sponsorName}` : label}
          </span>
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          {canSkip && (
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-3 right-3 size-8 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all" style={{ width: `${dur.current ? Math.min(100, (elapsed / dur.current) * 100) : 0}%` }} />
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {canSkip ? "Ad finished — thanks for watching" : `Ad playing · ${Math.max(0, Math.ceil(5 - elapsed))}s`}
          </p>
          <Button className="rounded-full" disabled={!canSkip} onClick={finish}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ADMOB };