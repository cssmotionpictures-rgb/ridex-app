import React from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Users, Car, Wallet, Crown, Check, X, Loader2, Settings } from "lucide-react";

const money = (n) => `₦${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminReferrals() {
  const [referrers, setReferrers] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [drivers, setDrivers] = React.useState([]);
  const [commissions, setCommissions] = React.useState([]);
  const [payouts, setPayouts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editRates, setEditRates] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [payoutRef, setPayoutRef] = React.useState(null);
  const [payoutForm, setPayoutForm] = React.useState({ payment_method: "bank", reference_number: "" });

  const load = React.useCallback(async () => {
    const [r, c, d, com, p] = await Promise.all([
      base44.entities.Referrer.list("-created_date", 200),
      base44.entities.ReferralCustomer.list("-created_date", 200),
      base44.entities.ReferralDriver.list("-created_date", 200),
      base44.entities.ReferralCommission.list("-created_date", 200),
      base44.entities.ReferralPayout.list("-created_date", 200),
    ]);
    setReferrers(r); setCustomers(c); setDrivers(d); setCommissions(com); setPayouts(p);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const upd = async (id, data) => { await base44.entities.Referrer.update(id, data); load(); };

  const setStatus = async (r, status) => { await base44.entities.Referrer.update(r.id, { status }); toast({ title: `Referrer ${status}` }); load(); };

  const saveRates = async () => {
    setBusy(true);
    try {
      await base44.entities.Referrer.update(editRates.id, {
        custom_rates: true,
        commission_customer: Number(editRates.commission_customer) || 0.10,
        commission_driver: Number(editRates.commission_driver) || 0.15,
        commission_subscription: Number(editRates.commission_subscription) || 0.05,
      });
      setEditRates(null);
      load();
    } finally { setBusy(false); }
  };

  const processPayout = async () => {
    if (!payoutRef) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("process-referral-payout", {
        referrer_id: payoutRef.id,
        payment_method: payoutForm.payment_method,
        reference_number: payoutForm.reference_number,
      });
      toast({ title: "Payout processed", description: `Paid ${money(res?.data?.total || 0)}` });
      setPayoutRef(null);
      setPayoutForm({ payment_method: "bank", reference_number: "" });
      load();
    } catch (e) {
      toast({ title: "Payout failed", description: e?.message });
    } finally { setBusy(false); }
  };

  if (loading) return <p className="text-muted-foreground">Loading referrals…</p>;

  const totalCommissions = referrers.reduce((s, r) => s + (r.total_earnings || 0), 0);
  const pendingPayouts = referrers.filter((r) => (r.pending_payout || 0) > 0);

  const Stat = ({ icon: Icon, label, value }) => (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <Icon className="w-5 h-5 text-primary mb-2" />
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-6">
        {["overview", "referrers", "payouts", "settings"].map((t) => (
          <TabsTrigger key={t} value={t} className="rounded-full px-4 py-1.5 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t}</TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview" className="space-y-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Users} label="Total referrers" value={referrers.length} />
          <Stat icon={Car} label="Customers referred" value={customers.length} />
          <Stat icon={Users} label="Drivers referred" value={drivers.length} />
          <Stat icon={Wallet} label="Total commissions" value={money(totalCommissions)} />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="font-semibold mb-2">Recent activity</h3>
          {commissions.slice(0, 10).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/40 text-sm">
              <span>{c.description || c.type}</span>
              <span className="text-primary font-medium">{money(c.amount)}</span>
            </div>
          ))}
          {commissions.length === 0 && <p className="text-sm text-muted-foreground py-4">No commissions recorded yet.</p>}
        </div>
      </TabsContent>

      <TabsContent value="referrers" className="space-y-4">
        {referrers.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="font-semibold">{r.full_name} {r.bonus_tier && r.bonus_tier !== "none" && <Crown className="w-3.5 h-3.5 inline text-primary ml-1" />}</p>
              <p className="text-xs text-muted-foreground">{r.email} · Code: <span className="font-mono">{r.referral_code}</span></p>
              <p className="text-xs text-muted-foreground">Customers: {r.total_customers} · Drivers: {r.total_drivers} · Earned: {money(r.total_earnings)} · Pending: {money(r.pending_payout)}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : r.status === "pending" ? "bg-amber-500/15 text-amber-300" : "bg-destructive/15 text-destructive"}`}>{r.status}</span>
            {r.status === "pending" && <Button size="sm" className="rounded-full" onClick={() => setStatus(r, "approved")}><Check className="w-4 h-4 mr-1" /> Approve</Button>}
            {r.status === "approved" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(r, "suspended")}>Suspend</Button>}
            {r.status === "suspended" && <Button size="sm" className="rounded-full" onClick={() => setStatus(r, "approved")}>Activate</Button>}
            {r.status === "rejected" && <Button size="sm" className="rounded-full" onClick={() => setStatus(r, "approved")}>Approve</Button>}
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditRates(r)}>Set rates</Button>
            {r.status === "pending" && <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => setStatus(r, "rejected")}><X className="w-4 h-4 mr-1" /> Reject</Button>}
          </div>
        ))}
        {referrers.length === 0 && <p className="text-sm text-muted-foreground">No referrers yet.</p>}
      </TabsContent>

      <TabsContent value="payouts" className="space-y-5">
        <div>
          <h3 className="font-semibold mb-2">Pending payouts ({pendingPayouts.length})</h3>
          {pendingPayouts.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3 mb-2">
              <div className="flex-1 min-w-[160px]">
                <p className="font-semibold">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">{r.email} · {money(r.pending_payout)} pending</p>
              </div>
              <Button size="sm" className="rounded-full" onClick={() => { setPayoutRef(r); setPayoutForm({ payment_method: r.payment_method || "bank", reference_number: "" }); }}>Process payout</Button>
            </div>
          ))}
          {pendingPayouts.length === 0 && <p className="text-sm text-muted-foreground">No pending payouts.</p>}
        </div>
        <div>
          <h3 className="font-semibold mb-2">Payout history</h3>
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/40 text-sm">
                <span>{new Date(p.period_start).toLocaleDateString()} – {new Date(p.period_end).toLocaleDateString()}</span>
                <span>{p.referrer_name}</span>
                <span className="text-primary font-medium">{money(p.amount)}</span>
                <span className="text-xs">{p.status} · {p.payment_method}</span>
                <span className="text-xs text-muted-foreground">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—"}</span>
              </div>
            ))}
            {payouts.length === 0 && <p className="text-sm text-muted-foreground py-4">No payouts processed yet.</p>}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="settings" className="space-y-4 max-w-xl">
        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-2 text-sm">
          <h3 className="font-semibold text-base flex items-center gap-2"><Settings className="w-4 h-4" /> Program configuration</h3>
          <p><span className="text-muted-foreground">Customer commission:</span> 10% of Ride X's 10% platform commission (= 1% of fare) — first 5 rides, 60-day window</p>
          <p><span className="text-muted-foreground">Driver commission:</span> 15% of Ride X's 10% platform commission (= 1.5% of fare) — driver's first month</p>
          <p><span className="text-muted-foreground">Subscription commission:</span> 5% of Ride X's 10% platform commission (= 0.5% of subscription) — recurring</p>
          <p><span className="text-muted-foreground">Payout cycle:</span> every 2 months · minimum ₦20,000</p>
          <p><span className="text-muted-foreground">Bonus tiers:</span> Bronze ₦10,000 · Silver ₦40,000 · Gold ₦100,000 · Platinum ₦250,000</p>
          <p className="text-xs text-muted-foreground pt-2">Override rates per referrer from the “Referrers” tab → Set rates.</p>
        </div>
      </TabsContent>

      {/* Rate edit dialog */}
      {editRates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 space-y-4">
            <h3 className="font-semibold">Set custom rates — {editRates.full_name}</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Customer %</Label><Input className="rounded-xl mt-1" type="number" step="0.01" defaultValue={editRates.commission_customer ?? 0.10} onChange={(e) => setEditRates({ ...editRates, commission_customer: e.target.value })} /></div>
              <div><Label className="text-xs">Driver %</Label><Input className="rounded-xl mt-1" type="number" step="0.01" defaultValue={editRates.commission_driver ?? 0.15} onChange={(e) => setEditRates({ ...editRates, commission_driver: e.target.value })} /></div>
              <div><Label className="text-xs">Subscription %</Label><Input className="rounded-xl mt-1" type="number" step="0.01" defaultValue={editRates.commission_subscription ?? 0.05} onChange={(e) => setEditRates({ ...editRates, commission_subscription: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={() => setEditRates(null)}>Cancel</Button>
              <Button className="rounded-full flex-1" disabled={busy} onClick={saveRates}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save rates"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Payout confirm dialog */}
      {payoutRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 space-y-4">
            <h3 className="font-semibold">Process payout — {payoutRef.full_name}</h3>
            <p className="text-sm text-muted-foreground">You are about to pay <span className="text-primary font-bold">{money(payoutRef.pending_payout)}</span> and clear the pending balance.</p>
            <div>
              <Label className="text-xs">Payment method</Label>
              <Select value={payoutForm.payment_method} onValueChange={(v) => setPayoutForm({ ...payoutForm, payment_method: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="opay">OPay</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference number</Label>
              <Input className="rounded-xl mt-1" value={payoutForm.reference_number} onChange={(e) => setPayoutForm({ ...payoutForm, reference_number: e.target.value })} placeholder="txn ref…" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={() => setPayoutRef(null)}>Cancel</Button>
              <Button className="rounded-full flex-1" disabled={busy} onClick={processPayout}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirm payout</Button>
            </div>
          </div>
        </div>
      )}
    </Tabs>
  );
}