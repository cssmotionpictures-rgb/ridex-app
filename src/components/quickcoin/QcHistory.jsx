import React from "react";
import { base44 } from "@/api/base44Client";
import { formatCrxs } from "@/lib/quickcoin";
import { Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const STATUS_STYLE = {
  COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  FAILED: "bg-red-500/10 text-red-400 border-red-500/30",
  REQUESTED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

// HISTORY — Quick Coin internal transfers are ledger transfers: they carry the
// Crix reference, honestly labelled "internal", with no fabricated blockchain hash.
export default function QcHistory({ user }) {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const sent = await base44.entities.CrixTransaction.filter({ sender_id: user.id, currency: "CRXS" }, "-created_date", 20).catch(() => []);
      const got = await base44.entities.CrixTransaction.filter({ recipient_id: user.id, currency: "CRXS" }, "-created_date", 20).catch(() => []);
      // A self-transfer appears in both queries — dedupe by id so every row renders once
      const seen = new Set();
      const merged = [...(sent || []), ...(got || [])].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
      setRows(merged.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))));
    })();
  }, [user.id]);

  if (!rows) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading history…</p>;
  if (!rows.length) return (
    <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
      No CRIXCOIN transfers yet — your sends and receives appear here.
    </div>
  );

  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const sent = t.sender_id === user.id;
        const style = STATUS_STYLE[t.status] || STATUS_STYLE.REQUESTED;
        return (
          <div key={t.id} className="rounded-xl border border-border/50 bg-card px-3 py-2.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${sent ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {sent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{sent ? "To " + (t.recipient_email || "recipient") : "From " + (t.sender_email || "sender")}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {new Date(t.created_date).toLocaleString("en-NG")} · fee {formatCrxs(t.fee_total)} · {t.crix_id}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-bold ${sent ? "text-red-400" : "text-emerald-400"}`}>{sent ? "−" : "+"}{formatCrxs(t.amount)}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${style}`}>{t.status}</span>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground px-1">
        Transfers between CRIXCOIN users are instant. Transfers to external wallets appear here once that feature is available.
      </p>
    </div>
  );
}