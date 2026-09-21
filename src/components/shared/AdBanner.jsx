import React from "react";
import { base44 } from "@/api/base44Client";
import { CONTACT } from "@/lib/catalog";
import { Megaphone } from "lucide-react";
import VideoAdModal from "@/components/shared/VideoAdModal";

// Clicking the banner plays a real video ad (native AdMob rewarded unit on the
// published mobile build; video creative in the web app).
export default function AdBanner({ label = "Boost your brand across RIDE X", type = "banner" }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    base44.entities.AdEvent.create({ ad_type: type, event: "impression", revenue: 0.01, opay_account: CONTACT.opay }).catch(() => {});
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-primary/25 bg-primary/5 px-5 py-3 flex items-center gap-3 text-left hover:bg-primary/10 transition-colors"
      >
        <Megaphone className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm flex-1">{label}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tap to watch</span>
      </button>
      <VideoAdModal open={open} onOpenChange={setOpen} />
    </>
  );
}