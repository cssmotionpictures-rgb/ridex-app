import React from "react";
import { footballNews } from "@/lib/apiFootball";
import { Loader2, Newspaper, ExternalLink } from "lucide-react";

export default function FootballNews() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [source, setSource] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await footballNews();
        setItems(res?.items || []);
        setSource(res?.source || "");
        if (res?.error && !(res?.items?.length)) setError(res.error);
      } catch (e) {
        setError(e?.message || "Failed to load football news");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading latest football news…
      </div>
    );
  }

  if (error && !items.length) {
    return <div className="text-center py-10 text-sm text-amber-400/90 bg-amber-500/5 rounded-xl border border-amber-500/20 px-4">{error}</div>;
  }

  if (!items.length) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No news available right now.</p>
      </div>
    );
  }

  return (
    <div>
      {source && <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><Newspaper className="w-3.5 h-3.5" /> Latest from {source}</p>}
      <div className="space-y-3">
        {items.map((it, i) => (
          <a
            key={i}
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 rounded-xl border border-border/60 bg-card p-3 hover:border-primary/50 transition-colors group"
          >
            {it.thumbnail && (
              <img src={it.thumbnail} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-snug group-hover:text-primary line-clamp-2">{it.title}</h3>
              {it.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-1.5">
                <span>{it.pubDate ? new Date(it.pubDate).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                <ExternalLink className="w-3 h-3" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}