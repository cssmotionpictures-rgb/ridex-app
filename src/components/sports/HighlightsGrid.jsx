import React from "react";
import { Loader2, Film, ExternalLink, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SCOREBAT_LEAGUE_FILTER } from "@/lib/sportsSources";
import HighlightPlayer from "@/components/sports/HighlightPlayer";

// ScoreBat's API returns `competition` as either a string (older format) or an
// object { name, id, url } (newer format) — handle both.
const competitionName = (c) => (typeof c === "string" ? c : c?.name || "");

export default function HighlightsGrid({ league = "All" }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [active, setActive] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      try {
        // Proxied through a backend function — ScoreBat's API is CORS-blocked
        // for direct browser fetch, and the proxy pre-extracts the iframe src.
        const response = await base44.functions.invoke("scorebat-highlights", {});
        setItems(response.data?.items || []);
      } catch (e) {
        setError(e.message || "unavailable");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading highlights…</div>;

  if (error) return (
    <div className="text-center py-12">
      <Film className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground mb-3">Highlights feed unavailable right now.</p>
      <a href="https://www.scorebat.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary text-sm underline">Open ScoreBat <ExternalLink className="w-4 h-4" /></a>
    </div>
  );

  const q = SCOREBAT_LEAGUE_FILTER[league];
  const filtered = league === "All" || !q ? items : items.filter((i) => competitionName(i.competition).toLowerCase().includes(q));
  const top = filtered.slice(0, 12);

  if (top.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No recent highlights found for {league}.</p>;

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {top.map((h, i) => {
          const vid = h.videos && h.videos[0];
          return (
            <button
              key={i}
              onClick={() => vid && setActive(h)}
              className="text-left rounded-2xl border border-border/60 bg-card overflow-hidden card-lift flex flex-col group focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="relative aspect-video bg-black overflow-hidden">
                {h.thumbnail ? (
                  <img
                    src={h.thumbnail}
                    alt={h.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer-when-downgrade"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Film className="w-8 h-8" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/90 text-primary-foreground shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 ml-0.5" />
                  </span>
                </div>
                {h.videos && h.videos.length > 1 && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/70 text-white px-2 py-0.5 rounded-full">{h.videos.length} videos</span>
                )}
              </div>
              <div className="p-3 flex-1">
                <p className="text-sm font-medium line-clamp-2">{h.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {competitionName(h.competition)}{h.date ? ` · ${new Date(h.date).toLocaleDateString("en-NG")}` : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {active && (
        <HighlightPlayer
          src={active.videos && active.videos[0] && active.videos[0].src}
          title={active.title}
          competition={competitionName(active.competition)}
          date={active.date}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}