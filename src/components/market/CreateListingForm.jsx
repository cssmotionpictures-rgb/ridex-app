import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";

const CATEGORIES = ["Electronics", "Phones", "Fashion", "Furniture", "Vehicles", "Caterpillar", "Trailers", "Trucks", "Services", "Agriculture", "Property", "Business", "General"];
const PROPERTY_TYPES = ["Houses", "Land", "Rentals", "Commercial"];
const HEAVY_EQUIP_TYPES = {
  Caterpillar: ["Excavator", "Bulldozer", "Loader", "Motor Grader", "Dump Truck", "Backhoe", "Telehandler", "Skid Steer", "Compactor", "Forklift"],
  Trailers: ["Flatbed", "Lowboy", "Tanker", "Container", "Tipper", "Refrigerated", "Car Carrier", "Skeletal"],
  Trucks: ["Howo", "Sinotruck", "Mack", "Volvo", "MAN", "Scania", "Mercedes", "Isuzu", "Hyundai", "Tata"],
};

export default function CreateListingForm({ me, onCreated }) {
  const [form, setForm] = React.useState({ title: "", description: "", price: "", condition: "new", category: "General", subcategory: "", currency: "NGN", location: "" });
  const [photo, setPhoto] = React.useState("");
  const [video, setVideo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (file, kind) => {
    if (!file) return;
    setUploading(kind);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (kind === "photo") setPhoto(file_url); else setVideo(file_url);
    } catch (e) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await base44.entities.MarketplaceListing.create({
        ...form,
        subcategory: form.category === "Property" || HEAVY_EQUIP_TYPES[form.category] ? form.subcategory : "",
        price: Number(form.price) || 0,
        photo_url: photo,
        video_url: video,
        seller_name: me?.full_name || "Seller",
        seller_id: me?.id || "",
        status: "active",
      });
      setForm({ title: "", description: "", price: "", condition: "new", category: "General", subcategory: "", currency: "NGN", location: "" });
      setPhoto(""); setVideo("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-8 rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Title</Label>
          <Input className="rounded-xl mt-1" value={form.title} onChange={set("title")} required />
        </div>
        <div>
          <Label className="text-xs">Price</Label>
          <div className="flex gap-2 mt-1">
            <Input className="rounded-xl flex-1" type="number" step="0.01" value={form.price} onChange={set("price")} required />
            <select value={form.currency} onChange={set("currency")} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="NGN" className="bg-card">NGN</option>
            </select>
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs">Condition</Label>
          <select value={form.condition} onChange={set("condition")} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="new" className="bg-card">New</option>
            <option value="used" className="bg-card">Used</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <select value={form.category} onChange={set("category")} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
          </select>
        </div>
        {form.category === "Property" ? (
          <div>
            <Label className="text-xs">Property type</Label>
            <select value={form.subcategory} onChange={set("subcategory")} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm" required>
              <option value="" disabled className="bg-card">Select…</option>
              {PROPERTY_TYPES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
            </select>
          </div>
        ) : HEAVY_EQUIP_TYPES[form.category] ? (
          <div>
            <Label className="text-xs">{form.category} type</Label>
            <select value={form.subcategory} onChange={set("subcategory")} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm" required>
              <option value="" disabled className="bg-card">Select…</option>
              {HEAVY_EQUIP_TYPES[form.category].map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Location</Label>
            <Input className="rounded-xl mt-1" value={form.location} onChange={set("location")} placeholder="City" />
          </div>
        )}
      </div>
      {(form.category === "Property" || HEAVY_EQUIP_TYPES[form.category]) && (
        <div>
          <Label className="text-xs">Location</Label>
          <Input className="rounded-xl mt-1" value={form.location} onChange={set("location")} placeholder="City / area" />
        </div>
      )}
      <div>
        <Label className="text-xs">Description</Label>
        <Input className="rounded-xl mt-1" value={form.description} onChange={set("description")} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Photo</Label>
          <div className="flex items-center gap-3 mt-1">
            <label className="cursor-pointer text-xs inline-flex items-center gap-1 rounded-full border border-input px-3 py-2 hover:bg-accent">
              {uploading === "photo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "photo")} />
            </label>
            {photo && <img src={photo} alt="" className="w-14 h-14 rounded-xl object-cover" />}
          </div>
        </div>
        <div>
          <Label className="text-xs">Product video (optional)</Label>
          <div className="flex items-center gap-3 mt-1">
            <label className="cursor-pointer text-xs inline-flex items-center gap-1 rounded-full border border-input px-3 py-2 hover:bg-accent">
              {uploading === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
              <input type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "video")} />
            </label>
            {video && <span className="text-xs text-emerald-400">Video added ✓</span>}
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        Buyer pays into RIDE X escrow. We hold the funds, deduct a 10% commission on completed sales, then release the rest to you.
      </div>
      <Button type="submit" className="rounded-full h-11 font-semibold" disabled={busy || uploading}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish listing"}
      </Button>
    </form>
  );
}