import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["Fine Dining", "Casual", "Fast Food", "Sports Bar", "Cocktail Lounge", "Nightclub", "Wine Bar", "Rooftop Bar", "Beach Bar", "Pub & Grill"];

export default function VenueForm({ onCreated }) {
  const [form, setForm] = React.useState({ name: "", category: "Casual", description: "", address: "", photo_url: "", lat: 6.4318, lng: 3.4216, price_level: "$$", rating: 4.5 });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    await base44.entities.Venue.create({
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
      rating: Number(form.rating),
      status: "active",
    });
    setForm({ ...form, name: "", description: "", address: "", photo_url: "" });
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <h3 className="font-semibold">Add a venue</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input className="rounded-xl mt-1" value={form.name} onChange={set("name")} required />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Input className="rounded-xl mt-1" value={form.address} onChange={set("address")} />
        </div>
        <div>
          <Label className="text-xs">Photo URL</Label>
          <Input className="rounded-xl mt-1" value={form.photo_url} onChange={set("photo_url")} />
        </div>
        <div>
          <Label className="text-xs">Latitude</Label>
          <Input className="rounded-xl mt-1" value={form.lat} onChange={set("lat")} />
        </div>
        <div>
          <Label className="text-xs">Longitude</Label>
          <Input className="rounded-xl mt-1" value={form.lng} onChange={set("lng")} />
        </div>
        <div>
          <Label className="text-xs">Price level</Label>
          <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.price_level} onChange={set("price_level")}>
            {["$", "$$", "$$$", "$$$$"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Rating</Label>
          <Input type="number" step="0.1" max="5" className="rounded-xl mt-1" value={form.rating} onChange={set("rating")} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea className="rounded-xl mt-1" value={form.description} onChange={set("description")} />
      </div>
      <Button type="submit" className="rounded-full w-full h-11 font-semibold">Add venue</Button>
    </form>
  );
}