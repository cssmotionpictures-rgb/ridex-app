import React from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ClubJersey from "@/components/sports/ClubJersey";

const TSDB = "https://www.thesportsdb.com/api/v1/json/3";

export default function ClubPicker({ clubs, user, selected, onChange }) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(null);
  const [badges, setBadges] = React.useState({});

  // Fetch each club's real crest (strBadge), kit colours (strColour) and official
  // jersey image (strEquipment) from TheSportsDB.
  React.useEffect(() => {
    if (!clubs || !clubs.length) return;
    let cancelled = false;
    (async () => {
      const map = {};
      await Promise.all(
        clubs.map(async (c) => {
          try {
            const r = await fetch(`${TSDB}/searchteams.php?t=${encodeURIComponent(c.name)}`);
            const j = await r.json();
            const t = j?.teams?.[0];
            if (t && (t.strBadge || t.strEquipment)) {
              map[c.id] = {
                badge: t.strBadge,
                equipment: t.strEquipment,
                kit1: t.strColour1,
                kit2: t.strColour2,
                kit3: t.strColour3,
              };
            }
          } catch {}
        })
      );
      if (!cancelled) setBadges(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs.map((c) => c.id).join(",")]);

  if (!clubs.length) return null;

  const pick = async (club) => {
    setSaving(club.id);
    try {
      await base44.auth.updateMe({ club_id: club.id, club_name: club.name });
      onChange?.(club);
      toast({ title: `You now represent ${club.name}`, description: club.league });
    } catch (e) {
      toast({ title: "Could not save club", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Represent your club</h3>
          <p className="text-xs text-muted-foreground">Back your club in predictions & the forum</p>
        </div>
        {selected && <span className="text-xs text-primary font-medium">{selected.emoji} {selected.name}</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {clubs.map((c) => {
          const isSel = selected && selected.id === c.id;
          return (
            <button key={c.id} onClick={() => pick(c)} disabled={saving === c.id}
              className={`relative rounded-xl border p-3 text-center transition-colors ${isSel ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"}`}>
              {isSel && <CheckCircle2 className="w-4 h-4 text-primary absolute top-1.5 right-1.5" />}
              <ClubJersey color={badges[c.id]?.kit1 || c.color} secondary={badges[c.id]?.kit2} badge={badges[c.id]?.badge} equipment={badges[c.id]?.equipment} emoji={c.emoji} size={44} />
              <p className="text-[11px] font-medium mt-1.5 leading-tight">{c.short_name || c.name}</p>
              <p className="text-[9px] text-muted-foreground">{c.league}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}