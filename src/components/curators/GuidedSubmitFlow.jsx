import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ExternalLink, Copy, CheckCircle2, XCircle, ChevronRight, Wand2 } from "lucide-react";

// Guided handoff: no platform has a public API, so we fill the track details once,
// then walk the artist curator-by-curator with a ready-to-paste pitch + the real
// submission page open. Real placement happens on the curator's own platform.
export default function GuidedSubmitFlow({ open, onClose, curators, user, type = "music" }) {
  const { toast } = useToast();
  const [step, setStep] = React.useState("form"); // form | queue | done
  const [form, setForm] = React.useState({ artist_name: user?.full_name || "", song_title: "", audio_url: "", genre: "", bio: "", social: "" });
  const [matches, setMatches] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [submitted, setSubmitted] = React.useState({}); // { [curatorId]: true }
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep("form");
      setForm({ artist_name: user?.full_name || "", song_title: "", audio_url: "", genre: "", bio: "", social: "" });
      setMatches([]);
      setIdx(0);
      setSubmitted({});
    }
  }, [open]);

  const label = type === "movie" ? "Movie title" : type === "music_video" ? "Video title" : "Song title";
  const mediaLabel = type === "music" ? "Audio link (MP3 / streaming URL)" : "Video link (MP4 / YouTube URL)";

  const buildMatches = () => {
    const songGenres = (form.genre || "").toLowerCase().split(/[,\s/]+/).map((g) => g.trim()).filter(Boolean);
    const pool = curators.filter((c) => (c.curator_type || "music") === type && c.status === "approved");
    const matched = pool.filter((c) => {
      const cg = (c.genres || "").toLowerCase().split(",").map((g) => g.trim()).filter(Boolean);
      if (!cg.length || !songGenres.length) return true;
      return cg.some((g) => songGenres.some((s) => s.includes(g) || g.includes(s)));
    });
    // Prefer curators that actually have a real submission link
    return (matched.length ? matched : pool).sort((a, b) => (b.submission_url ? 1 : 0) - (a.submission_url ? 1 : 0));
  };

  const startQueue = () => {
    if (!form.song_title || !form.audio_url) {
      toast({ title: "Missing details", description: `${label} and media link are required.`, variant: "destructive" });
      return;
    }
    const m = buildMatches();
    if (!m.length) {
      toast({ title: "No matching curators", description: "Try a broader genre.", variant: "destructive" });
      return;
    }
    setMatches(m);
    setIdx(0);
    setStep("queue");
  };

  const pitchFor = (c) => {
    const who = type === "movie" ? "film" : type === "music_video" ? "music video" : "track";
    return `Hi ${c.name},

I'd love to submit "${form.song_title}" by ${form.artist_name} for consideration on ${c.platform}.
Genre: ${form.genre || "—"}
Listen: ${form.audio_url}${form.social ? `\nSocial: ${form.social}` : ""}${form.bio ? `\n\nAbout: ${form.bio}` : ""}

Thank you for your time — I'd be grateful for a listen and any placement feedback.

— ${form.artist_name}`;
  };

  const copyPitch = async (c) => {
    try {
      await navigator.clipboard.writeText(pitchFor(c));
      toast({ title: "Pitch copied", description: "Paste it into the curator's submission form." });
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy manually.", variant: "destructive" });
    }
  };

  // Real submission entry points per platform — used when a curator has no stored
  // direct link (e.g. Spotify editorial playlists are pitched via Spotify for Artists).
  const PLATFORM_ENTRY = {
    "Spotify": "https://artists.spotify.com/c/playlist-pitching",
    "Apple Music": "https://artists.apple.com/",
    "YouTube Music": "https://artists.youtube.com/",
    "Audiomack": "https://audiomack.com/submit",
    "Boomplay": "https://artists.boomplay.com/",
    "SoundCloud": "https://creators.soundcloud.com/",
    "Deezer": "https://creators.deezer.com/",
    "YouTube": "https://artists.youtube.com/",
    "TikTok": "https://www.tiktok.com/creators/creator-center/",
    "SubmitHub": "https://www.submithub.com/",
    "Groover": "https://groover.co/",
    "SubmitLink": "https://www.submitlink.com/",
  };
  const platformKey = (p) => (p || "").trim();

  const openPlatform = (c) => {
    const url = c.submission_url || c.playlist_url || PLATFORM_ENTRY[platformKey(c.platform)];
    if (url) {
      window.open(url, "_blank", "noopener");
      if (!c.submission_url && !c.playlist_url) {
        toast({ title: `Opening ${c.platform} submission hub`, description: `Pitch "${form.song_title}" there, then return and mark submitted.` });
      }
    } else {
      toast({ title: "No direct link", description: `Search ${c.name} on ${c.platform} manually.`, variant: "destructive" });
    }
  };

  const markSubmitted = async () => {
    const c = matches[idx];
    setSubmitted((p) => ({ ...p, [c.id]: true }));
    if (idx + 1 < matches.length) setIdx(idx + 1);
    else await finish();
  };

  const skip = () => {
    if (idx + 1 < matches.length) setIdx(idx + 1);
    else finish();
  };

  const finish = async () => {
    setSaving(true);
    const routed = matches.filter((c) => submitted[c.id]);
    const created = routed.length
      ? await base44.entities.CuratorSubmission.bulkCreate(
          routed.map((c) => ({
            curator_id: c.id,
            curator_name: c.name,
            artist_name: form.artist_name,
            song_title: form.song_title,
            audio_url: form.audio_url,
            genre: form.genre,
            submitted_by_id: user?.id || "",
            submitted_by_name: user?.full_name || "",
            fee_paid: 0,
            status: "accepted",
            curator_review: "Routed via guided handoff — submission made by artist on the curator's own platform",
          }))
        ).catch(() => [])
      : [];
    setSaving(false);
    setStep("done");
    toast({
      title: "Guided submit complete",
      description: `You hand-submitted to ${routed.length} curator${routed.length === 1 ? "" : "s"} — logged as routed for placement tracking.`,
    });
    return created;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-2xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <p className="font-semibold">Guided Auto-Submit</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
        </div>

        {step === "form" && (
          <>
            <p className="text-xs text-muted-foreground">
              Fill your track details once. We'll walk you through each matching curator — copy the ready pitch, open their real submission page, paste, and submit. Real placement happens on the curator's own platform (no API needed).
            </p>
            <div>
              <Label className="text-xs">Artist name</Label>
              <Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => setForm({ ...form, artist_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{label}</Label>
              <Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => setForm({ ...form, song_title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Genre</Label>
              <Input className="rounded-xl mt-1" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Afrobeats, Pop…" />
            </div>
            <div>
              <Label className="text-xs">{mediaLabel}</Label>
              <Input className="rounded-xl mt-1" value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label className="text-xs">Social handle (optional)</Label>
              <Input className="rounded-xl mt-1" value={form.social} onChange={(e) => setForm({ ...form, social: e.target.value })} placeholder="@artist" />
            </div>
            <div>
              <Label className="text-xs">Short bio (optional)</Label>
              <Textarea className="rounded-xl min-h-16" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="One-line artist bio for the pitch…" />
            </div>
            <Button className="w-full rounded-full" onClick={startQueue}>
              Find matching curators <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}

        {step === "queue" && matches[idx] && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Curator {idx + 1} of {matches.length}</span>
              <span>{Object.keys(submitted).length} submitted</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${(idx / matches.length) * 100}%` }} />
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="font-semibold">{matches[idx].name}</p>
              <p className="text-xs text-primary">{matches[idx].platform}{matches[idx].genres ? ` · ${matches[idx].genres}` : ""}</p>
            </div>
            <div>
              <Label className="text-xs">Ready-to-paste pitch</Label>
              <Textarea className="rounded-xl mt-1 min-h-32 text-xs" readOnly value={pitchFor(matches[idx])} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => copyPitch(matches[idx])}>
                <Copy className="w-4 h-4" /> Copy pitch
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => openPlatform(matches[idx])}>
                <ExternalLink className="w-4 h-4" /> Open {matches[idx].platform}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="rounded-full" onClick={skip}>Skip</Button>
              <Button className="rounded-full" onClick={markSubmitted}>
                <CheckCircle2 className="w-4 h-4" /> Mark submitted
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="font-semibold">Guided submit complete</p>
            <p className="text-xs text-muted-foreground">
              You hand-submitted to {Object.keys(submitted).length} curator{Object.keys(submitted).length === 1 ? "" : "s"}. Each is logged as <span className="text-emerald-400">Routed</span> — placement happens on their platform, so check back for replies.
            </p>
            <Button className="rounded-full" onClick={onClose}>Done</Button>
          </div>
        )}

        {saving && (
          <div className="fixed inset-0 z-[700] bg-black/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}