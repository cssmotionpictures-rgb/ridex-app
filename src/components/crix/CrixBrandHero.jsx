import React from "react";
import { Image } from "@/components/ui/image";

// The official CRIXCOIN coin logo (uploaded by the builder) — single source
// of truth for the coin identity across the Crix section.
export const CRIX_BRAND_IMAGE =
  "https://media.base44.com/images/public/6a7364eea84550708f16a360/41bc3b827_file_000000005a1481f48673c6f4bb7fa088.png";

export default function CrixBrandHero() {
  return (
    <div className="relative rounded-3xl overflow-hidden border border-primary/30 mb-6 bg-[#0A0A0A] shadow-[0_0_44px_-14px_rgba(212,175,55,0.4)]">
      {/* soft golden aura behind the coins */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 50% 30%, rgba(212,175,55,0.16), transparent 65%)",
        }}
      />
      <Image
        src={CRIX_BRAND_IMAGE}
        alt="CrixCoin — one coin, a global future"
        fittingType="fit"
        aspectRatio="1 / 1"
        className="block w-full"
      />
      <div className="h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <p className="text-center text-[10px] tracking-[0.3em] text-muted-foreground py-2.5 font-heading">
        CRIXCOIN<span className="text-primary align-super text-[8px]">™</span> · MORE THAN A TOKEN · IT&apos;S A MOVEMENT
      </p>
    </div>
  );
}