import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, MessageSquare, Plus } from "lucide-react";
import CreateThreadForm from "./CreateThreadForm";

export default function ForumList({ user }) {
  const [threads, setThreads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [filter, setFilter] = React.useState("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await base44.entities.ForumThread.list("-created_date", 100);
      setThreads(list || []);
    } catch { setThreads([]); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const filtered = threads.filter((t) => filter === "all" ? true : t.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[{ k: "all", l: "All" }, { k: "live_match", l: "Live Matches" }, { k: "general", l: "General" }].map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === f.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{f.l}</button>
          ))}
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
          <Plus className="w-4 h-4" /> New thread
        </button>
      </div>

      {showForm && <CreateThreadForm user={user} onCreated={() => { setShowForm(false); load(); }} />}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading discussions…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" /><p className="text-muted-foreground text-sm">No threads yet. Start the conversation!</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Link key={t.id} to={`/sports/forum/${t.id}`} className="block rounded-2xl border border-border/60 bg-card p-4 card-lift">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.category === "live_match" ? "bg-red-500/15 text-red-400" : "bg-secondary text-muted-foreground"}`}>{t.category === "live_match" ? "Live Match" : "General"}</span>
                {t.match_label && <span className="text-[10px] text-muted-foreground">{t.match_label}</span>}
                {t.author_club_name && <span className="text-[10px] text-primary">· {t.author_club_name}</span>}
              </div>
              <h3 className="font-semibold text-sm mb-1 line-clamp-1">{t.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
              <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                <span>by {t.author_name}</span>
                <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t.reply_count || 0}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}