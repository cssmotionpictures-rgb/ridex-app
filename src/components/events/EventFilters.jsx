import React from "react";
import { Search, Calendar, Tag, MapPin, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";

const DATE_FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

const PRICE_FILTERS = [
  { key: "all", label: "Any price" },
  { key: "free", label: "Free" },
  { key: "low", label: "Under ₦20k" },
  { key: "mid", label: "₦20k–100k" },
  { key: "high", label: "₦100k+" },
];

const VENUE_FILTERS = [
  { key: "all", label: "Any venue" },
  { key: "indoor", label: "Indoor" },
  { key: "outdoor", label: "Outdoor" },
  { key: "virtual", label: "Virtual" },
];

export default function EventFilters({ filters, setFilters }) {
  const update = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const Pill = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="rounded-2xl pl-9"
          placeholder="Search events, artists, venues..."
          value={filters.q}
          onChange={(e) => update("q", e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1"><Calendar className="w-3 h-3" />Date</span>
        {DATE_FILTERS.map((d) => (
          <Pill key={d.key} active={filters.date === d.key} onClick={() => update("date", d.key)}>{d.label}</Pill>
        ))}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {PRICE_FILTERS.map((p) => (
          <Pill key={p.key} active={filters.price === p.key} onClick={() => update("price", p.key)}>{p.label}</Pill>
        ))}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {VENUE_FILTERS.map((v) => (
          <Pill key={v.key} active={filters.venue === v.key} onClick={() => update("venue", v.key)}>{v.label}</Pill>
        ))}
      </div>
    </div>
  );
}