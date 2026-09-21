import React from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import StatusBadge from "@/components/shared/StatusBadge";
import MarketChat from "@/components/market/MarketChat";
import { money } from "@/lib/pricing";
import { MessageCircle, Truck, CheckCircle2, Ban, Star, ShieldCheck, AlertTriangle } from "lucide-react";

export default function OrderPanel({ me, mode }) {
  const nav = useNavigate();
  const [orders, setOrders] = React.useState([]);
  const [reviews, setReviews] = React.useState([]);
  const [chat, setChat] = React.useState(null);
  const [review, setReview] = React.useState(null);
  const [dispute, setDispute] = React.useState(null);
  const [rv, setRv] = React.useState({ rating: "5", text: "" });
  const [disputeNote, setDisputeNote] = React.useState("");

  const load = async () => {
    if (!me?.id) return;
    const field = mode === "orders" ? "buyer_id" : "seller_id";
    const list = await base44.entities.MarketOrder.filter({ [field]: me.id }, "-created_date", 100).catch(() => []);
    setOrders(list);
    const revs = list.length
      ? await base44.entities.MarketplaceReview.filter({ order_id: { $in: list.map((o) => o.id) } }, "-created_date", 200).catch(() => [])
      : [];
    setReviews(revs);
  };

  React.useEffect(() => { load(); }, [me?.id, mode]);

  React.useEffect(() => {
    const u = base44.entities.MarketOrder.subscribe((ev) => {
      if (!me) return;
      const o = ev.data;
      const mine = mode === "orders" ? o.buyer_id === me.id : o.seller_id === me.id;
      if (!mine) return;
      setOrders((prev) => {
        const ex = prev.find((x) => x.id === o.id);
        return ex ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev];
      });
    });
    return () => u && u();
  }, [me?.id, mode]);

  const set = (o) => setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
  const reviewed = (o) => reviews.some((r) => r.order_id === o.id && r.reviewer_id === me.id);

  const ship = async (o) => set(await base44.entities.MarketOrder.update(o.id, { status: "in_transit" }));
  const confirm = async (o) => {
    const u = await base44.entities.MarketOrder.update(o.id, { status: "completed", payment_status: "released" });
    set(u);
    await base44.entities.MarketplaceListing.update(o.listing_id, { status: "sold" }).catch(() => {});
    if (o.transaction_id) await base44.entities.Transaction.update(o.transaction_id, { status: "paid" }).catch(() => {});
  };
  const refund = async (o, reason) => {
    const u = await base44.entities.MarketOrder.update(o.id, { status: "refunded", payment_status: "refunded", refund_reason: reason });
    set(u);
    await base44.entities.MarketplaceListing.update(o.listing_id, { status: "active" }).catch(() => {});
    if (o.transaction_id) await base44.entities.Transaction.update(o.transaction_id, { status: "refunded" }).catch(() => {});
  };
  const openDispute = async () => {
    const o = dispute;
    if (!o || !disputeNote.trim()) return;
    const u = await base44.entities.MarketOrder.update(o.id, { status: "disputed", dispute_reason: disputeNote.trim() });
    set(u);
    await base44.entities.SupportTicket.create({ subject: `Market dispute: ${o.listing_title}`, message: `Order ${o.id} — ${disputeNote.trim()}`, service: "marketplace" }).catch(() => {});
    setDispute(null); setDisputeNote("");
  };
  const submitReview = async () => {
    const o = review;
    if (!o) return;
    await base44.entities.MarketplaceReview.create({
      order_id: o.id,
      listing_id: o.listing_id,
      reviewer_id: me.id,
      reviewer_name: me.full_name || "User",
      reviewee_id: mode === "orders" ? o.seller_id : o.buyer_id,
      reviewee_role: mode === "orders" ? "seller" : "buyer",
      rating: Number(rv.rating) || 5,
      review: rv.text,
    });
    setReview(null); setRv({ rating: "5", text: "" });
    load();
  };

  const isBuyer = mode === "orders";
  if (!me) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      {orders.length === 0 && <p className="text-sm text-muted-foreground">{isBuyer ? "No purchases yet." : "No sales yet."}</p>}
      {orders.map((o) => {
        const payout = +(Math.max(0, o.amount - (o.commission || 0))).toFixed(2);
        const counterparty = isBuyer ? o.seller_name : o.buyer_name;
        return (
          <div key={o.id} className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{o.listing_title}</p>
                <p className="text-xs text-muted-foreground">{isBuyer ? "Seller" : "Buyer"}: {counterparty || "—"} · {new Date(o.created_date).toLocaleDateString()}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Item</p><p className="font-medium">{money(o.amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">Commission (10%)</p><p className="font-medium">{money(o.commission)}</p></div>
              <div><p className="text-xs text-muted-foreground">Delivery</p><p className="font-medium">{o.use_logistics ? money(o.delivery_fee) : "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">{isBuyer ? "You paid" : "Your payout"}</p><p className="font-bold text-primary">{money(isBuyer ? o.amount + (o.delivery_fee || 0) : payout)}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setChat(o)}><MessageCircle className="w-4 h-4 mr-1" /> Chat</Button>
              {o.use_logistics && o.logistics_id && <Button size="sm" variant="outline" className="rounded-full" onClick={() => nav("/delivery-tracking")}><Truck className="w-4 h-4 mr-1" /> Track delivery</Button>}
              {isBuyer && ["escrow", "in_transit"].includes(o.status) && <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => confirm(o)}><CheckCircle2 className="w-4 h-4 mr-1" /> Confirm received</Button>}
              {isBuyer && ["escrow", "in_transit"].includes(o.status) && <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => setDispute(o)}><AlertTriangle className="w-4 h-4 mr-1" /> Open dispute</Button>}
              {!isBuyer && o.status === "escrow" && <Button size="sm" className="rounded-full" onClick={() => ship(o)}><Truck className="w-4 h-4 mr-1" /> Mark shipped</Button>}
              {!isBuyer && ["escrow", "in_transit", "disputed"].includes(o.status) && <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => refund(o, "Seller issued refund")}><Ban className="w-4 h-4 mr-1" /> Refund</Button>}
              {o.status === "completed" && !reviewed(o) && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReview(o)}><Star className="w-4 h-4 mr-1" /> Leave review</Button>}
            </div>
            {o.status === "disputed" && <p className="text-xs text-amber-400">Dispute open — our team will review and resolve it.</p>}
            {o.status === "refunded" && <p className="text-xs text-muted-foreground">Refunded{o.refund_reason ? ` · ${o.refund_reason}` : ""}.</p>}
            {reviewed(o) && <p className="text-xs text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> You've reviewed this transaction.</p>}
          </div>
        );
      })}

      <Dialog open={!!chat} onOpenChange={(o) => !o && setChat(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Chat — {chat?.listing_title}</DialogTitle></DialogHeader>
          {chat && <MarketChat order={chat} me={me} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Rate {isBuyer ? "the seller" : "the buyer"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Rating</Label>
              <select value={rv.rating} onChange={(e) => setRv((s) => ({ ...s, rating: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n} className="bg-card">{n} ★</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Review</Label>
              <Textarea className="rounded-xl mt-1" rows={3} value={rv.text} onChange={(e) => setRv((s) => ({ ...s, text: e.target.value }))} placeholder="Share your experience…" />
            </div>
            <Button className="rounded-full w-full" onClick={submitReview}>Submit review</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dispute} onOpenChange={(o) => !o && setDispute(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Open a dispute</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Tell us what went wrong. We'll hold the funds and review the case.</p>
            <Textarea className="rounded-xl" rows={4} value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} placeholder="Describe the issue…" />
            <div className="flex gap-2">
              <DialogClose asChild><Button variant="outline" className="rounded-full flex-1">Cancel</Button></DialogClose>
              <Button variant="destructive" className="rounded-full flex-1" onClick={openDispute} disabled={!disputeNote.trim()}>Submit dispute</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}