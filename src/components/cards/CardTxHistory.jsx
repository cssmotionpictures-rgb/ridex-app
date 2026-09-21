import React from "react";
import { Button } from "@/components/ui/button";
import { getVirtualCardHistory } from "@/lib/virtualCards";
import { money } from "@/lib/pricing";
import { ArrowDownLeft, ArrowUpRight, ArrowDownUp, Loader2, RefreshCw, Receipt } from "lucide-react";

const merchant = (t) =>
  t.merchant ||
  t.merchant_name ||
  t.narration ||
  t.description ||
  (String(t.type || "").toLowerCase() === "credit" ? "Card top-up" : "Card payment");

const when = (t) => {
  const raw = t.created_at || t.created || t.date_created || t.transaction_date || t.date;
  const d = raw ? new Date(raw) : null;
  if (!d || isNaN(d.getTime())) return { day: "", time: "" };
  return {
    day: d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
};

const tsOf = (t) => {
  const raw = t.created_at || t.created || t.date_created || t.transaction_date || t.date;
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d.getTime()) ? d.getTime() : 0;
};

const isCredit = (t) => {
  const type = String(t.type || "").toLowerCase();
  return type ? type === "credit" || type === "refund" : Number(t.amount || 0) >= 0;
};

// Simple keyword grouping so users can scan their spending by category.
const CATEGORIES = [
  { label: "Food & drinks", words: ["food", "restaurant", "kfc", "mcdonald", "chicken", "chowdeck", "cafe", "coffee", "starbucks", "eat", "uber eats", "jumia food"] },
  { label: "Transport", words: ["uber", "bolt", "taxi", "transport", "fuel", "petrol", "nnpc", "oando", "gas station"] },
  { label: "Shopping", words: ["amazon", "aliexpress", "jumia", "konga", "shein", "temu", "ebay", "store", "shop"] },
  { label: "Entertainment", words: ["tiktok", "netflix", "youtube", "spotify", "audiomack", "boomplay", "apple", "game", "steam", "playstation", "xbox", "cinema", "showmax", "dstv"] },
  { label: "Bills & airtime", words: ["airtime", "mtn", "glo", "airtel", "9mobile", "bill", "electricity", "ikedc", "ekedc", "data"] },
];

const categoryOf = (t, credit) => {
  if (credit) return "Top-ups";
  const name = String(merchant(t)).toLowerCase();
  for (const c of CATEGORIES) if (c.words.some((w) => name.includes(w))) return c.label;
  return "Other";
};

/**
 * Detailed spend list for one virtual card — filterable by category, sortable
 * by date, money-in / money-out direction, straight from the live card provider.
 */
export default function CardTxHistory({ cardId }) {
  const [txs, setTxs] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [oldestFirst, setOldestFirst] = React.useState(false);

  const load = React.useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setTxs(await getVirtualCardHistory(cardId));
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }, [cardId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const withCat = (txs || []).map((t) => {
    const credit = isCredit(t);
    return { t, credit, cat: categoryOf(t, credit) };
  });
  const categories = ["Top-ups", ...CATEGORIES.map((c) => c.label), "Other"].filter((c) =>
    withCat.some((x) => x.cat === c)
  );
  const filtered = withCat
    .filter((x) => filter === "all" || x.cat === filter)
    .sort((a, b) => (oldestFirst ? tsOf(a.t) - tsOf(b.t) : tsOf(b.t) - tsOf(a.t)));

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading font-bold text-lg">Card activity</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setOldestFirst((o) => !o)}>
            <ArrowDownUp className="w-4 h-4" />
            {oldestFirst ? "Oldest first" : "Newest first"}
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={load} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Every top-up, spend and refund on your Ride X Card — filter by category to see where your money goes.
      </p>

      {txs && txs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {["all", ...categories].map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filter === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "all" ? "All" : key}
            </button>
          ))}
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}

      {busy && !txs && (
        <div className="glass rounded-3xl border border-border/60 divide-y divide-border/60">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-1/4 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!err && txs && txs.length === 0 && (
        <div className="glass rounded-3xl border border-border/60 p-8 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Transfers from your wallet and card spends will appear here.
          </p>
        </div>
      )}

      {txs && txs.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground">No transactions in this category yet.</p>
      )}

      {filtered.length > 0 && (
        <div className="glass rounded-3xl border border-border/60 divide-y divide-border/60">
          {filtered.map(({ t, credit, cat }, i) => {
            const amt = Number(t.amount || 0);
            const { day, time } = when(t);
            return (
              <div key={t.id || i} className="flex items-center gap-4 px-5 py-4">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    credit ? "bg-emerald-400/10 text-emerald-300" : "bg-primary/10 text-primary"
                  }`}
                >
                  {credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{merchant(t)}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] whitespace-nowrap">{cat}</span>
                    <span className="truncate">
                      {day && time ? `${day} · ${time}` : day || "—"}
                      {t.status ? ` · ${t.status}` : ""}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold ${credit ? "text-emerald-300" : "text-foreground"}`}>
                    {credit ? "+" : "−"}
                    {money(Math.abs(amt), t.currency || "NGN")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {credit ? "Money in" : "Money out"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}