import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Users, Car, Crown, Copy, Check, Share2, Download, Loader2, TrendingUp } from "lucide-react";

const money = (n) => `₦${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReferralPortal() {
  const nav = useNavigate();
  const [me, setMe] = React.useState(null);
  const [ref, setRef] = React.useState(null);
  const [customers, setCustomers] = React.useState([]);
  const [drivers, setDrivers] = React.useState([]);
  const [commissions, setCommissions] = React.useState([]);
  const [payouts, setPayouts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState("dashboard");
  const [search, setSearch] = React.useState("");
  const [editForm, setEditForm] = React.useState({});

  const load = React.useCallback(async () => {
    const u = await base44.auth.me().catch(() => null);
    setMe(u);
    if (!u) { setLoading(false); return; }
    const list = await base44.entities.Referrer.list("-created_date", 10).catch(() => []);
    const myRef = list.find((r) => r.created_by_id === u.id) || list[0];
    setRef(myRef);
    setEditForm({
      payment_method: myRef?.payment_method || "bank",
      bank_name: myRef?.bank_name || "", bank_account_name: myRef?.bank_account_name || "", bank_account_number: myRef?.bank_account_number || "",
      opay_number: myRef?.opay_number || "", phone: myRef?.phone || "", social_handles: myRef?.social_handles || "",
      notify_email: myRef?.notify_email ?? true,
    });
    if (myRef) {
      const [c, d, com, p] = await Promise.all([
        base44.entities.ReferralCustomer.filter({ referrer_id: myRef.id }, "-created_date", 200).catch(() => []),
        base44.entities.ReferralDriver.filter({ referrer_id: myRef.id }, "-created_date", 200).catch(() => []),
        base44.entities.ReferralCommission.filter({ referrer_id: myRef.id }, "-created_date", 200).catch(() => []),
        base44.entities.ReferralPayout.filter({ referrer_id: myRef.id }, "-created_date", 50).catch(() => []),
      ]);
      setCustomers(c); setDrivers(d); setCommissions(com); setPayouts(p);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (!loading && (!me || !ref || ref.status !== "approved")) { nav("/referral"); }
  }, [loading, me, ref, nav]);

  if (loading) return <p className="text-muted-foreground">Loading your referral dashboard…</p>;
  if (!ref || ref.status !== "approved") return null;

  const link = `${window.location.origin}/register?ref=${ref.referral_code}`;
  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const share = (platform) => {
    const text = `Join Ride X with my code ${ref.referral_code} and get moving! ${link}`;
    const urls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      email: `mailto:?subject=Join Ride X&body=${encodeURIComponent(text)}`,
    };
    window.open(urls[platform], "_blank");
  };

  const activeReferrals = customers.filter((c) => c.status === "active" && c.rides_completed < 5).length + drivers.filter((d) => d.status === "active").length;
  const filteredCustomers = customers.filter((c) => !search || (c.customer_name + c.customer_email).toLowerCase().includes(search.toLowerCase()));

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updated = await base44.entities.Referrer.update(ref.id, editForm);
      setRef(updated);
    } finally { setSaving(false); }
  };

  const Stat = ({ icon: Icon, label, value, sub }) => (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <Icon className="w-5 h-5 text-primary mb-2" />
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  const Row = ({ cols }) => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm py-3 border-b border-border/40">
      {cols.map((c, i) => <div key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>{c}</div>)}
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="Referral program" title={`Welcome, ${ref.full_name?.split(" ")[0] || "referrer"}`} subtitle={`Code: ${ref.referral_code} · Tier: ${ref.bonus_tier || "none"}`} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-6">
          {["dashboard", "referrals", "payouts", "share", "settings"].map((t) => (
            <TabsTrigger key={t} value={t} className="rounded-full px-4 py-1.5 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t}</TabsTrigger>
          ))}
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={Wallet} label="Total earnings (lifetime)" value={money(ref.total_earnings)} />
            <Stat icon={TrendingUp} label="Current balance (this cycle)" value={money(ref.pending_payout)} sub="Pending payout" />
            <Stat icon={Users} label="Customers referred" value={customers.length} />
            <Stat icon={Car} label="Drivers referred" value={drivers.length} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={Users} label="Active referrals" value={activeReferrals} />
            <Stat icon={Wallet} label="Paid out" value={money(ref.paid_out)} />
            <Stat icon={Crown} label="Bonus tier" value={ref.bonus_tier || "none"} />
            <Stat icon={TrendingUp} label="Commission rate" value={`${Math.round((ref.custom_rates ? ref.commission_customer : 0.10) * 100)}%`} sub="Of Ride X's 10% · customer rides" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={() => setTab("share")}><Share2 className="w-4 h-4 mr-2" /> Share my code</Button>
            <Button variant="outline" className="rounded-full" onClick={() => setTab("referrals")}>View referrals</Button>
            <Button variant="outline" className="rounded-full" onClick={() => setTab("payouts")}>View payouts</Button>
          </div>
        </TabsContent>

        {/* Referrals */}
        <TabsContent value="referrals" className="space-y-6">
          <Input className="rounded-xl max-w-sm" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> Customers referred ({filteredCustomers.length})</h3>
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <Row cols={["Name", "Email", "Joined", "Rides", "Commission"]} />
              {filteredCustomers.length === 0 && <p className="text-sm text-muted-foreground py-4">No customer referrals yet.</p>}
              {filteredCustomers.map((c) => (
                <Row key={c.id} cols={[
                  c.customer_name || "—",
                  c.customer_email || "—",
                  new Date(c.created_date).toLocaleDateString(),
                  String(c.rides_completed || 0),
                  money(c.commission_earned),
                ]} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Car className="w-4 h-4" /> Drivers referred ({drivers.length})</h3>
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <Row cols={["Name", "Phone", "Joined", "Rides", "Commission"]} />
              {drivers.length === 0 && <p className="text-sm text-muted-foreground py-4">No driver referrals yet.</p>}
              {drivers.map((d) => (
                <Row key={d.id} cols={[
                  d.driver_name || "—",
                  d.driver_phone || "—",
                  new Date(d.created_date).toLocaleDateString(),
                  String(d.rides_completed || 0),
                  money(d.commission_earned),
                ]} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Payouts */}
        <TabsContent value="payouts" className="space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-6">
            <p className="text-sm text-muted-foreground">Pending payout (current cycle)</p>
            <p className="text-4xl font-extrabold gold-text my-2">{money(ref.pending_payout)}</p>
            <p className="text-xs text-muted-foreground">Payouts are processed every {ref.payout_cycle_months || 2} months via {ref.payment_method || "bank transfer"}. Minimum payout is ₦20,000.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <h3 className="font-semibold mb-2">Payout history</h3>
            <Row cols={["Period", "Amount", "Method", "Status", "Date"]} />
            {payouts.length === 0 && <p className="text-sm text-muted-foreground py-4">No payouts yet.</p>}
            {payouts.map((p) => (
              <Row key={p.id} cols={[
                `${new Date(p.period_start).toLocaleDateString()} – ${new Date(p.period_end).toLocaleDateString()}`,
                money(p.amount),
                p.payment_method || "—",
                p.status, p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—",
              ]} />
            ))}
          </div>
        </TabsContent>

        {/* Share */}
        <TabsContent value="share" className="space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Your referral code</p>
            <p className="text-4xl font-extrabold gold-text tracking-widest my-2">{ref.referral_code}</p>
            <div className="flex items-center gap-2 max-w-md mx-auto">
              <Input className="rounded-xl" readOnly value={link} />
              <Button className="rounded-full" onClick={copy}>{copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}{copied ? "Copied" : "Copy"}</Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {["whatsapp", "facebook", "twitter", "email"].map((s) => (
                <Button key={s} variant="outline" className="rounded-full capitalize" onClick={() => share(s)}>{s}</Button>
              ))}
            </div>
            <img className="mx-auto mt-6 rounded-2xl" alt="QR code for referral link" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`} />
            <p className="text-xs text-muted-foreground mt-2">Scan to sign up with your code</p>
          </div>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="space-y-5 max-w-xl">
          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
            <h3 className="font-semibold">Profile</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Phone</Label><Input className="rounded-xl mt-1" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div><Label className="text-xs">Social handles</Label><Input className="rounded-xl mt-1" value={editForm.social_handles} onChange={(e) => setEditForm({ ...editForm, social_handles: e.target.value })} /></div>
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
            <h3 className="font-semibold">Payout method</h3>
            <Select value={editForm.payment_method} onValueChange={(v) => setEditForm({ ...editForm, payment_method: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="opay">OPay</SelectItem>
                <SelectItem value="paystack">Ride X payout</SelectItem>
              </SelectContent>
            </Select>
            {editForm.payment_method === "bank" && (
              <div className="grid sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Bank name</Label><Input className="rounded-xl mt-1" value={editForm.bank_name} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })} /></div>
                <div><Label className="text-xs">Account name</Label><Input className="rounded-xl mt-1" value={editForm.bank_account_name} onChange={(e) => setEditForm({ ...editForm, bank_account_name: e.target.value })} /></div>
                <div><Label className="text-xs">Account number</Label><Input className="rounded-xl mt-1" value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} /></div>
              </div>
            )}
            {editForm.payment_method === "opay" && (
              <div><Label className="text-xs">OPay number</Label><Input className="rounded-xl mt-1" value={editForm.opay_number} onChange={(e) => setEditForm({ ...editForm, opay_number: e.target.value })} /></div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.notify_email} onChange={(e) => setEditForm({ ...editForm, notify_email: e.target.checked })} />
              Email me about referrals and payouts
            </label>
            <Button className="rounded-full" disabled={saving} onClick={saveSettings}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save settings</Button>
          </div>
          <Link to="/forgot-password"><Button variant="outline" className="rounded-full">Change password</Button></Link>
        </TabsContent>
      </Tabs>
    </div>
  );
}