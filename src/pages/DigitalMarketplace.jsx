import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pricing";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { useToast } from "@/components/ui/use-toast";
import { DIGITAL_LISTING_FEE, DIGITAL_COMMISSION, DIGITAL_FEATURED_FEE } from "@/lib/pricing";
import { Loader2, Upload, Download, Star, Search, Plus, X, Package, ShoppingCart } from "lucide-react";

const CATS = ["All", "Beats", "eBooks", "Courses", "Presets", "Stock Photos"];

export default function DigitalMarketplace() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [products, setProducts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [cat, setCat] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [sellOpen, setSellOpen] = React.useState(false);
  const [buying, setBuying] = React.useState(null);
  const [owned, setOwned] = React.useState(new Set());
  const [form, setForm] = React.useState({ title: "", description: "", category: "Beats", price: "" });
  const [cover, setCover] = React.useState(null);
  const [file, setFile] = React.useState(null);
  const [coverUrl, setCoverUrl] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(0);
  const [listCheckout, setListCheckout] = React.useState(false);

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.DigitalProduct.filter({ status: "published" }, "-created_date", 200)
        .then(setProducts).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  const filtered = products
    .filter((p) => (cat === "All" ? true : p.category === cat))
    .filter((p) => !search || p.title?.toLowerCase().includes(search.toLowerCase()));

  const resetForm = () => {
    setForm({ title: "", description: "", category: "Beats", price: "" });
    setCover(null); setFile(null); setCoverUrl(""); setFileUrl(""); setUploading(0);
  };

  const handleUpload = async (f, kind) => {
    if (!f) return;
    try {
      const res = await uploadFileWithProgress(f, (p) => setUploading(p));
      if (kind === "cover") { setCoverUrl(res.file_url); setCover(f); }
      else { setFileUrl(res.file_url); setFile(f); }
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const startListing = () => {
    if (!form.title || !form.price || !fileUrl) {
      toast({ title: "Missing details", description: "Title, price and product file are required.", variant: "destructive" });
      return;
    }
    setListCheckout(true);
  };

  const onListed = async () => {
    const p = await base44.entities.DigitalProduct.create({
      ...form,
      price: Number(form.price),
      file_url: fileUrl,
      cover_url: coverUrl,
      seller_id: user?.id || "",
      seller_name: user?.full_name || "",
      downloads: 0,
      status: "pending",
    });
    try {
      await base44.functions.invoke("auto-submit-batch", {
        feature_type: "digital_product", reference_id: p.id, title: p.title, amount: DIGITAL_LISTING_FEE,
      });
    } catch {}
    setProducts((prev) => [p, ...prev]);
    setListCheckout(false);
    setSellOpen(false);
    resetForm();
    toast({ title: "Submitted for approval", description: `${p.title} is pending admin review before going live.` });
  };

  const buyProduct = (p) => setBuying(p);

  const onBought = async (tx) => {
    const p = buying;
    await base44.entities.DigitalProduct.update(p.id, { downloads: (p.downloads || 0) + 1 });
    setOwned((prev) => new Set(prev).add(p.id));
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, downloads: (x.downloads || 0) + 1 } : x)));
    setBuying(null);
    toast({ title: "Purchase complete", description: "Your download is ready below." });
  };

  const featureProduct = async (p) => {
    // Featured boost is a separate paid action; here we mark featured instantly in sandbox.
    // For live payments a dedicated CheckoutDialog would wrap this.
    try {
      await base44.entities.DigitalProduct.update(p.id, { featured: true });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, featured: true } : x)));
      toast({ title: "Featured", description: `Boosted for ₦${DIGITAL_FEATURED_FEE.toLocaleString()}/day.` });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Store"
        title="Digital Product Marketplace"
        subtitle="Buy and sell beats, eBooks, courses, presets & stock photos. ₦500 listing fee · 20% commission per sale."
        action={
          <Button className="rounded-full" onClick={() => setSellOpen(true)}><Plus className="w-4 h-4" /> Sell a product</Button>
        }
      />

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-5">
        {CATS.map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${cat === c ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No products yet. Be the first to list one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden card-lift">
              <div className="h-32 bg-secondary relative">
                {p.cover_url ? <Image src={p.cover_url} className="w-full h-full" fittingType="fill" /> : <Package className="w-10 h-10 text-primary absolute inset-0 m-auto" />}
                {p.featured && <span className="absolute top-2 left-2 text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full uppercase">Featured</span>}
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold truncate">{p.title}</p>
                <p className="text-[11px] text-primary">{p.category}</p>
                <p className="text-[11px] text-muted-foreground truncate">{p.seller_name || "Anonymous"}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-sm">{money(p.price)}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Download className="w-3 h-3" /> {p.downloads || 0}</span>
                </div>
                {owned.has(p.id) ? (
                  <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    <Button size="sm" variant="outline" className="rounded-full w-full"><Download className="w-3.5 h-3.5" /> Download</Button>
                  </a>
                ) : (
                  <div className="flex gap-1.5 mt-2">
                    <Button size="sm" className="rounded-full flex-1" onClick={() => buyProduct(p)}><ShoppingCart className="w-3.5 h-3.5" /> Buy</Button>
                    {p.seller_id === user?.id && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => featureProduct(p)} title="Feature ₦2,500/day"><Star className="w-3.5 h-3.5" /></Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sellOpen && (
        <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={() => setSellOpen(null)}>
          <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">List a digital product</p>
              <button onClick={() => setSellOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div><Label className="text-xs">Title</Label><Input className="rounded-xl mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label className="text-xs">Description</Label><Textarea className="rounded-xl mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Category</Label>
                <select className="w-full mt-1 rounded-xl bg-secondary border border-border text-sm h-9 px-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATS.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Price (₦)</Label><Input type="number" className="rounded-xl mt-1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">Cover image (optional)</Label>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0], "cover")} className="block w-full text-xs mt-1" />
              {cover && <p className="text-[11px] text-emerald-400 mt-1">Cover uploaded ✓</p>}
            </div>
            <div>
              <Label className="text-xs">Product file (required)</Label>
              <input type="file" onChange={(e) => handleUpload(e.target.files?.[0], "file")} className="block w-full text-xs mt-1" />
              {uploading > 0 && uploading < 100 && <p className="text-[11px] text-primary mt-1">Uploading… {uploading}%</p>}
              {file && uploading >= 100 && <p className="text-[11px] text-emerald-400 mt-1">File uploaded ✓</p>}
            </div>
            <p className="text-xs text-muted-foreground">Listing fee: {money(DIGITAL_LISTING_FEE)} · 20% commission on each sale.</p>
            <Button className="w-full rounded-full" onClick={startListing}>Pay {money(DIGITAL_LISTING_FEE)} & List</Button>
          </div>
        </div>
      )}

      <CheckoutDialog
        open={!!buying}
        onOpenChange={(v) => !v && setBuying(null)}
        amount={buying?.price}
        service="digital_product"
        description={buying ? `Purchase: ${buying.title}` : ""}
        referenceId={buying ? `dproduct-${buying.id}` : ""}
        onPaid={onBought}
        allowCash={false}
        commission={DIGITAL_COMMISSION}
      />
      <CheckoutDialog
        open={listCheckout}
        onOpenChange={(v) => !v && setListCheckout(null)}
        amount={DIGITAL_LISTING_FEE}
        service="digital_listing"
        description="Digital product listing fee"
        referenceId="digital-listing"
        onPaid={onListed}
        allowCash={false}
      />
    </div>
  );
}