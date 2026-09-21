import React from "react";
import { Ticket, Crown, Bird, Users, MonitorPlay, Loader2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pricing";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import QrTicket from "./QrTicket";

const TYPES = [
  { key: "regular", label: "Regular", icon: Ticket, desc: "Standard access · QR entry" },
  { key: "vip", label: "VIP", icon: Crown, desc: "Priority · Meet & greet · Reserved seat · Merch" },
  { key: "early_bird", label: "Early Bird", icon: Bird, desc: "Limited quantity · Discounted" },
  { key: "group", label: "Group (4+)", icon: Users, desc: "Discounted per person · Group entry" },
  { key: "streaming", label: "Streaming", icon: MonitorPlay, desc: "Virtual · Live stream · 24h replay" },
];

function priceFor(type, ev) {
  return ({
    regular: ev.ticket_regular_price,
    vip: ev.ticket_vip_price,
    early_bird: ev.ticket_early_bird_price,
    group: ev.ticket_group_price,
    streaming: ev.ticket_streaming_price,
  })[type] || 0;
}

function genCode(eventId) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RDX-EVT-${(eventId || "XXXX").slice(-5).toUpperCase()}-${rand}`;
}

export default function TicketPurchase({ event, user, onPurchased }) {
  const [type, setType] = React.useState("regular");
  const [qty, setQty] = React.useState(1);
  const [checkout, setCheckout] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [lastTicket, setLastTicket] = React.useState(null);
  const [emailState, setEmailState] = React.useState("idle"); // idle | sending | sent | failed

  const unit = priceFor(type, event);
  const total = unit * (type === "group" ? 1 : qty);
  const groupPeople = type === "group" ? Math.max(4, qty) : qty;
  const earlyBirdLeft = (event.early_bird_limit || 0) - (event.early_bird_sold || 0);

  const buy = () => setCheckout(true);

  const onPaid = async (tx) => {
    setBusy(true);
    try {
      const code = genCode(event.id);
      const ticket = await base44.entities.EventTicket.create({
        event_id: event.id,
        event_title: event.title,
        user_id: user.id,
        user_name: user.full_name || user.email,
        user_email: user.email,
        ticket_type: type,
        price: total,
        quantity: type === "group" ? groupPeople : qty,
        qr_code: code,
        payment_reference: tx?.reference_id || tx?.id || "",
        status: "paid",
      });
      // increment event counters
      await base44.entities.LiveEvent.update(event.id, {
        tickets_sold: (event.tickets_sold || 0) + (type === "group" ? groupPeople : qty),
        early_bird_sold: type === "early_bird" ? (event.early_bird_sold || 0) + qty : event.early_bird_sold || 0,
      });
      setLastTicket(ticket);
      setEmailState("sending");
      onPurchased?.(ticket);
      // Auto-deliver the ticket straight to the buyer's inbox (QR + details)
      base44.functions
        .invoke("send-ticket-email", { ticket_id: ticket.id })
        .then((res) => setEmailState((res?.data || res)?.ok ? "sent" : "failed"))
        .catch(() => setEmailState("failed"));
    } catch (e) {
      console.error("ticket create failed", e);
    }
    setBusy(false);
  };

  if (lastTicket) {
    return (
      <div className="rounded-3xl bg-card border border-border p-6 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
        <div>
          <h3 className="font-bold text-lg">Ticket Confirmed!</h3>
          <p className="text-sm text-muted-foreground">Your {lastTicket.ticket_type} ticket for {event.title}</p>
        </div>
        <div className="rounded-2xl bg-secondary p-4 flex flex-col items-center gap-3">
          <QrTicket code={lastTicket.qr_code} />
          <div className="text-xs text-muted-foreground">
            Show this at entry · {lastTicket.quantity} {lastTicket.quantity > 1 ? "admissions" : "admission"}
          </div>
          {emailState !== "idle" && (
            <div className={`text-xs ${emailState === "failed" ? "text-amber-400" : "text-emerald-400"}`}>
              {emailState === "sending" && "Emailing your ticket…"}
              {emailState === "sent" && `✓ Ticket emailed to ${lastTicket.user_email || user.email}`}
              {emailState === "failed" && "Ticket email couldn't be delivered — your QR above still works for entry."}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          className="rounded-full w-full"
          onClick={() => {
            setLastTicket(null);
            setEmailState("idle");
          }}
        >
          Buy another ticket
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-card border border-border p-5 space-y-4">
      <h3 className="font-bold flex items-center gap-2"><Ticket className="w-5 h-5 text-primary" /> Get tickets</h3>
      <div className="grid gap-2">
        {TYPES.map((t) => {
          const price = priceFor(t.key, event);
          if (!price && price !== 0) return null;
          const active = type === t.key;
          const soldOut = t.key === "early_bird" && earlyBirdLeft <= 0;
          return (
            <button
              key={t.key}
              disabled={soldOut}
              onClick={() => setType(t.key)}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${
                active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
              } ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                <t.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{t.label}</span>
                  <span className="font-extrabold">{price > 0 ? money(price) : "Free"}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {soldOut ? "Sold out" : t.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {type !== "streaming" && type !== "group" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Quantity</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full bg-secondary border border-border">-</button>
            <span className="font-bold w-6 text-center">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(10, q + 1))} className="w-8 h-8 rounded-full bg-secondary border border-border">+</button>
          </div>
        </div>
      )}
      {type === "group" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">People (min 4)</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty((q) => Math.max(4, q - 1))} className="w-8 h-8 rounded-full bg-secondary border border-border">-</button>
            <span className="font-bold w-6 text-center">{groupPeople}</span>
            <button onClick={() => setQty((q) => Math.min(20, q + 1))} className="w-8 h-8 rounded-full bg-secondary border border-border">+</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-2xl font-extrabold text-primary">{money(total)}</span>
      </div>

      <Button className="w-full rounded-full h-11 font-semibold" disabled={busy || event.status === "completed" || event.status === "cancelled"} onClick={buy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Buy ${type === "group" ? "group" : "tickets"}`}
      </Button>

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={total}
        service="subscription"
        description={`${type} ticket · ${event.title}`}
        referenceId={event.id}
        commission={Math.round(total * 0.5)}
        onPaid={onPaid}
        allowCash={false}
      />
    </div>
  );
}