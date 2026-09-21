import React from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

// Address autocomplete using OpenStreetMap Nominatim (free, no API key).
// onSelect receives { label, lat, lng }.
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder }) {
  const [q, setQ] = React.useState(value || "");
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef(null);

  React.useEffect(() => setQ(value || ""), [value]);

  React.useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    if (!q || q.trim().length < 3) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        if (!cancelled) { setResults(data || []); setOpen(true); }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const choose = (r) => {
    const label = r.display_name;
    setQ(label);
    setOpen(false);
    setResults([]);
    onChange?.(label);
    onSelect?.({ label, lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input
        className="rounded-xl mt-1 pr-9"
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange?.(e.target.value); if (e.target.value.length >= 3) setOpen(true); }}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
      </span>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => choose(r)}
              className="flex items-start gap-2 w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border/40 last:border-0"
            >
              <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span className="line-clamp-2 text-foreground/90">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}