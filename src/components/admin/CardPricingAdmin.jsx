import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Save, Settings2 } from "lucide-react";

// CARD PRICING — the Ride X platform fee schedule for Naira and Dollar
// virtual cards. Every fee here is OUR OWN platform fee, charged from the
// user's Ride X wallet; provider charges are taken only from the actual
// card-program response and never configured here.
// Set a fee to 0 to disable it — changes apply instantly, no deployment.

const NGN_FIELDS = [
  ["ngn_issuance_fee", "Issuance fee (₦)"],
  ["ngn_activation_fee", "Activation fee (₦)"],
  ["ngn_maintenance_fee", "Maintenance fee / month (₦)"],
  ["ngn_replacement_fee", "Replacement fee (₦)"],
  ["ngn_closure_fee", "Closure / withdrawal fee (₦)"],
  ["ngn_transaction_percentage", "Transaction fee (%)"],
  ["ngn_min_transaction_fee", "Minimum transaction fee (₦)"],
  ["ngn_funding_percentage", "Funding fee (%)"],
];

const USD_FIELDS = [
  ["usd_issuance_fee", "Issuance fee ($)"],
  ["usd_activation_fee", "Activation fee ($)"],
  ["usd_maintenance_fee", "Maintenance fee / month ($)"],
  ["usd_replacement_fee", "Replacement fee ($)"],
  ["usd_closure_fee", "Closure / withdrawal fee ($)"],
  ["usd_transaction_percentage", "Transaction fee (%)"],
  ["usd_min_transaction_fee", "Minimum transaction fee ($)"],
  ["usd_funding_percentage", "Funding fee (%)"],
  ["usd_fx_markup_percentage", "FX markup (%) — only when a conversion occurs"],
  ["usd_cross_border_markup_percentage", "Cross-border markup (%) — only on provider-confirmed cross-border"],
];

const DEFAULTS = {
  ngn_issuance_fee: 1000, ngn_activation_fee: 0, ngn_maintenance_fee: 200, ngn_replacement_fee: 500,
  ngn_closure_fee: 200, ngn_transaction_percentage: 1, ngn_min_transaction_fee: 50, ngn_funding_percentage: 1,
  usd_issuance_fee: 3, usd_activation_fee: 0, usd_maintenance_fee: 1, usd_replacement_fee: 2,
  usd_closure_fee: 1, usd_transaction_percentage: 1.5, usd_min_transaction_fee: 0.3, usd_funding_percentage: 1.5,
  usd_fx_markup_percentage: 1.5, usd_cross_border_markup_percentage: 0.5,
  usd_ngn_rate: 1600, maintenance_enabled: true, use_live_fx_rate: true,
};

export default function CardPricingAdmin() {
  const [me, setMe] = React.useState(null);
  const [cfg, setCfg] = React.useState(null);
  const [rowId, setRowId] = React.useState("");
  const [busy, setBusy] = React.useState(true);

  const load = React.useCallback(async () => {
    setBusy(true);
    try {
      const user = await base44.auth.me();
      setMe(user);
      if (user?.role !== "admin") { setBusy(false); return; }
      const rows = await base44.entities.CardFeeConfig.filter({ name: "global" });
      const row = rows?.[0];
      setRowId(row?.id || "");
      setCfg({ ...DEFAULTS, ...(row || {}) });
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (busy) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading card pricing…
      </div>
    );
  }

  if (me?.role !== "admin") {
    return <p className="text-sm text-muted-foreground p-6">Card pricing is restricted to Ride X administrators.</p>;
  }

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const data = { ...DEFAULTS, ...cfg, name: "global", updated_by: me.email };
      delete data.id;
      delete data.created_date;
      delete data.updated_date;
      if (rowId) {
        await base44.entities.CardFeeConfig.update(rowId, data);
      } else {
        const created = await base44.entities.CardFeeConfig.create(data);
        setRowId(created.id);
      }
      toast({ title: "Card pricing saved", description: "New fees apply to every new transaction immediately." });
    } catch (e) {
      toast({ title: "Could not save pricing", description: e?.message || "Please try again", variant: "destructive" });
    }
    setBusy(false);
  };

  const section = (title, fields, note) => (
    <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
      <div>
        <h3 className="font-heading font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {fields.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs" htmlFor={key}>{label}</Label>
            <Input
              id={key}
              className="rounded-xl"
              type="number"
              step="0.01"
              min="0"
              value={cfg[key] ?? 0}
              onChange={(e) => set(key, e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-bold">Global card fee settings</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
            <div>
              <p className="text-sm font-semibold">Monthly maintenance charges</p>
              <p className="text-xs text-muted-foreground">Recurring charge per active card</p>
            </div>
            <Switch checked={cfg.maintenance_enabled !== false} onCheckedChange={(v) => set("maintenance_enabled", v)} />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
            <div>
              <p className="text-sm font-semibold">Live provider FX rate</p>
              <p className="text-xs text-muted-foreground">Off = always use the fallback rate below</p>
            </div>
            <Switch checked={cfg.use_live_fx_rate !== false} onCheckedChange={(v) => set("use_live_fx_rate", v)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="usd_ngn_rate">Fallback rate (₦ per $1)</Label>
            <Input
              id="usd_ngn_rate"
              className="rounded-xl"
              type="number"
              step="0.01"
              min="0"
              value={cfg.usd_ngn_rate ?? 1600}
              onChange={(e) => set("usd_ngn_rate", Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">Used to convert dollar fees to the naira wallet when the live rate is unavailable.</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          These are Ride X platform fees only. Provider charges are always taken from the actual card-program
          response and stored separately — never configured or invented here. Set any fee to 0 to disable it.
        </p>
      </div>

      {section("Naira card pricing", NGN_FIELDS, "Charged in ₦ from the user's Ride X wallet.")}
      {section("Dollar card pricing", USD_FIELDS, "Charged in $ (converted at the live/fallback rate) from the naira wallet.")}

      <Button onClick={save} disabled={busy} className="rounded-full px-8">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save card pricing
      </Button>
    </div>
  );
}