import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Image } from "@/components/ui/image";
import ShareButton from "@/components/shared/ShareButton";
import { Play, Star, ArrowLeft } from "lucide-react";

export default function SeriesDetail() {
  const { id } = useParams();
  const [series, setSeries] = React.useState(null);
  const [episodes, setEpisodes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    Promise.all([
      base44.entities.Series.get(id),
      base44.entities.Movie.filter({ series_id: id, status: "published" }),
    ]).then(([s, eps]) => {
      setSeries(s);
      setEpisodes(eps);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading series…</p>;
  if (!series) return <p className="text-muted-foreground">Series not found.</p>;

  const seasons = {};
  episodes.forEach((e) => {
    const sn = e.season_number || 1;
    if (!seasons[sn]) seasons[sn] = [];
    seasons[sn].push(e);
  });
  const seasonKeys = Object.keys(seasons).map(Number).sort((a, b) => a - b);

  return (
    <div>
      <Link to="/movies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to movies
      </Link>

      <div className="rounded-3xl overflow-hidden border border-border/60 mb-8 relative">
        <div className="h-56 md:h-72 bg-secondary">
          {series.poster_url && <Image src={series.poster_url} alt={series.title} className="w-full h-full" focalPointY={0.3} />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute bottom-0 p-6 md:p-8 flex items-end justify-between gap-4 w-full">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Series · {series.genre}</p>
            <h1 className="text-3xl md:text-4xl font-extrabold">{series.title}</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl line-clamp-2">{series.description}</p>
            <p className="text-xs text-muted-foreground mt-2">{seasonKeys.length} season{seasonKeys.length !== 1 ? "s" : ""} · {episodes.length} episode{episodes.length !== 1 ? "s" : ""}</p>
          </div>
          <ShareButton type="movie" id={series.id} title={series.title} variant="outline" size="sm" className="shrink-0">
            Share
          </ShareButton>
        </div>
      </div>

      {seasonKeys.length === 0 && (
        <p className="text-sm text-muted-foreground">No episodes published yet for this series.</p>
      )}

      {seasonKeys.map((sn) => (
        <div key={sn} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-heading text-xl font-bold">Season {sn}</h2>
            <span className="text-xs text-muted-foreground">· {seasons[sn].length} episode{seasons[sn].length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-3">
            {seasons[sn].sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0)).map((e) => (
              <Link key={e.id} to={`/movie?id=${e.id}`} className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-3 hover:border-primary/50 transition-colors group">
                <div className="relative w-28 md:w-40 aspect-video rounded-xl overflow-hidden bg-secondary shrink-0">
                  {e.poster_url && <Image src={e.poster_url} alt={e.title} className="w-full h-full" />}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-6 h-6 text-primary" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary font-semibold">S{e.season_number || sn} · E{e.episode_number || 1}</p>
                  <p className="font-semibold truncate">{e.episode_title || e.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.genre} · {e.duration_minutes || 0} min</p>
                </div>
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-0.5 text-primary text-xs"><Star className="w-3 h-3 fill-current" />{e.rating || 0}</span>
                  <span className="text-xs text-muted-foreground">{(e.view_count || 0).toLocaleString()} views</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}