import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Music as MusicIcon, Video, Loader2 } from "lucide-react";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";

const GENRES = ["Afrobeats", "Pop", "Hip-Hop", "Gospel", "R&B", "Dancehall", "Highlife", "Jazz", "Reggae", "Electronic"];

export default function MusicUploadForm({ onCreated }) {
  const [kind, setKind] = useState("track");
  const [f, setF] = useState({ title: "", artist: "", genre: "Afrobeats", price: 0.49, is_free: true, description: "" });
  const [cover, setCover] = useState(null);
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");

  const up = async (file, label) => {
    setStage(label);
    setProgress(0);
    const { file_url } = await uploadFileWithProgress(file, (p) => setProgress(p));
    return file_url;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!media || !f.title || !f.artist) return;
    setBusy(true);
    try {
      const coverUrl = cover ? await up(cover, "Cover image") : null;
      setProgress(0);
      const mediaUrl = await up(media, kind === "track" ? "Audio" : "Video");
      const ent = kind === "track" ? "Music" : "MusicVideo";
      const mediaField = kind === "track" ? "audio_url" : "video_url";
      await base44.entities[ent].create({
        title: f.title,
        artist: f.artist,
        genre: f.genre,
        price: Number(f.price),
        is_free: f.is_free,
        is_ad_supported: true,
        cover_url: coverUrl,
        [mediaField]: mediaUrl,
      });
      setF({ title: "", artist: "", genre: "Afrobeats", price: 0.49, is_free: true, description: "" });
      setCover(null); setMedia(null);
      onCreated?.();
    } finally {
      setBusy(false);
      setProgress(0);
      setStage("");
    }
  };

  const field = (name, val) => (
    <div key={name}>
      <Label className="text-xs">{name}</Label>
      <Input value={val} onChange={(e) => setF({ ...f, [name]: e.target.value })} />
    </div>
  );

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border/60 bg-card p-6 space-y-5">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={kind === "track" ? "default" : "outline"} className="rounded-full" onClick={() => setKind("track")}><MusicIcon className="size-3.5" /> Audio Track</Button>
        <Button type="button" size="sm" variant={kind === "video" ? "default" : "outline"} className="rounded-full" onClick={() => setKind("video")}><Video className="size-3.5" /> Music Video</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label className="text-xs">Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Song title" required /></div>
        <div><Label className="text-xs">Artist</Label><Input value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} placeholder="Artist name" required /></div>
        <div>
          <Label className="text-xs">Genre</Label>
          <select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            {GENRES.map((g) => <option key={g} value={g} className="bg-card">{g}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Price ($)</Label><Input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} disabled={f.is_free} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.is_free} onChange={(e) => setF({ ...f, is_free: e.target.checked })} /> Free (ad-supported). Uncheck to make it premium.
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Cover image</Label>
          <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} className="text-xs block mt-1" />
        </div>
        <div>
          <Label className="text-xs">{kind === "track" ? "Audio file" : "Video file"}</Label>
          <input type="file" accept={kind === "track" ? "audio/*" : "video/*"} onChange={(e) => setMedia(e.target.files?.[0] || null)} className="text-xs block mt-1" required />
        </div>
      </div>
      {busy && (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading {stage.toLowerCase()}{stage === "Video" || stage === "Audio" ? "" : "…"}…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <Button type="submit" disabled={busy} className="rounded-full">{busy ? "Uploading…" : `Publish ${kind === "track" ? "track" : "music video"}`}</Button>
    </form>
  );
}