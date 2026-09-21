import React from "react";
import { Repeat } from "lucide-react";

const fmtPan = (pan) =>
  String(pan || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();

// The CRIXCOIN virtual card — designed as a real CRIXCOIN card.
//   FRONT:  CRIXCOIN brand, chip, the user's card number, expiry, cardholder
//   BACK:   magnetic stripe + the CVV
// Tap (or press the flip button) to flip between the two faces.
export default function CrixCoinCardVisual({ pan = "", expiry = "", cvv = "", cardholder = "" }) {
  const [flipped, setFlipped] = React.useState(false);
  const face = "absolute inset-0 rounded-2xl [backface-visibility:hidden] p-4";

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="[perspective:1200px] select-none cursor-pointer" onClick={() => setFlipped((f) => !f)}>
        <div
          className="relative w-full h-52 [transform-style:preserve-3d] transition-transform duration-700"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          {/* FRONT */}
          <div
            className={face + " flex flex-col justify-between"}
            style={{
              background: "linear-gradient(135deg, #171208 0%, #3a2c12 45%, #0f0c06 100%)",
              border: "1px solid rgba(197,160,89,0.5)",
              boxShadow: "0 18px 40px -18px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,233,168,0.15)",
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-cinzel font-bold text-sm tracking-[0.22em] gold-text">CRIXCOIN</p>
                <p className="text-[8px] tracking-[0.3em] text-amber-200/50 mt-0.5">VIRTUAL DOLLAR CARD</p>
              </div>
              <div
                className="w-10 h-7 rounded-md"
                style={{ background: "linear-gradient(135deg, #f7c948, #c5a059 55%, #8a6d3b)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}
              />
            </div>

            <p className="font-mono text-[15px] sm:text-base tracking-[0.18em] text-amber-50" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}>
              {fmtPan(pan) || "•••• •••• •••• ••••"}
            </p>

            <div className="flex justify-between items-end">
              <div className="min-w-0">
                <p className="text-[8px] tracking-[0.25em] text-amber-200/50">CARD HOLDER</p>
                <p className="text-xs font-semibold uppercase truncate max-w-[130px]">{cardholder || "RIDE X CUSTOMER"}</p>
              </div>
              <div>
                <p className="text-[8px] tracking-[0.25em] text-amber-200/50">VALID THRU</p>
                <p className="text-xs font-mono">{expiry || "••/••"}</p>
              </div>
              <p className="font-cinzel text-[10px] tracking-[0.18em] gold-text">RIDE X</p>
            </div>
          </div>

          {/* BACK */}
          <div
            className={face + " [transform:rotateY(180deg)] overflow-hidden"}
            style={{
              background: "linear-gradient(135deg, #0f0c06 0%, #2b2110 55%, #0f0c06 100%)",
              border: "1px solid rgba(197,160,89,0.5)",
            }}
          >
            <div className="h-9 bg-black mt-4 -mx-4" />
            <div className="px-4 mt-4">
              <p className="text-[8px] tracking-[0.25em] text-amber-200/50 mb-1">CVV</p>
              <div className="bg-amber-50 text-black font-mono px-3 py-1.5 rounded text-sm text-center tracking-[0.3em]">
                {cvv || "•••"}
              </div>
            </div>
            <p className="absolute bottom-2.5 left-4 right-4 flex justify-between text-[8px] tracking-[0.2em] text-amber-200/40">
              <span>24/7 PROTECTED BY CRIX</span>
              <span>CRIXCOIN · CSS ENTERTAINMENT</span>
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setFlipped((f) => !f)}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary border border-border px-3 py-2.5 text-xs font-semibold min-h-[36px]"
      >
        <Repeat className="w-3.5 h-3.5" />
        {flipped ? "Show card front" : "Flip for CVV"}
      </button>
    </div>
  );
}