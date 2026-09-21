import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import AdBanner from "@/components/shared/AdBanner";
import ShareButton from "@/components/shared/ShareButton";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Search, Play, Star, Clapperboard } from "lucide-react";

const GENRES = ["All", "Action", "Drama", "Comedy", "Horror", "Romance", "Sci-Fi", "Documentary", "Animation", "Thriller", "Adventure"];

export default function Movies() {
  const [movies, setMovies] = React.useState([]);
  const [series, setSeries] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [genre, setGenre] = React.useState("All");

  React.useEffect(() => {
    base44.entities.Movie.filter({ status: "published" }, "-created_date").then(setMovies);
    base44.entities.Series.filter({ status: "published" }, "-created_date").then(setSeries);
  }, []);

  const featured = movies.filter((m) => m.featured).slice(0, 1)[0];
  const list = movies.filter(
    (m) => (genre === "All" || m.genre === genre) && m.title.toLowerCase().includes(q.toLowerCase())
  );
  const seriesEpisodes = movies.filter((m) => m.series_id);

  return (
    <div>
      <PageHeader eyebrow="CSS Motion Pictures" title="Stream something new" subtitle="First minute free. Then watch an ad, pay ₦500, or go Premium for ad-free access." />

      {featured && (
        <Link to={`/movie?id=${featured.id}`} className="block relative rounded-3xl overflow-hidden border border-border/60 mb-8 group">
          <div className="h-72 md:h-96 bg-secondary">
            {featured.poster_url && <Image src={featured.poster_url} alt={featured.title} className="w-full h-full" focalPointY={0.35} />}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          <div className="absolute bottom-0 p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Featured</p>
            <h2 className="text-3xl md:text-5xl font-extrabold">{featured.title}</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl line-clamp-2">{featured.description}</p>
            <span className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
              <Play className="w-4 h-4" /> Watch now
            </span>
          </div>
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="rounded-full pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
        {GENRES.map((g) => (
          <button
            key={g}
            onClick={() => setGenre(g)}
            className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap border ${genre === g ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-8"><AdBanner type="native" label="Sponsored · Premium: unlimited ad-free streaming for ₦5,000/mo" /></div>

      {series.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Clapperboard className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-xl font-bold">Series & Seasons</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {series.map((s) => {
              const eps = seriesEpisodes.filter((e) => e.series_id === s.id);
              const seasons = [...new Set(eps.map((e) => e.season_number || 1))];
              return (
                <Link key={s.id} to={`/series/${s.id}`} className="group rounded-2xl overflow-hidden border border-border/60 bg-card hover:border-primary/50 transition-colors">
                  <div className="aspect-video bg-secondary relative">
                    {s.poster_url && <Image src={s.poster_url} alt={s.title} className="w-full h-full" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                      <div>
                        <p className="font-semibold text-sm line-clamp-1">{s.title}</p>
                        <p className="text-[10px] text-white/70">{seasons.length} season{seasons.length !== 1 ? "s" : ""} · {eps.length} ep</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No movies match your search.</p>}
        {list.map((m) => (
          <div key={m.id} className="group relative">
            <Link to={`/movie?id=${m.id}`}>
              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-secondary border border-border/60 group-hover:border-primary/50 transition-colors">
                {m.poster_url && <Image src={m.poster_url} alt={m.title} className="w-full h-full" />}
              </div>
              <p className="text-sm font-medium mt-2 truncate">{m.series_id ? `S${m.season_number || 1}·E${m.episode_number || 1} ` : ""}{m.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                {m.genre} · {m.release_year}
                <span className="flex items-center gap-0.5 text-primary"><Star className="w-3 h-3 fill-current" />{m.rating}</span>
              </p>
            </Link>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ShareButton type="movie" id={m.id} title={m.title} variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-background/70 backdrop-blur" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}