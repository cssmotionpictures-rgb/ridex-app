import React from "react";
import { Button } from "@/components/ui/button";
import { Wine, ArrowRight } from "lucide-react";

// Real footage from the owner — the actual Vibe & Tap bar, lounge & crowd.
const WALL = [
  {
    url: "https://media.base44.com/videos/public/6a7364eea84550708f16a360/626241022_InShot_20260511_234020455.mp4",
    span: "col-span-2 row-span-2",
  },
  {
    url: "https://media.base44.com/videos/public/6a7364eea84550708f16a360/6109d4de4_VID-20260515-WA0131.mp4",
    span: "col-start-3 row-start-1",
  },
  {
    url: "https://media.base44.com/videos/public/6a7364eea84550708f16a360/e7d1232fc_VID-20260609-WA0003.mp4",
    span: "col-start-4 row-start-1",
  },
  {
    url: "https://media.base44.com/videos/public/6a7364eea84550708f16a360/0d5e376b3_VID-20260609-WA0003.mp4",
    span: "col-start-3 col-span-2 row-start-2",
  },
];

export default function VibeHero({ onExplore }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 mb-8">
      <div className="grid grid-cols-4 grid-rows-2 gap-1 h-60 sm:h-80">
        {WALL.map((v, i) => (
          <video
            key={i}
            src={v.url}
            className={`w-full h-full object-cover video-8k ${v.span}`}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2">A Ride X original</p>
        <h2 className="text-3xl sm:text-5xl font-extrabold max-w-xl leading-tight">
          Vibe &amp; Tap — <span className="gold-text">where Lagos comes alive</span>
        </h2>
        <p className="text-sm sm:text-base text-white/80 mt-3 max-w-lg">
          Cocktails, grill smoke and good people. Tap a spot below to reserve, or discover what's around you.
        </p>
        <div className="flex gap-3 mt-5">
          <Button className="rounded-full h-11 font-semibold" onClick={onExplore}>
            <Wine className="w-4 h-4 mr-2" /> Explore our spots
          </Button>
          <Button variant="outline" className="rounded-full h-11 bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => document.getElementById("nearby-places")?.scrollIntoView({ behavior: "smooth" })}>
            Find nearby <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}