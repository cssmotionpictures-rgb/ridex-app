import React from "react";
import { Image } from "@/components/ui/image";

// The official CRIXCOIN coin logo (uploaded by the builder) — the single
// source of truth for the coin mark across the app, and the exact image URL
// submitted to token-info services (DEX Screener, GeckoTerminal, etc.).
export const CRXS_LOGO_URL =
  "https://media.base44.com/images/public/6a7364eea84550708f16a360/41bc3b827_file_000000005a1481f48673c6f4bb7fa088.png";

export default function CrxsLogo({ size = 40, className }) {
  const s = Number(size) || 40;
  return (
    <div className={"shrink-0 " + (className || "")} style={{ width: s, height: s }}>
      <Image
        src={CRXS_LOGO_URL}
        alt="CRIXCOIN"
        fittingType="fit"
        className="block w-full h-full"
      />
    </div>
  );
}