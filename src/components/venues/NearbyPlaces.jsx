import React from "react";
import ServiceMap from "@/components/shared/ServiceMap";
import { Button } from "@/components/ui/button";
import { Loader2, Navigation, MapPin, UtensilsCrossed, Store, Pill, ShoppingCart } from "lucide-react";

const CATS = [
  { key: "restaurant", label: "Restaurants", icon: UtensilsCrossed, tags: [["amenity", "restaurant"], ["amenity", "fast_food"]] },
  { key: "mart", label: "Mini Marts", icon: Store, tags: [["shop", "convenience"]] },
  { key: "pharmacy", label: "Pharmacy", icon: Pill, tags: [["amenity", "pharmacy"]] },
  { key: "supermarket", label: "Supermarkets", icon: ShoppingCart, tags: [["shop", "supermarket"]] },
];

const RADIUS = 4000; // metres

const haversineKm = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

export default function NearbyPlaces() {
  const [cat, setCat] = React.useState("restaurant");
  const [pos, setPos] = React.useState(null);
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      () => setPos([6.5244, 3.3792]) // default: Lagos Island
    );
  }, []);

  const search = React.useCallback(async () => {
    if (!pos) return;
    setLoading(true);
    setError("");
    setResults([]);
    const [lat, lng] = pos;
    const def = CATS.find((c) => c.key === cat);
    const parts = def.tags.map(([k, v]) => `node["${k}"="${v}"](around:${RADIUS},${lat},${lng});`).join("");
    const query = `[out:json][timeout:25];(${parts});out body 40;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error("map service unavailable");
      const json = await res.json();
      const items = (json.elements || [])
        .filter((el) => el.lat && el.lon)
        .map((el) => {
          const dist = haversineKm([lat, lng], [el.lat, el.lon]);
          const addr = [el.tags?.["addr:housenumber"], el.tags?.["addr:street"], el.tags?.["addr:city"], el.tags?.["addr:suburb"]].filter(Boolean).join(" ");
          return {
            id: String(el.id),
            name: el.tags?.name || "Unnamed spot",
            dist,
            lat: el.lat,
            lng: el.lon,
            kind: el.tags?.amenity || el.tags?.shop || cat,
            addr,
          };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 30);
      setResults(items);
    } catch (e) {
      setError(e.message || "Couldn't reach the map service. Try again.");
    } finally {
      setLoading(false);
    }
  }, [pos, cat]);

  React.useEffect(() => {
    if (pos) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, cat]);

  const markers = [
    ...(pos ? [{ position: pos, kind: "driver", label: "You" }] : []),
    ...results.map((r) => ({ position: [r.lat, r.lng], kind: "venue", label: r.name })),
  ];

  return (
    <div id="nearby-places" className="mt-12 scroll-mt-24">
      <h3 className="font-semibold mb-1">Discover nearby</h3>
      <p className="text-sm text-muted-foreground mb-4">Restaurants, mini marts, pharmacies and supermarkets around you — powered by OpenStreetMap.</p>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
        {CATS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap border inline-flex items-center gap-1.5 ${cat === c.key ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
        <div className="rounded-3xl overflow-hidden border border-border/60">
          <ServiceMap height="360px" markers={markers} />
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-4 max-h-[360px] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching the area…
            </div>
          )}
          {!loading && error && <p className="text-sm text-destructive py-6 text-center">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No places of this type found nearby.</p>
          )}
          {!loading && !error && results.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-3 border-t border-border/40 first:border-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground capitalize truncate">{r.kind.replace(/_/g, " ")} · {r.dist.toFixed(2)} km{r.addr ? ` · ${r.addr}` : ""}</p>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-full h-8 px-3 text-xs border border-input hover:bg-accent shrink-0"
              >
                <Navigation className="w-3.5 h-3.5" /> Go
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}