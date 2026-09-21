import React from "react";
import { Tv } from "lucide-react";

// Fixed TV-station-style logo bug — sits in the top-right corner of the
// streaming screen like a real broadcaster's watermark (e.g. CNN, BBC).
export default function TvStationBug({ label = "RIDE X TV", live = false }) {
  return (
    <div className="pointer-events-none absolute top-2.5 right-2.5 z-30 select-none">
      <div
        className="flex items-center gap-1.5 rounded-lg pl-2 pr-2.5 py-1 shadow-lg"
        style={{
          background: "linear-gradient(135deg, rgba(10,8,4,0.78), rgba(30,22,8,0.62))",
          border: "1px solid rgba(247,201,72,0.5)",
          backdropFilter: "blur(3px)",
        }}
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/20 border border-primary/40 shrink-0">
          <Tv className="w-3 h-3 text-primary" />
        </div>
        <div className="leading-none">
          <span
            className="block font-heading text-[11px] font-extrabold gold-text"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)", letterSpacing: "0.04em" }}
          >
            RIDE X
          </span>
          <span
            className="block text-[8px] font-bold text-primary/95 mt-0.5"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.95)", letterSpacing: "0.14em" }}
          >
            {label}
          </span>
        </div>
        {live && (
          <span className="flex items-center gap-1 ml-0.5 pl-1.5 border-l border-primary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[7px] font-bold text-red-400 tracking-widest">LIVE</span>
          </span>
        )}
      </div>
    </div>
  );
}