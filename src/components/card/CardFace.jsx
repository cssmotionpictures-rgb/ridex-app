import React from "react";

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Pure-CSS Ride X card face — embossed metallic finish with the holder's real
 * details engraved directly on the surface (no baked-in image artifacts).
 */
export default function CardFace({ card, side }) {
  const masked = card ? `5399 **** **** ${card.card_last4}` : "5399 **** **** ••••";
  const exp = card ? `${pad2(card.expiry_month)}/${String(card.expiry_year).slice(-2)}` : "08/29";
  const holder = card ? (card.cardholder_name || "").toUpperCase() : "CARDHOLDER";
  const cvv = card ? card.cvv : "•••";

  // Embossed metallic gold text — light highlight top, dark shadow bottom = raised effect
  const emboss = {
    background: "linear-gradient(180deg, #fff6d8 0%, #f7c948 38%, #caa233 62%, #8a6a1f 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    textShadow: "0 1px 0 rgba(255,255,255,0.35), 0 -1px 1px rgba(0,0,0,0.55), 0 2px 3px rgba(0,0,0,0.45)",
    WebkitTextFillColor: "transparent",
  };
  const embossSilver = {
    background: "linear-gradient(180deg, #ffffff 0%, #d8dbe0 42%, #9a9ea8 68%, #6b6f7a 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    textShadow: "0 1px 0 rgba(255,255,255,0.4), 0 -1px 1px rgba(0,0,0,0.5), 0 2px 3px rgba(0,0,0,0.4)",
    WebkitTextFillColor: "transparent",
  };

  const surface = {
    background:
      "radial-gradient(120% 90% at 85% 15%, rgba(247,201,72,0.18), transparent 55%)," +
      "radial-gradient(90% 70% at 10% 90%, rgba(20,30,55,0.6), transparent 60%)," +
      "linear-gradient(135deg, #0a0a12 0%, #12131e 45%, #06060c 100%)",
  };

  // Gold EMV chip — rounded rect with metallic gradient + inner contact lines
  const Chip = () => (
    <div style={{
      width: "15%", aspectRatio: "1.25 / 1", borderRadius: "0.3rem",
      background: "linear-gradient(135deg, #fff3c0 0%, #f7c948 30%, #b8862a 60%, #e8c66a 100%)",
      boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.4)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: "18% 14%", borderTop: "1px solid rgba(0,0,0,0.35)", borderBottom: "1px solid rgba(0,0,0,0.35)" }} />
      <div style={{ position: "absolute", left: "48%", top: "18%", bottom: "18%", borderLeft: "1px solid rgba(0,0,0,0.35)" }} />
    </div>
  );

  return (
    <div
      style={{
        position: "absolute", inset: 0, backfaceVisibility: "hidden",
        borderRadius: "1.5rem", overflow: "hidden",
        boxShadow: "0 20px 50px -12px rgba(247,201,72,0.25), inset 0 0 0 1px rgba(247,201,72,0.18)",
        ...surface,
      }}
    >
      {/* Subtle gold pinstripe texture */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.06,
        backgroundImage: "repeating-linear-gradient(115deg, transparent 0 18px, rgba(247,201,72,0.5) 18px 19px)" }} />
      {/* Top sheen */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.08), transparent)" }} />

      {side === "front" ? (
        <>
          {/* RIDE X CARD mark top-left */}
          <div style={{ position: "absolute", top: "9%", left: "6%", display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span className="font-heading" style={{ ...emboss, fontSize: "clamp(15px,5.5vw,22px)", fontWeight: 800, letterSpacing: "0.04em" }}>
              RIDE<span style={{ opacity: 0.85 }}>X</span>
            </span>
            <span className="font-heading" style={{ ...embossSilver, fontSize: "clamp(9px,3vw,12px)", fontWeight: 700, letterSpacing: "0.3em", opacity: 0.9 }}>
              CARD
            </span>
          </div>
          {/* Chip + contactless */}
          <div style={{ position: "absolute", top: "30%", left: "6%", display: "flex", alignItems: "center", gap: "6%" }}>
            <Chip />
            <div style={{ display: "flex", flexDirection: "column", gap: "3px", opacity: 0.7 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", border: "1.5px solid rgba(247,201,72,0.8)" }} />
              ))}
            </div>
          </div>
          {/* Engraved card number */}
          <p className="font-mono" style={{
            position: "absolute", left: "6%", right: "6%", top: "58%",
            ...embossSilver, fontSize: "clamp(14px,5vw,21px)", fontWeight: 700,
            letterSpacing: "0.12em", whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {masked}
          </p>
          {/* Valid thru + cardholder row */}
          <div style={{ position: "absolute", left: "6%", right: "6%", bottom: "8%", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ ...embossSilver, fontSize: "7px", letterSpacing: "0.18em", opacity: 0.7, marginBottom: "2px", fontWeight: 600 }}>VALID THRU · CARDHOLDER</p>
              <p className="font-heading" style={{
                ...embossSilver, fontSize: "clamp(10px,3.6vw,15px)", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {holder}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ ...embossSilver, fontSize: "7px", letterSpacing: "0.18em", opacity: 0.7, marginBottom: "2px", fontWeight: 600 }}>EXPIRES</p>
              <p className="font-mono" style={{ ...embossSilver, fontSize: "clamp(10px,3.6vw,15px)", fontWeight: 700, letterSpacing: "0.08em" }}>
                {exp}
              </p>
            </div>
          </div>
          {/* Mastercard-style mark bottom-right */}
          <div style={{ position: "absolute", bottom: "8%", right: "6%", display: "none" }}>
            <div style={{ position: "relative", width: "34px", height: "20px" }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: "20px", height: "20px", borderRadius: "50%", background: "#eb001b", opacity: 0.9 }} />
              <div style={{ position: "absolute", right: 0, top: 0, width: "20px", height: "20px", borderRadius: "50%", background: "#f79e1b", opacity: 0.9, mixBlendMode: "screen" }} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Magnetic stripe */}
          <div style={{ position: "absolute", top: "9%", left: 0, right: 0, height: "13%", background: "linear-gradient(180deg, #0a0a0a, #1a1a1f)" }} />
          {/* Signature panel + CVV */}
          <div style={{ position: "absolute", top: "30%", left: "6%", right: "6%", height: "11%", display: "flex", alignItems: "stretch" }}>
            <div style={{ flex: 1, background: "repeating-linear-gradient(45deg, #f4f0e6 0 8px, #e8e2d4 8px 16px)", borderRadius: "4px", display: "flex", alignItems: "center", paddingLeft: "10px" }}>
              <svg width="60%" height="60%" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ opacity: 0.5 }}>
                <path d="M5 30 Q40 5 80 28 T160 22 T195 28" stroke="#1a2a55" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ width: "18%", marginLeft: "2%", background: "#fff", borderRadius: "4px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "6px", color: "#666", letterSpacing: "0.1em", fontWeight: 600 }}>CVV</span>
              <span className="font-mono" style={{ fontSize: "clamp(11px,4vw,16px)", fontWeight: 800, color: "#111", letterSpacing: "0.1em" }}>{cvv}</span>
            </div>
          </div>
          {/* Footer text */}
          <div style={{ position: "absolute", bottom: "8%", left: "0", right: "0", textAlign: "center" }}>
            <span style={{ ...emboss, fontSize: "clamp(10px,3.4vw,13px)", fontWeight: 700, letterSpacing: "0.12em" }}>ridex.app</span>
          </div>
          <div style={{ position: "absolute", bottom: "15%", left: "6%", right: "6%", textAlign: "right" }}>
            <span style={{ color: "rgba(247,201,72,0.5)", fontSize: "7px", letterSpacing: "0.1em" }}>Customer care · support@ridex.app</span>
          </div>
        </>
      )}
    </div>
  );
}