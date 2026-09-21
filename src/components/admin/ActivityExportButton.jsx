import React from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ADMIN ACTIVITY EXPORT — one CSV with the daily logistics + payment activity
// rollup for the last 30 days, so records stay accurate and portable.

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const round2 = (v) => Math.round((v || 0) * 100) / 100;

export default function ActivityExportButton() {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const exportCsv = async () => {
    setBusy(true);
    setErr("");
    try {
      const [logi, txs] = await Promise.all([
        base44.entities.LogisticsRequest.list("-created_date", 500),
        base44.entities.Transaction.list("-created_date", 500),
      ]);
      // Daily rollup, oldest → newest, last 30 days.
      const now = new Date();
      const days = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(dayKey(d));
      }
      const byDay = new Map(days.map((k) => [k, {
        date: k, requests: 0, delivered: 0, cancelled: 0, pending: 0, logisticsNgn: 0,
        txTotal: 0, txPaid: 0, paidNgn: 0, paidUsd: 0, commissionNgn: 0, refunded: 0,
      }]));
      for (const r of logi || []) {
        const e = byDay.get(dayKey(r.created_date));
        if (!e) continue;
        e.requests++;
        if (r.status === "delivered") e.delivered++;
        else if (r.status === "cancelled") e.cancelled++;
        else if (r.status === "pending") e.pending++;
        e.logisticsNgn += r.amount || 0;
      }
      for (const t of txs || []) {
        const e = byDay.get(dayKey(t.created_date));
        if (!e) continue;
        e.txTotal++;
        if (t.status === "refunded") { e.refunded++; continue; }
        if (t.status === "paid") {
          e.txPaid++;
          if (t.currency === "USD") e.paidUsd += t.amount || 0;
          else e.paidNgn += t.amount || 0;
          if (t.currency !== "USD") e.commissionNgn += t.commission || 0;
        }
      }
      const lines = [
        ["Date", "Logistics requests", "Delivered", "Cancelled", "Pending", "Logistics value (NGN)",
          "Transactions", "Paid tx", "Paid volume (NGN)", "Paid volume (USD)", "Commission (NGN)", "Refunded"].join(","),
      ];
      for (const e of byDay.values()) {
        lines.push([e.date, e.requests, e.delivered, e.cancelled, e.pending, round2(e.logisticsNgn),
          e.txTotal, e.txPaid, round2(e.paidNgn), round2(e.paidUsd), round2(e.commissionNgn), e.refunded].join(","));
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `ridex-daily-activity-${dayKey(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setErr("Couldn't build the export — try again.");
    }
    setBusy(false);
  };

  return (
    <div className="text-right">
      <Button variant="outline" onClick={exportCsv} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
        Export activity CSV (30 days)
      </Button>
      {err && <p className="text-xs text-destructive mt-1">{err}</p>}
    </div>
  );
}