import React from "react";
import { Image } from "@/components/ui/image";

export function isVideo(url) {
  return typeof url === "string" && /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
}

export default function VenueMedia({ src, alt, className }) {
  if (isVideo(src)) {
    return (
      <video
        src={src}
        className={`${className || ""} video-8k`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }
  return src ? <Image src={src} alt={alt} className={className} /> : null;
}