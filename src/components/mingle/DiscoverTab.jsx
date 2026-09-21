import React from "react";
import { Button } from "@/components/ui/button";
import { Heart, X, Loader2, RefreshCw, MapPin } from "lucide-react";
import MapDiscovery from "./MapDiscovery";

// NEARBY NOW — honest, privacy-safe discovery. No fake people, no fake
// availability: when nobody compatible is discoverable, that is what shows.
export default function DiscoverTab({ cards, zones, myCoords, busy, onLike, onPass, onRefresh }) {
  const top = cards[0];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-primary/25 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">
            💜 {cards.length === 0
              ? "No compatible people are currently discoverable in your area."
              : `${cards.length} compatible ${cards.length === 1 ? "person is" : "people are"} currently discoverable in your area.`}
          </p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRefresh} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <MapDiscovery center={myCoords} zones={zones} />
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Purple areas show broad compatible activity — never anyone's exact position.
        </p>
      </div>

      {top ? (
        <div className="rounded-3xl border border-primary/25 bg-card p-6 space-y-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-2xl bg-secondary overflow-hidden border border-border shrink-0">
              {top.photo_url
                ? <img src={top.photo_url} alt={top.display_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl">💜</div>}
            </div>
            <div className="min-w-0">
              <p className="font-heading font-bold text-lg">{top.display_name}, {top.age}</p>
              <p className="text-xs text-muted-foreground">{top.area_label || "In your area"} · {top.band}</p>
              {top.goal && <p className="text-xs text-muted-foreground mt-1">Looking for: {top.goal}</p>}
              {top.interests && <p className="text-xs text-muted-foreground">Interests: {top.interests}</p>}
              {top.bio && <p className="text-xs mt-1 line-clamp-3">{top.bio}</p>}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Match strength {top.strength}/100</span>
            <span>Only a mutual like unlocks chat — no contact details are ever auto-shared.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="rounded-full h-11 border-border" onClick={() => onPass(top)}>
              <X className="w-4 h-4 mr-1" /> PASS
            </Button>
            <Button className="rounded-full h-11 font-semibold" onClick={() => onLike(top)}>
              <Heart className="w-4 h-4 mr-1" /> LIKE
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
          <div className="text-3xl">🔍</div>
          <p className="font-semibold">Nobody compatible is discoverable right now</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Mingle never fakes people, availability or locations. Keep Mingle on — you'll be alerted
            when someone compatible becomes discoverable nearby.
          </p>
        </div>
      )}
    </div>
  );
}