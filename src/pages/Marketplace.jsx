import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CreateListingForm from "@/components/market/CreateListingForm";
import ListingCard from "@/components/market/ListingCard";
import OrderPanel from "@/components/market/OrderPanel";
import { money } from "@/lib/pricing";
import { Plus, Search, ShieldCheck, PackageOpen } from "lucide-react";
import { EmptyState, SkeletonGrid, ErrorState } from "@/components/shared/Feedback";

const CATEGORIES = ["All", "Electronics", "Phones", "Fashion", "Furniture", "Vehicles", "Caterpillar", "Trailers", "Trucks", "Services", "Agriculture", "Property", "Business", "General"];
const COMMISSION = 0.10;
const DELIVERY_FEE = 1500;

export default function Marketplace() {
  const [me, setMe] = React.useState(null);
  const [tab, setTab] = React.useState("browse");
  const [listings, setListings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("All");
  const [cond, setCond] = React.useState("all");
  const [creating, setCreating] = React.useState(false);
  const [buy, setBuy] = React.useState(null);
  const [opts, setOpts] = React.useState({ useLogistics: false, address: "" });
  const [pay, setPay] = React.useState(null);
  const [boost, setBoost] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const l = await base44.entities.MarketplaceListing.filter({ status: "active" }, "-created_date", 200);
      const now = Date.now();
      const sorted = [...l].sort((a, b) => {
        const ab = a.featured && (!a.boost_until || new Date(a.boost_until).getTime() > now) ? 1 : 0;
        const bb = b.featured && (!b.boost_until || new Date(b.boost_until).getTime() > now) ? 1 : 0;
        if (ab !== bb) return bb - ab;
        return new Date(b.created_date) - new Date(a.created_date);
      });
      setListings(sorted);
    } catch (e) {
      setError(e?.message || "Could not load listings.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); load(); }, []);

  const report = async (l) => {
    await base44.entities.SupportTicket.create({ subject: `Marketplace report: ${l.title}`, message: `Listing ${l.id} reported.`, service: "marketplace" }).catch(() => {});
    alert("Report sent. Our team will review this listing.");
  };

  const startPurchase = (l) => { setBuy(l); setOpts({ useLogistics: false, address: "" }); };
  const proceedToPay = () => {
    if (!buy) return;
    if (opts.useLogistics && !opts.address.trim()) { alert("Enter a delivery address"); return; }
    setPay({ ...buy, useLogistics: opts.useLogistics, address: opts.address.trim(), fee: opts.useLogistics ? DELIVERY_FEE : 0 });
    setBuy(null);
  };

  const onPaid = async (tx) => {
    const l = pay;
    if (!l) return;
    const price = l.price;
    const commission = +(price * COMMISSION).toFixed(2);
    let logisticsId = "", tracking = "";
    if (l.useLogistics) {
      tracking = "MX" + Date.now().toString().slice(-8);
      const lr = await base44.entities.LogisticsRequest.create({
        tracking_number: tracking,
        pickup_address: l.location || "Seller address",
        delivery_address: l.address,
        package_description: l.title,
        amount: l.fee,
        delivery_speed: "standard",
        status: "pending",
        payment_status: "paid",
      }).catch(() => null);
      logisticsId = lr?.id || "";
    }
    const order = await base44.entities.MarketOrder.create({
      listing_id: l.id,
      listing_title: l.title,
      buyer_id: me?.id || "",
      buyer_name: me?.full_name || "Buyer",
      seller_id: l.seller_id || "",
      seller_name: l.seller_name || "Seller",
      amount: price,
      commission,
      delivery_fee: l.fee,
      use_logistics: l.useLogistics,
      logistics_id: logisticsId,
      tracking_number: tracking,
      delivery_address: l.address,
      transaction_id: tx?.id || "",
      status: "escrow",
      payment_status: "held",
    }).catch(() => null);
    if (order) await base44.entities.MarketplaceListing.update(l.id, { status: "reserved" }).catch(() => {});
    setPay(null);
    setTab("orders");
    await load();
  };

  const onBoostPaid = async () => {
    if (boost) {
      const until = new Date(Date.now() + 7 * 864e5).toISOString();
      await base44.entities.MarketplaceListing.update(boost.id, { featured: true, boost_until: until }).catch(() => {});
      await load();
    }
    setBoost(null);
  };

  const match = (l) =>
    (cat === "All" || l.category === cat) &&
    (cond === "all" || l.condition === cond) &&
    (!q || `${l.title} ${l.description} ${l.category} ${l.subcategory || ""}`.toLowerCase().includes(q.toLowerCase()));
  const shown = listings.filter(match);

  return (
    <div>
      <PageHeader
        eyebrow="Market X"
        title="Buy & sell anything"
        subtitle="Escrow-protected marketplace. Funds are held safely and released to the seller only when you confirm. RIDE X keeps a 10% commission on completed sales."
        action={<Button className="rounded-full" onClick={() => setCreating((v) => !v)}><Plus className="w-4 h-4 mr-1" /> {creating ? "Close" : "Sell something"}</Button>}
      />

      <div className="flex gap-2 mb-6 border-b border-border/60">
        {[["browse", "Browse"], ["orders", "My orders"], ["sales", "My sales"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "browse" && (
        <>
          {creating && <CreateListingForm me={me} onCreated={() => { setCreating(false); load(); }} />}
          <div className="flex flex-col md:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings…" className="pl-9 rounded-full bg-card" />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap ${cat === c ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-2">
              {[["all", "All"], ["new", "New"], ["used", "Used"]].map(([k, l]) => (
                <button key={k} onClick={() => setCond(k)} className={`px-4 py-1.5 rounded-full text-xs ${cond === k ? "bg-accent text-accent-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {loading && <SkeletonGrid count={8} />}
            {!loading && error && <ErrorState message={error} onRetry={load} />}
            {!loading && !error && shown.length === 0 && (
              <EmptyState icon={PackageOpen} title="No listings yet" message="Be the first to sell something on Market X." />
            )}
            {!loading && !error && shown.map((l) => <ListingCard key={l.id} l={l} me={me} onBuy={startPurchase} onBoost={setBoost} onReport={report} />)}
          </div>
          <div className="mt-10 rounded-3xl border border-border/60 bg-card p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-primary" /> Buyer & seller protection</h3>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
              <li>Buyer pays into RIDE X escrow. Funds are held safely and only released to the seller once you confirm the item matches its description.</li>
              <li>Not happy? Open a dispute for a refund. Repeated violations lead to permanent account bans.</li>
              <li>Verified seller badges mark trusted sellers. Look for the checkmark.</li>
              <li>Chat in-app, track delivery with Logistics X, and rate each other after every completed sale.</li>
              <li>RIDE X retains a 10% commission on completed sales to keep the marketplace safe and running.</li>
            </ul>
          </div>
        </>
      )}

      {tab === "orders" && <OrderPanel me={me} mode="orders" />}
      {tab === "sales" && <OrderPanel me={me} mode="sales" />}

      <Dialog open={!!buy} onOpenChange={(o) => !o && setBuy(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Buy {buy?.title}</DialogTitle></DialogHeader>
          {buy && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-secondary p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Item price</p>
                <p className="text-2xl font-extrabold">{money(buy.price, buy.currency)}</p>
                <p className="text-xs text-muted-foreground">+ 10% commission on completion · held in escrow</p>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 cursor-pointer">
                <input type="checkbox" checked={opts.useLogistics} onChange={(e) => setOpts((s) => ({ ...s, useLogistics: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium">Deliver with Logistics X</p>
                  <p className="text-xs text-muted-foreground">+ {money(DELIVERY_FEE, buy.currency)} · trackable delivery to your address</p>
                </div>
              </label>
              {opts.useLogistics && (
                <div>
                  <Label className="text-xs">Delivery address</Label>
                  <Input className="rounded-xl mt-1" value={opts.address} onChange={(e) => setOpts((s) => ({ ...s, address: e.target.value }))} placeholder="Where should we deliver?" />
                </div>
              )}
              <div className="flex justify-between text-sm"><span>Delivery fee</span><span>{money(opts.useLogistics ? DELIVERY_FEE : 0, buy.currency)}</span></div>
              <div className="flex justify-between font-bold"><span>You pay now</span><span>{money(buy.price + (opts.useLogistics ? DELIVERY_FEE : 0), buy.currency)}</span></div>
              <Button className="rounded-full w-full h-11 font-semibold" onClick={proceedToPay}>Continue to payment</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={!!pay}
        onOpenChange={(o) => !o && setPay(null)}
        amount={pay ? pay.price + pay.fee : 0}
        commission={pay ? +(pay.price * COMMISSION).toFixed(2) : 0}
        service="marketplace"
        description={pay ? `Market X · ${pay.title}` : ""}
        referenceId={pay?.id}
        allowCash={false}
        onPaid={onPaid}
      />
      <CheckoutDialog
        open={!!boost}
        onOpenChange={(o) => !o && setBoost(null)}
        amount={2500}
        commission={0}
        service="boost"
        description={boost ? `Boost listing · ${boost.title}` : ""}
        referenceId={boost?.id}
        allowCash={false}
        onPaid={onBoostPaid}
      />
    </div>
  );
}