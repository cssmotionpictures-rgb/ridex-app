import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UploadCloud, Sparkles } from "lucide-react";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { generateImageClient } from "@/lib/clientImageGen";

const GENRES = ["Action", "Drama", "Comedy", "Horror", "Romance", "Sci-Fi", "Documentary", "Animation", "Thriller", "Adventure"];

export default function MovieUploadForm({ onCreated }) {
  const [form, setForm] = React.useState({ title: "", description: "", genre: "Drama", director: "", cast: "", release_year: 2026, duration_minutes: 90, price: 0.99, series_id: "", season_number: 1, episode_number: 1, episode_title: "", preview_seconds: 45 });
  const [poster, setPoster] = React.useState("");
  const [video, setVideo] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [progress, setProgress] = React.useState({ poster: 0, video: 0 });
  const [seriesList, setSeriesList] = React.useState([]);
  const [contentType, setContentType] = React.useState("movie");
  const [genPoster, setGenPoster] = React.useState(false);

  React.useEffect(() => {
    base44.entities.Series.list("-created_date", 100).then(setSeriesList).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const upload = async (file, kind) => {
    setBusy(kind);
    try {
      const { file_url } = await uploadFileWithProgress(file, (p) => setProgress((s) => ({ ...s, [kind]: p })));
      kind === "poster" ? setPoster(file_url) : setVideo(file_url);
    } finally {
      setBusy("");
      setProgress((s) => ({ ...s, [kind]: 0 }));
    }
  };

  // Keyless AI poster generation (Pollinations) — works in-browser during the
  // credit freeze. Falls back to Core GenerateImage automatically on reset.
  const generatePoster = async () => {
    const prompt = `cinematic movie poster, ${form.genre || "drama"} film"${form.title ? ` titled "${form.title}"` : ""}, ${form.description || "dramatic scene"}, bold typography space, highly detailed`.slice(0, 400);
    setGenPoster(true);
    try {
      const { url } = await generateImageClient(prompt, { width: 768, height: 1152 });
      setPoster(url);
    } catch (e) {
      alert("AI poster failed — try again: " + (e?.message || "timeout"));
    } finally {
      setGenPoster(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy("save");
    const created = await base44.entities.Movie.create({
      ...form,
      release_year: Number(form.release_year),
      duration_minutes: Number(form.duration_minutes),
      price: Number(form.price),
      season_number: Number(form.season_number) || 1,
      episode_number: Number(form.episode_number) || 1,
      preview_seconds: Number(form.preview_seconds) || 45,
      series_id: contentType === "series" ? (form.series_id || undefined) : undefined,
      poster_url: poster,
      video_url: video,
      status: "published",
    });
    setForm({ title: "", description: "", genre: "Drama", director: "", cast: "", release_year: 2026, duration_minutes: 90, price: 0.99, series_id: "", season_number: 1, episode_number: 1, episode_title: "", preview_seconds: 45 });
    setPoster("");
    setVideo("");
    setBusy("");
    onCreated?.();

    // Auto-generate English subtitles in the background (non-blocking)
    if (video) {
      base44.functions.invoke('generate-subtitles', { movieId: created.id, videoUrl: video, totalSeconds: (Number(form.duration_minutes) || 0) * 60 }).catch(() => {});
    }
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <h3 className="font-semibold">Upload a movie</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input className="rounded-xl mt-1" value={form.title} onChange={set("title")} required />
        </div>
        <div>
          <Label className="text-xs">Genre</Label>
          <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.genre} onChange={set("genre")}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Director</Label>
          <Input className="rounded-xl mt-1" value={form.director} onChange={set("director")} />
        </div>
        <div>
          <Label className="text-xs">Cast</Label>
          <Input className="rounded-xl mt-1" value={form.cast} onChange={set("cast")} />
        </div>
        <div>
          <Label className="text-xs">Release year</Label>
          <Input type="number" className="rounded-xl mt-1" value={form.release_year} onChange={set("release_year")} />
        </div>
        <div>
          <Label className="text-xs">Duration (min)</Label>
          <Input type="number" className="rounded-xl mt-1" value={form.duration_minutes} onChange={set("duration_minutes")} />
        </div>
        <div>
          <Label className="text-xs">Unlock price (USD)</Label>
          <Input type="number" step="0.01" className="rounded-xl mt-1" value={form.price} onChange={set("price")} />
        </div>
      </div>

      <div>
        <Label className="text-xs">Free preview seconds (shared link clip length)</Label>
        <Input type="number" className="rounded-xl mt-1" value={form.preview_seconds} onChange={set("preview_seconds")} />
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea className="rounded-xl mt-1" value={form.description} onChange={set("description")} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <label className="cursor-pointer hover:bg-secondary/60 rounded-xl block">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0], "poster")} />
            <span className="text-xs flex items-center justify-center gap-2">
              {busy === "poster" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {poster ? "Poster uploaded" : "Upload poster"}
            </span>
          </label>
          <button type="button" onClick={generatePoster} disabled={genPoster || !!busy} className="mt-2 w-full text-[11px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 disabled:opacity-50">
            {genPoster ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {poster ? "Regenerate AI poster" : "Generate AI poster"}
          </button>
          {busy === "poster" && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress.poster}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{progress.poster}%</p>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <label className="cursor-pointer hover:bg-secondary/60 rounded-xl block">
            <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0], "video")} />
            <span className="text-xs flex items-center justify-center gap-2">
              {busy === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {video ? "Video uploaded" : "Upload video (MP4, MOV, MKV, WebM)"}
            </span>
          </label>
          {busy === "video" && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress.video}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{progress.video}%</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Content type</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setContentType("movie")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${contentType === "movie" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>🎬 Movie</button>
            <button type="button" onClick={() => setContentType("series")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${contentType === "series" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>📺 Season movie</button>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          {contentType === "movie" ? (
            <p className="text-sm text-muted-foreground">This will be published as a <span className="text-primary font-semibold">standalone movie</span>.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Series</Label>
                <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.series_id} onChange={set("series_id")}>
                  <option value="">— Select series —</option>
                  {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Season (1–20)</Label>
                <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.season_number} onChange={set("season_number")}>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Season {n}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Episode (1–300)</Label>
                <select className="w-full mt-1 h-10 rounded-xl bg-background border border-input px-3 text-sm" value={form.episode_number} onChange={set("episode_number")}>
                  {Array.from({ length: 300 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Episode {n}</option>)}
                </select>
              </div>
              <div className="col-span-2 lg:col-span-4">
                <Label className="text-xs">Episode title</Label>
                <Input className="rounded-xl mt-1" value={form.episode_title} onChange={set("episode_title")} placeholder="e.g. The Beginning" />
              </div>
            </div>
          )}
        </div>
      </div>

      <Button type="submit" className="rounded-full w-full h-11 font-semibold" disabled={!!busy}>
        {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish movie"}
      </Button>
    </form>
  );
}