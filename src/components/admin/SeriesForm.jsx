import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UploadCloud } from "lucide-react";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";

const GENRES = ["Action", "Drama", "Comedy", "Horror", "Romance", "Sci-Fi", "Documentary", "Animation", "Thriller", "Adventure"];

export default function SeriesForm({ onCreated }) {
  const [form, setForm] = React.useState({ title: "", description: "", genre: "Drama", total_seasons: 1 });
  const [poster, setPoster] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [progress, setProgress] = React.useState(0);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const upload = async (file) => {
    setBusy("poster");
    try {
      const { file_url } = await uploadFileWithProgress(file, (p) => setProgress(p));
      setPoster(file_url);
    } finally {
      setBusy("");
      setProgress(0);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy("save");
    await base44.entities.Series.create({
      ...form,
      total_seasons: Number(form.total_seasons),
      poster_url: poster,
      status: "published",
    });
    setForm({ title: "", description: "", genre: "Drama", total_seasons: 1 });
    setPoster("");
    setBusy("");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <h3 className="font-semibold">Create a series</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Series title</Label>
          <Input className="rounded-xl mt-1" value={form.title} onChange={set("title")} required />
        </div>
        <div>
          <Label className="text-xs">Genre</Label>
          <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.genre} onChange={set("genre")}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Total seasons</Label>
          <Input type="number" className="rounded-xl mt-1" value={form.total_seasons} onChange={set("total_seasons")} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea className="rounded-xl mt-1" value={form.description} onChange={set("description")} />
      </div>
      <div className="rounded-2xl border border-dashed border-border p-4 text-center">
        <label className="cursor-pointer hover:bg-secondary/60 rounded-xl block">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
          <span className="text-xs flex items-center justify-center gap-2">
            {busy === "poster" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {poster ? "Poster uploaded" : "Upload series poster"}
          </span>
        </label>
        {busy === "poster" && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{progress}%</p>
          </div>
        )}
      </div>
      <Button type="submit" className="rounded-full w-full h-11 font-semibold" disabled={!!busy}>
        {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish series"}
      </Button>
      <p className="text-xs text-muted-foreground">After creating a series, upload episodes as movies and set their Series, Season & Episode fields.</p>
    </form>
  );
}