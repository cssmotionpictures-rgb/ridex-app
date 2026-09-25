import React from "react";
import { invokeCrixFunction } from "@/lib/crix";
import { Loader2, Wallet2, TrendingDown } from "lucide-react";

const usd = (v) => "$" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

// DOLLAR CARD DASHBOARD — one clean view of the customer's card money:
// total balance across their live cards, recent spending, and card status.
// Everything is read live from the card network through the secured server
// function; the screen stores and trusts nothing.
export default function CrixDollarCardSummary({ cards }) {
  const [data, setData] = React.useState(null);

  const cardKey = React.useMemo(
    () => (cards || []).map((c) => c.card_key + ":" + c.status).join(","),
    [cards]
  );

  React.useEffect(() => {
    let alive = true;
    const actionable = (cards || []).filter((c) => c.provider_card_id && ["issued", "active", "frozen"].includes(c.status));
    if (!actionable.length) {
      setData({ total_usd: null, recent: [], cards: [] });
      return;
    }
    setData(null);
    (async () => {
      let total = 0;
      const recent = [];
      const statuses = [];
      await Promise.all(
        actionable.map(async (c) => {
          try {
            const d = await invokeCrixFunction("crix-dollar-card", { action: "details", card_key: c.card_key });
            const bal = Number(d && d.card && d.card.balance) || 0;
            total += bal;
            statuses.push({ masked: c.masked_pan || c.card_key, status: (d && d.card && d.card.card_status) || c.status, balance: bal });
          } catch {
            statuses.push({ masked: c.masked_pan || c.card_key, status: c.status, balance: null });
          }
          try {
            const h = await invokeCrixFunction("crix-dollar-card", { action: "history", card_key: c.card_key });
            for (const t of (h && h.transactions) || []) recent.push({ ...t, card: c.masked_pan || "" });
          } catch { /* best-effort feed */ }
        })
      );
      recent.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      if (alive) setData({ total_usd: total, recent: recent.slice(0, 5), cards: statuses });
    })();
    return () => { alive = false; };
  }, [cardKey]);

  if (data && !(data.cards || []).length) return null;

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      {data === null ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:border-r md:border-border md:pr-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5"><Wallet2 className="w-3.5 h-3.5" /> Total card balance</p>
            <p className="text-3xl font-extrabold gold-text mt-1">{usd(data.total_usd)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{(data.cards || []).length} live card{(data.cards || []).length > 1 ? "s" : ""}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(data.cards || []).map((c, i) => (
                <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-full bg-secondary border border-border">
                  {c.masked} · {c.status === "active" ? "Active" : c.status === "frozen" ? "Frozen" : c.status}
                </span>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" /> Recent spending</p>
            {!data.recent.length ? (
              <p className="text-sm text-muted-foreground mt-2">No card spending yet — purchases on your dollar card will appear here.</p>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {data.recent.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.narrative || t.type || "Card purchase"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.created_at ? new Date(String(t.created_at).replace(" ", "T")).toLocaleDateString("en-NG", { dateStyle: "medium" }) : ""}
                        {t.card ? " · " + t.card : ""}
                      </p>
                    </div>
                    <p className="text-sm font-bold shrink-0">{usd(t.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}