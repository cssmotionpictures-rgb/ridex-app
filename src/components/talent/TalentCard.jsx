import React from "react";
import { Link } from "react-router-dom";
import { money } from "@/lib/pricing";
import { talentPriceFor } from "@/lib/talentPricing";
import { Star, MapPin } from "lucide-react";

export default function TalentCard({ artist }) {
  const img = artist.profile_image;
  const [broken, setBroken] = React.useState(false);
  return (
    <Link to={`/talent/${artist.id}`} className="block rounded-2xl border border-border/60 bg-card p-4 card-lift">
      <div className="aspect-[4/3] rounded-xl bg-secondary overflow-hidden mb-3">
        {img && !broken ? (
          <img src={img} alt={artist.stage_name} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary/40">
            {(artist.stage_name || "?").charAt(0)}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold truncate">{artist.stage_name || artist.full_name}</p>
        {artist.rating > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-400 shrink-0">
            <Star className="w-3 h-3" /> {artist.rating.toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-xs text-primary capitalize">{artist.talent_type} · {artist.tier_label || artist.tier.replace("_", " ")}</p>
      {artist.location && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
          <MapPin className="w-3 h-3 shrink-0" /> {artist.location}, {artist.country}
        </p>
      )}
      <p className="mt-2 font-bold text-sm">{money(talentPriceFor(artist))}</p>
    </Link>
  );
}