import React from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export default function MarketChat({ order, me }) {
  const [msgs, setMsgs] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const role = order.buyer_id === me.id ? "buyer" : "seller";

  React.useEffect(() => {
    if (!order) return;
    let mounted = true;
    base44.entities.MarketChatMessage.filter({ order_id: order.id }, "created_date", 200)
      .then((m) => mounted && setMsgs(m))
      .catch(() => {});
    const u = base44.entities.MarketChatMessage.subscribe((ev) => {
      if (ev.data?.order_id === order.id) setMsgs((p) => [...p, ev.data]);
    });
    return () => { mounted = false; u && u(); };
  }, [order?.id]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const m = await base44.entities.MarketChatMessage.create({
      order_id: order.id,
      listing_id: order.listing_id,
      sender_id: me.id,
      sender_role: role,
      text: draft.trim(),
    });
    setMsgs((p) => [...p, m]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {msgs.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${m.sender_id === me.id ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.text}</div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={send}>
        <Input className="rounded-xl" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message…" />
        <Button type="submit" size="icon" className="rounded-xl"><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
}