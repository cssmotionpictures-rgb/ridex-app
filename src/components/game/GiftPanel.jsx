import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { useToast } from "@/components/ui/use-toast";
import { money } from "@/lib/pricing";
import { Gift, X } from "lucide-react";

// Tiered gifts spectators/friends can buy for a player. Ride X keeps a 20%
// agency commission on every gift. Payment runs through the existing zero-credit
// Paystack checkout; the gift + commission are logged to the GameGift entity.
export const GIFT_TIERS = [
  { key: "bronze", label: "Bronze", emoji: "🥉", amount: 500, color: "#c08a4a" },
  { key: "silver", label: "Silver", emoji: "🥈", amount: 2000, color: "#b8b8c8" },
  { key: "gold", label: "Gold", emoji: "🥇", amount: 5000, color: "#f7c948" },
  { key: "diamond", label: "Diamond", emoji: "💎", amount: 15000, color: "#5ec8f8" },
  { key: "legendary", label: "Legendary", emoji: "👑", amount: 50000, color: "#b06bd9" },
];
const COMMISSION_RATE = 0.2;

export default function GiftPanel({ recipient, onClose }) {
  const [tier, setTier] = useState(GIFT_TIERS[2]);
  const [checkout, setCheckout] = useState(false);
  const [sender, setSender] = useState(null);
  const { toast } = useToast();

  useEffect(() => { base44.auth.me().then(setSender).catch(() => {}); }, []);

  const send = async () => {
    if (!sender || !recipient?.user_id) return;
    const commission = Math.round(tier.amount * COMMISSION_RATE);
    try {
      await base44.entities.GameGift.create({
        sender_id: sender.id,
        sender_name: sender.full_name || sender.email || "Seeker",
        recipient_id: recipient.user_id,
        recipient_name: recipient.user_name,
        tier: tier.key,
        amount: tier.amount,
        commission,
        message: `A ${tier.label} gift from the arena`,
        status: "delivered",
      });
      toast({ title: `${tier.label} gift sent to ${recipient.user_name}!`, className: "border-[#d97757]" });
    } catch (e) {
      toast({ title: "Could not send gift", variant: "destructive" });
    }
    setCheckout(true);
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-[#040303]/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="noir-panel rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#d1a985] flex items-center gap-2"><Gift className="w-5 h-5 text-[#d97757]" /> Send a Gift</h3>
          <button onClick={onClose} className="text-[#8a6d3b] hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#8a6d3b] mb-3">
          To <span className="text-[#d1a985] font-semibold">{recipient?.user_name}</span> · Ride X keeps a 20% agency commission.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {GIFT_TIERS.map((g) => (
            <button
              key={g.key}
              onClick={() => setTier(g)}
              className={`rounded-xl p-3 text-left border transition-all ${tier.key === g.key ? "noir-frame bg-[#2a1a0e]/40" : "border-[#c5a059]/15 bg-[#0a0706]"}`}
            >
              <p className="text-lg leading-none">{g.emoji}</p>
              <p className="text-xs font-bold text-foreground mt-1">{g.label}</p>
              <p className="text-[11px] font-semibold" style={{ color: g.color }}>{money(g.amount)}</p>
            </button>
          ))}
        </div>
        <button onClick={send} className="w-full py-2.5 rounded-xl btn-noir-primary font-semibold text-sm flex items-center justify-center gap-1.5">
          <Gift className="w-4 h-4" /> Send {tier.label} · {money(tier.amount)}
        </button>
        <p className="text-[10px] text-center text-[#8a6d3b] mt-2">Commission {money(Math.round(tier.amount * COMMISSION_RATE))} captured by Ride X</p>
      </div>
      <CheckoutDialog
        open={checkout}
        onOpenChange={(v) => { if (!v) { setCheckout(false); onClose(); } }}
        amount={tier.amount}
        service="marketplace"
        description={`${tier.label} gift to ${recipient?.user_name}`}
        commission={Math.round(tier.amount * COMMISSION_RATE)}
        onPaid={() => {}}
      />
    </div>
  );
}