import React from "react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { money } from "@/lib/pricing";
import { BadgeCheck, Star, Flag, Tag, Lock, TrendingUp } from "lucide-react";

export default function ListingCard({ l, me, onBuy, onBoost, onReport }) {
  const boosted = l.featured && (!l.boost_until || new Date(l.boost_until).getTime() > Date.now());
  const own = l.seller_id && me?.id && l.seller_id === me.id;
  const isVideo = l.video_url && /\.(mp4|webm|mov|m4v)$/i.test(l.video_url);
  return (
    <div className={`rounded-2xl border bg-card overflow-hidden card-lift ${boosted ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"}`}>
      <div className="aspect-square bg-secondary relative">
        {l.photo_url ? (
          <Image src={l.photo_url} fittingType="fill" className="size-full" />
        ) : isVideo ? (
          <video src={l.video_url} className="video-8k size-full object-cover" muted loop autoPlay playsInline />
        ) : (
          <div className="size-full flex items-center justify-center"><Tag className="w-8 h-8 text-muted-foreground" /></div>
        )}
        {boosted && <span className="absolute top-2 left-2 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-1 rounded-full flex items-center gap-1"><Star className="w-3 h-3 fill-current" /> BOOSTED</span>}
        {l.verified ? (
          <span className="absolute top-2 right-2 text-[10px] font-bold bg-accent text-accent-foreground px-2 py-1 rounded-full flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> VERIFIED</span>
        ) : (
          <span className="absolute top-2 right-2 text-[10px] uppercase px-2 py-1 rounded-full bg-black/60">{l.condition}</span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-sm truncate">{l.title}</p>
        <p className="text-xs text-muted-foreground truncate">{l.subcategory ? `${l.subcategory} · ` : ""}{l.location || l.category}</p>
        <p className="font-bold mt-1">{money(l.price, l.currency)}</p>
        <p className="text-[10px] text-muted-foreground">Escrow protected · 10% commission on sale</p>
        <div className="flex gap-1 mt-2">
          <Button size="sm" className="rounded-full flex-1" disabled={own || l.status !== "active"} onClick={() => onBuy(l)}>
            <Lock className="w-3 h-3 mr-1" /> {own ? "Yours" : "Buy"}
          </Button>
          <Button size="sm" variant="outline" className="rounded-full px-2" onClick={() => onBoost(l)} title="Boost to top"><TrendingUp className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="rounded-full px-2" onClick={() => onReport(l)} title="Report"><Flag className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}