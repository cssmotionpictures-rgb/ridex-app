import React, { useState } from "react";
import { ShoppingBag, CheckCircle2 } from "lucide-react";
import { SHOP_ITEMS } from "@/lib/forgottenOnesData";

export default function GameShop({ profile, onBuy }) {
  const [busy, setBusy] = useState(null);
  const isPremium = profile?.premium;

  const buy = (item) => {
    if (busy) return;
    setBusy(item.id);
    onBuy(item).finally(() => setBusy(null));
  };

  return (
    <div className="noir-panel rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag className="w-5 h-5 text-[#d97757]" />
        <h3 className="font-bold text-[#d1a985] tracking-wide">Spirit Store</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SHOP_ITEMS.map((item) => {
          const owned = item.premium && isPremium;
          return (
            <button
              key={item.id}
              onClick={() => buy(item)}
              disabled={busy !== null || owned}
              className={`text-left p-3 rounded-xl border transition-all ${
                owned
                  ? "border-[#d97757]/45 bg-[#2a1a0e]/40"
                  : "border-[#c5a059]/18 bg-[#0a0706]/60 card-lift hover:border-[#d97757]/45"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-xs text-[#8a6d3b] mt-0.5">
                {owned ? "Active" : `₦${item.price.toLocaleString()}`}
              </p>
              {owned && <CheckCircle2 className="w-4 h-4 text-[#d97757] mt-1" />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[#6a5a3b] mt-3 text-center italic">Purchases grant items instantly in this demo build.</p>
    </div>
  );
}