import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pricing";
import { Link } from "react-router-dom";
import { CONTACT } from "@/lib/catalog";
import VerifiedBadge from "@/components/safety/VerifiedBadge";
import KycStatusBadge from "@/components/safety/KycStatusBadge";
import EscrowActions from "@/components/shared/EscrowActions";
import AdBanner from "@/components/shared/AdBanner";

export default function Profile() {
  const [user, setUser] = React.useState(null);
  const [phone, setPhone] = React.useState("");
  const [txs, setTxs] = React.useState([]);
  const [saved, setSaved] = React.useState(false);
  const [verified, setVerified] = React.useState(false);

  const loadTxs = () => base44.entities.Transaction.list("-created_date", 25).then(setTxs);
  React.useEffect(() => {
    base44.auth.me().then((u) => { setUser(u); setPhone(u.phone || ""); }).catch(() => {});
    loadTxs();
    base44.entities.Verification.list("-created_date", 1).then((v) => setVerified(v[0]?.status === "approved")).catch(() => {});
  }, []);

  const save = async () => {
    await base44.auth.updateMe({ phone });
    setSaved(true);
  };

  const spent = txs.reduce((s, t) => (t.currency === "USD" ? s + (t.amount || 0) : s), 0);

  return (
    <div>
      <PageHeader eyebrow="Profile" title={user?.full_name || "Your account"} subtitle={user?.email} action={
        <div className="flex items-center gap-2">
          <KycStatusBadge status={user?.kyc_status} />
          {verified ? <VerifiedBadge approved label="Verified rider" /> : <Link to="/safety" className="text-xs text-primary hover:underline">Get verified</Link>}
        </div>
      } />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
          <div>
            <Label className="text-xs">Phone number</Label>
            <Input className="rounded-xl mt-1" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} />
          </div>
          <Button className="rounded-full w-full font-semibold" onClick={save}>{saved ? "Saved" : "Save details"}</Button>
          <p className="text-xs text-muted-foreground">Role: {user?.role || "user"}</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <p className="text-xs text-muted-foreground">Total spent on RIDE X</p>
          <p className="text-3xl font-extrabold mt-1">{money(spent)}</p>
          <p className="text-xs text-muted-foreground mt-4">Payments settle to OPay {CONTACT.opay}</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <p className="text-xs text-muted-foreground">Loyalty</p>
          <p className="text-3xl font-extrabold mt-1">{txs.length * 10} pts</p>
          <p className="text-xs text-muted-foreground mt-4">Every 10th car wash is free.</p>
        </div>
      </div>

      <h3 className="font-semibold mt-10 mb-4 flex items-center gap-2">
        Transaction history
        <span className="text-[11px] font-normal text-muted-foreground">· payments held in escrow for your protection</span>
      </h3>
      <p className="text-xs text-muted-foreground mt-8">
        <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
      </p>
      <div className="space-y-3">
        {txs.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
        {txs.map((t) => (
          <div key={t.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm">{t.description}</p>
              <p className="text-xs text-muted-foreground capitalize">{t.service} · {t.method?.replace(/_/g, " ")} · {new Date(t.created_date).toLocaleString()}</p>
            </div>
            <p className="font-bold">{money(t.amount, t.currency)}</p>
            <StatusBadge status={t.status} />
            <div className="w-full">
              <EscrowActions tx={t} isAdmin={user?.role === "admin"} onChanged={loadTxs} />
            </div>
          </div>
        ))}
      </div>

      {/* Non-critical screen banner — in-flow, never covers controls */}
      <div className="mt-6"><AdBanner /></div>
    </div>
  );
}