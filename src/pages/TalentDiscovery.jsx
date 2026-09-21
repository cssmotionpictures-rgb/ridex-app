import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import TalentCard from "@/components/talent/TalentCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarClock, Mic } from "lucide-react";
import { Link } from "react-router-dom";

const TIERS = [
  { value: "any", label: "All tiers" },
  { value: "mega_star", label: "Mega-Star" },
  { value: "superstar", label: "Superstar" },
  { value: "a_list", label: "A-List" },
  { value: "mid", label: "Mid-Tier" },
  { value: "rising", label: "Rising" },
  { value: "emerging", label: "Emerging" },
];

export default function TalentDiscovery() {
  const [artists, setArtists] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [type, setType] = React.useState("any");
  const [tier, setTier] = React.useState("any");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    base44.entities.TalentArtist.filter({ status: "active" }, "-rating", 200)
      .then((list) => setArtists([...list].sort((a, b) =>
        (a.country === "Nigeria" ? 0 : 1) - (b.country === "Nigeria" ? 0 : 1) ||
        (b.premium_placement ? 1 : 0) - (a.premium_placement ? 1 : 0) ||
        (b.rating || 0) - (a.rating || 0)
      )))
      .catch(() => setArtists([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = artists.filter((a) => {
    if (type !== "any" && a.talent_type !== type) return false;
    if (tier !== "any" && a.tier !== tier) return false;
    if (q) {
      const s = `${a.stage_name} ${a.full_name} ${a.location || ""} ${a.country || ""}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Talent"
        title="Book Talent Direct"
        subtitle="Browse musicians, actors, comedians, dancers and DJs. Pick your talent, pay securely — 100% escrow-protected, no middleman."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="rounded-full"><Link to="/talent-dashboard"><Mic className="w-4 h-4" /> Artist</Link></Button>
            <Button asChild variant="outline" className="rounded-full"><Link to="/talent-bookings"><CalendarClock className="w-4 h-4" /> My bookings</Link></Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2 mb-6">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40 rounded-full"><SelectValue placeholder="Talent type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All talent</SelectItem>
            <SelectItem value="musician">Musicians</SelectItem>
            <SelectItem value="actor">Actors</SelectItem>
            <SelectItem value="comedian">Comedians</SelectItem>
            <SelectItem value="dancer">Dancers</SelectItem>
            <SelectItem value="dj">DJs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-40 rounded-full"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>{TIERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="rounded-full w-52" placeholder="Search name or location…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-20">No talent matches your filters.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((a) => <TalentCard key={a.id} artist={a} />)}
        </div>
      )}
    </div>
  );
}