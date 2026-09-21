import React from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

export default function ForumThreadView({ user }) {
  const { id } = useParams();
  const { toast } = useToast();
  const [thread, setThread] = React.useState(null);
  const [replies, setReplies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const t = await base44.entities.ForumThread.get(id);
      setThread(t);
      const r = await base44.entities.ForumReply.filter({ thread_id: id }, "created_date", 200);
      setReplies(r || []);
    } catch { setThread(null); }
    finally { setLoading(false); }
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const reply = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await base44.entities.ForumReply.create({
        thread_id: id, body: body.trim(),
        author_id: user.id, author_name: user.full_name || user.email,
        author_club_id: user.club_id || "", author_club_name: user.club_name || "",
      });
      await base44.entities.ForumThread.update(id, { reply_count: (replies.length || 0) + 1 });
      setBody("");
      load();
    } catch (e) { toast({ title: "Could not reply", description: e.message, variant: "destructive" }); }
    finally { setPosting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>;
  if (!thread) return <div className="text-center py-20 text-muted-foreground">Thread not found. <Link to="/sports/forum" className="underline text-primary">Back to forum</Link></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link to="/sports/forum" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> All threads</Link>
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${thread.category === "live_match" ? "bg-red-500/15 text-red-400" : "bg-secondary text-muted-foreground"}`}>{thread.category === "live_match" ? "Live Match" : "General"}</span>
          {thread.match_label && <span className="text-[10px] text-muted-foreground">{thread.match_label}</span>}
          {thread.author_club_name && <span className="text-[10px] text-primary">· {thread.author_club_name}</span>}
        </div>
        <h1 className="text-xl font-bold mb-2">{thread.title}</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{thread.body}</p>
        <p className="text-xs text-muted-foreground mt-3">by {thread.author_name} · {new Date(thread.created_date).toLocaleString("en-NG")}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{replies.length} replies</h3>
        {replies.map((r) => (
          <div key={r.id} className="rounded-xl border border-border/60 bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">{r.author_name}</span>
              {r.author_club_name && <span className="text-[10px] text-primary">· {r.author_club_name}</span>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-3">
        <Textarea placeholder="Add your reply…" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end mt-2">
          <button onClick={reply} disabled={posting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Reply</>}
          </button>
        </div>
      </div>
    </div>
  );
}