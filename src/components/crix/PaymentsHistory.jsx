import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

const ngn = (v) => "₦" + Number(v || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

const CATS = [
  { id: "ALL", label: "All" },
  { id: "AIRTIME", label: "Airtime" },
  { id: "MOBILEDATA", label: "Data" },
  { id: "CABLEBILLS", label: "TV" },
  { id: "UTILITYBILLS", label: "Electricity" },
  { id: "EDUCATION", label: "Exams" },
  { id: "BETTING", label: "Betting" },
];

const STATUS = {
  paid: { label: "Paid", cls: "bg-emerald-500/15 text-emerald-400" },
  created: { label: "Processing", cls: "bg-amber-500/15 text-amber-400" },
  unknown: { label: "Confirming", cls: "bg-amber-500/15 text-amber-400" },
  refunded: { label: "Refunded", cls: "bg-sky-500/15 text-sky-400" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
};

// Full payment history — utility, data, TV, airtime, exam and betting payments,
// filterable by service provider and category.
export default function PaymentsHistory({ user }) {
  const [bills, setBills] = React.useState(null);
  const [cat, setCat] = React.useState("ALL");
  const [provider, setProvider] = React.useState("ALL");

  React.useEffect(() => {
    if (!user?.id) return;
    const load = () => base44.entities.CrixBillPayment.filter({ user_id: user.id }, "-created_date", 200)
      .then(setBills)
      .catch(() => setBills([]));
    load();
    const unsub = base44.entities.CrixBillPayment.subscribe(load);
    return unsub;
  }, [user?.id]);

  const providers = React.useMemo(() => {
    const map = new Map();
    for (const b of bills || []) map.set(b.biller_code, b.biller_name || b.biller_code);
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [bills]);

  const filtered = React.useMemo(() => {
    let rows = bills || [];
    if (cat !== "ALL") rows = rows.filter((b) => b.category === cat);
    if (provider !== "ALL") rows = rows.filter((b) => b.biller_code === provider);
    return rows;
  }, [bills, cat, provider]);

  React.useEffect(() => { setProvider("ALL"); }, [cat]);

  if (bills === null) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (!bills.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">No payments yet — your utility, data and betting payments will appear here.</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={"shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold min-h-[32px] " + (cat === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
          >
            {c.label}
          </button>
        ))}
      </div>

      {providers.length > 1 ? (
        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1.5 block">Service provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full h-11 rounded-xl bg-secondary text-foreground px-3 text-sm border border-border">
            <option value="ALL">All providers</option>
            {providers.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
      ) : null}

      {!filtered.length ? (
        <p className="text-sm text-muted-foreground text-center py-4">No payments match this filter yet.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => {
            const st = STATUS[b.status] || { label: b.status, cls: STATUS.unknown.cls };
            return (
              <div key={b.id} className="rounded-2xl bg-secondary/50 border border-border px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{b.biller_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {b.customer_reference ? b.customer_reference + " · " : ""}{new Date(b.created_date).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{ngn(b.amount_ngn)}</p>
                    {Number(b.fee_total) > 0 ? <p className="text-[11px] text-muted-foreground">fee {ngn(b.fee_total)}</p> : null}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + st.cls}>{st.label}</span>
                  {Number(b.total_debit) > 0 ? <span className="text-[11px] text-muted-foreground">from wallet {ngn(b.total_debit)}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}