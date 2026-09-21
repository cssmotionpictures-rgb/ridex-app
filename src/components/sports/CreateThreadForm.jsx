import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function CreateThreadForm({ user, onCreated }) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [loading, setLoading] = React.useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await base44.entities.ForumThread.create({
        title: title.trim(), body: body.trim(), category,
        author_id: user.id, author_name: user.full_name || user.email,
        author_club_id: user.club_id || "", author_club_name: user.club_name || "",
      });
      toast({ title: "Thread posted" });
      setTitle(""); setBody(""); setCategory("general");
      onCreated?.();
    } catch (e) { toast({ title: "Could not post", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex gap-2">
        {[{ k: "general", l: "General" }, { k: "live_match", l: "Live Match" }].map((c) => (
          <button key={c.k} onClick={() => setCategory(c.k)} className={`px-3 py-1 rounded-full text-xs ${category === c.k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{c.l}</button>
        ))}
      </div>
      <Input placeholder="Thread title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="Share your thoughts…" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button onClick={submit} disabled={loading} className="rounded-full">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post thread"}</Button>
    </div>
  );
}