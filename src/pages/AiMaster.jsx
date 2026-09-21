import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pricing";
import { Upload, Wand2, Play, Pause, Download, Loader2, Lock, Sparkles, Copy, Link2, CheckCircle2, ChevronDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { audioBufferToWav, MASTER_PRESETS } from "@/lib/aiMastering";
import { decodeMix, recommendPreset } from "@/lib/masterAnalysis";
import { runMasterMonster } from "@/lib/masterMonster";
import MonsterSummary from "@/components/studio/MonsterSummary";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { queueEmail } from "@/lib/clientBackdoor";
import { flushVault, vaultPut } from "@/lib/masterVault";
import DawWorkflowGuide from "@/components/studio/DawWorkflowGuide";
import ExportSettings from "@/components/studio/ExportSettings";
import MixAnalysisPanel from "@/components/studio/MixAnalysisPanel";
import MasterQualityReport from "@/components/studio/MasterQualityReport";

const MASTER_PRICE = 10000;

const MONSTER_STAGES = {
  validating: "Checking your file…",
  listening: "Listening to your mix…",
  spectrum: "Mapping frequency balance…",
  lowend: "Checking low end…",
  dynamics: "Checking dynamics…",
  stereo: "Analyzing stereo field…",
  planning: "Building mastering chain…",
  render: "Creating first master…",
  verify: "Quality checking…",
  correct: "Making final corrections…",
  finalize: "Finalizing master…",
};

// Compact measurement snapshot persisted with each master for validation reports.
const snapshot = (a) => a ? {
  lufs: a.integratedLufs, shortTermLufs: a.shortTermMaxLufs, lra: a.lra,
  samplePeakDb: a.samplePeakDb, truePeakDb: a.truePeakDb, rmsDb: a.rmsDb, crestDb: a.crestDb,
  correlation: a.mono ? 1 : a.correlation, widthDb: a.mono ? null : a.widthDb,
  clipRuns: a.clipRuns, dcOffset: a.dcOffset, bands: a.bands, bpm: a.groove?.bpm || null,
  durationSec: a.durationSec, sampleRate: a.sampleRate, channels: a.channels,
} : null;

export default function AiMaster() {
  const { toast } = useToast();
  const [preset, setPreset] = React.useState("signature");
  const decodedRef = React.useRef(null);
  const analysisRef = React.useRef(null);
  const [file, setFile] = React.useState(null);
  const [stage, setStage] = React.useState("idle"); // idle | mastering | ready
  const [progressLabel, setProgressLabel] = React.useState("");
  const [analysis, setAnalysis] = React.useState(null);
  const [recommendation, setRecommendation] = React.useState(null);
  const [report, setReport] = React.useState(null);
  const [masterUrl, setMasterUrl] = React.useState(null);
  const [previewable, setPreviewable] = React.useState(false);
  const [paid, setPaid] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [rhythm, setRhythm] = React.useState(false);
  const [autoBass, setAutoBass] = React.useState(false); // opt-in creative layer — off keeps the composition untouched
  const [exportRate, setExportRate] = React.useState(44100);
  const [exportDepth, setExportDepth] = React.useState(24);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [dlBusy, setDlBusy] = React.useState(false);
  const [downloadLink, setDownloadLink] = React.useState(null);
  const [driveState, setDriveState] = React.useState("idle"); // idle | saving | saved | error
  // Loudness-matched A/B — the original mix is re-leveled by the MEASURED
  // LUFS difference so the louder version never wins just by being louder.
  const [abMode, setAbMode] = React.useState("master"); // master | original
  const [origUrl, setOrigUrl] = React.useState(null);
  const audioRef = React.useRef(null);
  const origAudioRef = React.useRef(null);
  const previewSeconds = 20;

  const activeEl = () => (abMode === "original" && origAudioRef.current ? origAudioRef.current : audioRef.current);

  // Re-run the full adaptive mastering chain with the current settings.
  const runMaster = async (key, opts = {}) => {
    if (!decodedRef.current) return false;
    setStage("mastering");
    setProgressLabel("Analyzing mix…");
    setError("");
    try {
      const wav = await runMasterMonster({
        decoded: decodedRef.current,
        analysis: analysisRef.current || undefined,
        presetKey: key,
        autoBass,
        bassRhythm: rhythm,
        sampleRate: exportRate,
        bitDepth: exportDepth,
        onStage: (k) => setProgressLabel(MONSTER_STAGES[k] || "Mastering…"),
        onAnalysis: (a) => { analysisRef.current = a; setAnalysis(a); setRecommendation(recommendPreset(a)); },
        onReport: (r) => {
          setReport(r);
          // Persist the before/after measurements for the validation report page.
          try {
            masterRecordRef.current = null;
            base44.entities.MasteredTrack.create({
              project_title: projectTitle(),
              file_name: fileName || "track",
              preset: r.personality || preset,
              rhythm,
              master_lufs: r.after?.integratedLufs,
              master_true_peak: r.after?.truePeakDb,
              master_lra: r.after?.lra,
              master_crest: r.after?.crestDb,
              correlation: r.after?.mono ? 1 : r.after?.correlation,
              quality_score: r.scoreBreakdown?.total ?? 0,
              passes: r.passes,
              corrections: (r.corrections || []).join("; "),
              conditions: (r.conditions || []).map((c) => c.label).join("; "),
              family: r.family?.family || "",
              before_json: JSON.stringify(snapshot(r.before)),
              after_json: JSON.stringify(snapshot(r.after)),
            }).then((rec) => { masterRecordRef.current = rec?.id || rec?.data?.id || null; }).catch(() => {});
          } catch {}
          // Build the loudness-matched original for the A/B comparison.
          try {
            const g = Math.min(4, Math.max(0.25, Math.pow(10, ((r.after.integratedLufs ?? -70) - (r.before.integratedLufs ?? -70)) / 20)));
            if (!Number.isFinite(g)) return;
            setOrigUrl((old) => {
              if (old) URL.revokeObjectURL(old);
              return URL.createObjectURL(audioBufferToWav(decodedRef.current, 16, g));
            });
          } catch {}
        },
        ...opts,
      });
      setMasterUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(wav); });
      setStage("ready");
      setPreviewable(true);
      setAbMode("master");
      return true;
    } catch (e) {
      if (e?.message?.startsWith("Master failed validation")) {
        setError("The master didn't pass the final quality check — nothing broken was delivered. Try again or a different export setting.");
      } else {
        setError("Mastering was interrupted — your audio is safe on your device. Try again.");
      }
      return false;
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) { setError("Max 30MB audio file."); return; }
    setFile(f); setFileName(f.name); setError(""); setStage("decoding");
    setProgressLabel(MONSTER_STAGES.validating);
    setMasterUrl(null); setPaid(false); setPreviewable(false); setDownloadLink(null); setDriveState("idle");
    setAnalysis(null); setRecommendation(null); setReport(null);
    analysisRef.current = null;
    setOrigUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    try {
      const buf = await f.arrayBuffer();
      const decoded = await decodeMix(buf);
      if (!decoded || !decoded.length || decoded.duration < 3) throw new Error("too short");
      decodedRef.current = decoded;
      setStage("loaded");
    } catch (err) {
      decodedRef.current = null;
      setError("Couldn't decode this audio — try a standard MP3, WAV or FLAC.");
      setStage("idle");
    }
  };

  // Switch presets — re-runs the full adaptive chain on the loaded track.
  const applyPreset = async (key) => {
    setPreset(key);
    if (!decodedRef.current || stage === "mastering") return;
    if (!(await runMaster(key))) {
      setError("Couldn't remaster with this preset — try again.");
      setStage("idle");
    }
  };

  // Export settings — re-render the master at the new sample rate / bit depth.
  const changeRate = async (rate) => {
    setExportRate(rate);
    if (!decodedRef.current || stage === "mastering") return;
    if (!(await runMaster(preset, { sampleRate: rate }))) {
      setError("Couldn't re-export at this sample rate — try again.");
      setStage("idle");
    }
  };

  const changeDepth = async (depth) => {
    setExportDepth(depth);
    if (!decodedRef.current || stage === "mastering") return;
    if (!(await runMaster(preset, { bitDepth: depth }))) {
      setError("Couldn't re-export at this bit depth — try again.");
      setStage("idle");
    }
  };

  // Rhythmic baseline toggle — re-runs the chain with the low-end groove pump.
  const toggleRhythm = async (checked) => {
    setRhythm(checked);
    if (!decodedRef.current || stage === "mastering") return;
    if (!(await runMaster(preset, { bassRhythm: checked }))) {
      setError("Couldn't apply the rhythmic baseline — try again.");
    }
  };

  // Auto-Baseline toggle — the OPT-IN creative bassline layer.
  const toggleAutoBass = async (checked) => {
    setAutoBass(checked);
    if (!decodedRef.current || stage === "mastering") return;
    if (!(await runMaster(preset, { autoBass: checked }))) {
      setError("Couldn't apply the auto baseline — try again.");
    }
  };

  // Per-preset preview: tap the play icon on any preset tab.
  const previewPreset = async (key) => {
    if (!decodedRef.current) {
      toast({ title: "Upload a track first", description: "Load an audio file to hear preset previews." });
      return;
    }
    if (preset === key && masterUrl && stage === "ready") {
      const el = activeEl();
      if (playing) { el.pause(); setPlaying(false); }
      else { el.currentTime = 0; el.play().catch(() => {}); setPlaying(true); }
      return;
    }
    if (playing && audioRef.current) { audioRef.current.pause(); setPlaying(false); }
    if (stage === "mastering") return;
    if (!(await runMaster(key))) {
      setError("Couldn't preview this preset — try again.");
      setStage("idle");
      return;
    }
    setPreset(key);
    setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }, 150);
  };

  const onTimeUpdate = () => {
    const el = activeEl();
    if (!el || paid) return;
    if (el.currentTime >= previewSeconds) {
      el.pause();
      setPlaying(false);
      setPreviewable(false);
    }
  };

  // Loudness-matched A/B switch — keeps the playhead position.
  const switchAb = (mode) => {
    if (mode === abMode) return;
    const fromEl = activeEl();
    const toEl = mode === "original" ? origAudioRef.current : audioRef.current;
    if (fromEl && toEl && fromEl !== toEl) {
      const t = fromEl.currentTime;
      const wasPlaying = !fromEl.paused;
      fromEl.pause();
      try { toEl.currentTime = Math.min(t, (toEl.duration || 1) - 0.05); } catch {}
      if (wasPlaying) toEl.play().catch(() => {});
      setPlaying(wasPlaying);
    }
    setAbMode(mode);
  };

  const togglePlay = () => {
    const el = activeEl();
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().catch(() => {}); setPlaying(true); }
  };

  const masterName = () => {
    const rate = exportRate === 44100 ? "44.1" : exportRate === 88200 ? "88.2" : String(exportRate / 1000);
    const persona = MASTER_PRESETS[report?.personality] || MASTER_PRESETS[preset];
    return `${fileName.replace(/\.[^.]+$/, "") || "track"} (RIDE-X ${persona.label} Master) [${exportDepth}bit ${rate}kHz].wav`;
  };
  const projectTitle = () => fileName.replace(/\.[^.]+$/, "") || "Masters";

  // Auto-save the finished master to Google Drive — fully credit-proof:
  // platform storage first, in-browser CORS host second, and if the whole
  // server path is frozen the master is parked in the on-device vault and the
  // sync retries automatically on the next visit.
  const savedUrlRef = React.useRef(null);
  const masterRecordRef = React.useRef(null);
  const saveToDrive = async () => {
    if (!masterUrl || savedUrlRef.current === masterUrl) return;
    savedUrlRef.current = masterUrl;
    setDriveState("saving");
    try {
      const raw = await fetch(masterUrl).then((r) => r.blob());
      const { file_url } = await uploadFileWithProgress(new File([raw], masterName(), { type: "audio/wav" }));
      if (!file_url) throw new Error("no url");
      const res = await base44.functions
        .invoke("drive-save-master", {
          file_url,
          file_name: masterName(),
          project_title: projectTitle(),
        })
        .catch(() => null);
      if (!res || res.saved !== true) throw new Error("drive sync failed");
      setDriveState("saved");
      // The server link-email is credit-gated — if it couldn't send, queue
      // it in-browser so it goes out the moment service returns.
      if (res.email_sent === false) {
        try {
          const me = await base44.auth.me();
          if (me?.email) {
            queueEmail({
              to: me.email,
              subject: `Your master is ready — ${masterName()}`,
              body: `Your mastered WAV "${masterName()}" was saved to your Google Drive under RIDE X Masters / ${projectTitle()}.\n\nDirect link to your master:\n${file_url}\n\n— RIDE X AI Master`,
              channel: "master-link",
            });
          }
        } catch {}
      }
    } catch {
      // Back door: park the WAV in the on-device vault — a master is never lost.
      savedUrlRef.current = null;
      try {
        const raw = await fetch(masterUrl).then((r) => r.blob());
        await vaultPut({ id: String(Date.now()), file_name: masterName(), project_title: projectTitle(), blob: raw });
        setDriveState("vault");
      } catch {
        setDriveState("error");
      }
    }
  };

  // Retry every master parked in the on-device vault (manual button).
  const retryVaultSync = async () => {
    setDriveState("saving");
    const { attempted, results } = await flushVault(base44);
    setDriveState(attempted > 0 && results.every((r) => r.ok) ? "saved" : "vault");
  };

  // Back door: auto-retry parked masters on every visit, silently.
  React.useEffect(() => { flushVault(base44).catch(() => {}); }, []);

  React.useEffect(() => {
    if (stage === "ready" && masterUrl) saveToDrive();
  }, [masterUrl, stage]);

  const uploadBackupLink = async (name) => {
    const raw = await fetch(masterUrl).then((r) => r.blob());
    // Credit-proof: platform storage first, CORS-friendly in-browser host second.
    const { file_url } = await uploadFileWithProgress(new File([raw], name, { type: "audio/wav" }));
    return file_url || null;
  };

  const saveToDevice = async () => {
    if (!masterUrl) return;
    const name = masterName();
    const raw = await fetch(masterUrl).then((r) => r.blob());
    if (window.self !== window.top && raw.size > 25 * 1024 * 1024) {
      throw new Error("too large for in-frame save");
    }
    const a = document.createElement("a");
    a.download = name;
    if (window.self === window.top) {
      const url = URL.createObjectURL(raw);
      a.href = url;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return true;
    }
    const blob = new File([raw], name, { type: "audio/wav" });
    a.href = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  };

  const download = async () => {
    if (!masterUrl) return;
    const name = masterName();
    if (window.self === window.top && typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "WAV master", accept: { "audio/wav": [".wav"] } }],
        });
        const blob = await fetch(masterUrl).then((r) => r.blob());
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
        saveToDrive();
        toast({ title: "Master saved", description: `${name} saved to your device.` });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    setDlBusy(true);
    let deviceSaved = false;
    try { await saveToDevice(); deviceSaved = true; } catch {}
    saveToDrive();
    if (deviceSaved) {
      toast({ title: "Saving to your device", description: "Check your device's Downloads — it also saves to your Google Drive." });
    }
    try {
      const link = await uploadBackupLink(name);
      if (link) {
        setDownloadLink(link);
        const recPayload = { file_url: link, preset: report?.personality || preset, rhythm };
        if (masterRecordRef.current) {
          base44.entities.MasteredTrack.update(masterRecordRef.current, recPayload).catch(() => {});
        } else {
          base44.entities.MasteredTrack.create({ project_title: projectTitle(), file_name: name, ...recPayload }).catch(() => {});
        }
        if (!deviceSaved) {
          toast({ title: "Your .wav is ready", description: "Tap the Download .wav button to save it to your device." });
        }
      } else if (!deviceSaved) {
        throw new Error("no link");
      }
    } catch {
      if (!deviceSaved) {
        toast({
          title: "Couldn't prepare the download",
          description: "Check your connection and tap download again.",
        });
      }
    }
    setDlBusy(false);
  };

  const downloadTap = async () => {
    try {
      await saveToDevice();
    } catch {
      if (downloadLink) window.open(downloadLink, "_blank");
    }
  };

  const copyLink = async () => {
    if (!downloadLink) return;
    try {
      await navigator.clipboard.writeText(downloadLink);
      toast({ title: "Link copied", description: "Paste it in any browser to download your .wav." });
    } catch {
      toast({ title: "Couldn't copy", description: "Long-press the link to copy it manually." });
    }
  };

  const previewOver = !paid && stage === "ready" && !previewable && activeEl() && activeEl().currentTime >= previewSeconds;

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Song Master"
        title="Master your track"
        subtitle="Upload your song and press one button — RIDE X listens, decides, masters, checks itself and delivers a finished master. No settings needed. Preview free, unlock the full master for a flat fee."
        action={
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/master-reports">Validation reports</Link>
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-5">
          <label className="block">
            <span className="sr-only">Upload audio</span>
            <div className="rounded-3xl border-2 border-dashed border-border/70 p-10 text-center cursor-pointer hover:border-primary/50 transition-colors">
              {stage === "mastering" || stage === "decoding" ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">{progressLabel || "Mastering…"}</p>
                </div>
              ) : masterUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <Sparkles className="w-8 h-8 text-primary" />
                  <p className="font-semibold text-sm truncate max-w-full">{fileName}</p>
                  <p className="text-xs text-primary">Mastered · ready to preview</p>
                  <p className="text-xs text-muted-foreground">Upload a different track</p>
                </div>
              ) : stage === "loaded" ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                  <p className="font-semibold text-sm truncate max-w-full">{fileName}</p>
                  <p className="text-xs text-primary">Loaded — ready to master</p>
                  <p className="text-xs text-muted-foreground">Upload a different track</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="w-8 h-8" />
                  <p className="text-sm">Drop an audio file or click to upload</p>
                  <p className="text-xs">MP3, WAV, FLAC, M4A · up to 30MB</p>
                </div>
              )}
              <input type="file" accept="audio/*" className="hidden" onChange={onFile} />
            </div>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {stage === "loaded" && (
            <Button size="lg" className="w-full h-14 rounded-full text-base font-bold tracking-wide" onClick={() => runMaster("auto")}>
              <Sparkles className="w-5 h-5 mr-2" /> MASTER WITH RIDE X
            </Button>
          )}
          {stage === "ready" && (
            <p className="text-xs text-muted-foreground text-center">Re-master anytime — switch presets under Advanced studio controls below.</p>
          )}

          <div className="rounded-2xl border border-border/60">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span>
                <span className="text-sm font-semibold">Advanced studio controls</span>
                <span className="block text-xs text-muted-foreground">Optional — the engine masters fully automatically. Presets, creative layers and full measurements live here.</span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            {showAdvanced && (
          <div className="space-y-2 px-4 pb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Master personality</p>
            <Tabs value={preset} onValueChange={applyPreset}>
              <TabsList className="grid grid-cols-3 w-full h-auto p-1 gap-1">
                {Object.entries(MASTER_PRESETS).map(([key, p]) => (
                  <TabsTrigger key={key} value={key} className="text-xs px-1.5 py-2 min-h-9">
                    <span className="flex items-center gap-1">
                      <span
                        role="button"
                        aria-label={`Preview ${p.label}`}
                        className="inline-flex items-center text-primary/80 hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); previewPreset(key); }}
                      >
                        {preset === key && playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </span>
                      {p.label}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">{MASTER_PRESETS[preset].tagline}</p>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Rhythmic baseline</p>
                <p className="text-xs text-muted-foreground">Tempo-synced low-end groove — dynamics only, your composition stays untouched.</p>
              </div>
              <Switch checked={rhythm} onCheckedChange={toggleRhythm} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Auto baseline <span className="text-[10px] uppercase tracking-wide text-primary align-middle">creative layer</span></p>
                <p className="text-xs text-muted-foreground">Optional: adds a genre-matched baseline under your song (log drum / 808 / warm sub). Off by default — your master keeps your original composition untouched.</p>
              </div>
              <Switch checked={autoBass} onCheckedChange={toggleAutoBass} />
            </div>
          </div>
            )}
          </div>

          {masterUrl && (
            <div className="rounded-2xl bg-secondary p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Button onClick={togglePlay} size="icon" className="rounded-full">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{paid ? "Full master unlocked" : `Free preview · first ${previewSeconds}s`}</p>
                </div>
                {paid && <Download className="w-5 h-5 text-primary" />}
              </div>
              {origUrl && (
                <div className="flex gap-2">
                  {["master", "original"].map((m) => (
                    <button
                      key={m}
                      onClick={() => switchAb(m)}
                      className={`flex-1 py-1.5 rounded-full text-xs border transition-colors ${abMode === m ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
                    >
                      {m === "master" ? "Mastered" : "Original mix"}
                    </button>
                  ))}
                </div>
              )}
              {origUrl && <p className="text-[11px] text-muted-foreground">A/B is loudness-matched — the louder version never wins just by being louder.</p>}
              <audio
                ref={audioRef}
                src={masterUrl}
                onTimeUpdate={onTimeUpdate}
                onEnded={() => setPlaying(false)}
                controls={false}
                className="hidden"
              />
              <audio
                ref={origAudioRef}
                src={origUrl || undefined}
                onTimeUpdate={onTimeUpdate}
                onEnded={() => setPlaying(false)}
                controls={false}
                className="hidden"
              />
              {!paid && (
                <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min((activeEl()?.currentTime || 0) / previewSeconds * 100, 100)}%` }} />
                </div>
              )}
              {previewOver && <p className="text-xs text-amber-300">Preview ended — unlock to hear the full master.</p>}
              {downloadLink && (
                <div className="rounded-2xl bg-background/60 border border-border/60 p-4 space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Link2 className="w-3 h-3" /> Your .wav is ready — link valid for 60 minutes.</p>
                  <div className="flex gap-2">
                    <Button className="flex-1 rounded-full font-semibold" onClick={downloadTap}>
                      <Download className="w-4 h-4 mr-1" /> Download .wav
                    </Button>
                    <Button size="icon" variant="outline" className="rounded-full shrink-0" onClick={copyLink} aria-label="Copy link">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {report && <MonsterSummary report={report} />}

          {showAdvanced && (
            <div className="space-y-4">
              <MixAnalysisPanel
                analysis={analysis}
                recommendation={recommendation}
                currentPreset={preset}
                onUseRecommendation={applyPreset}
              />

              <MasterQualityReport report={report} />
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary"><Wand2 className="w-5 h-5" /><h3 className="font-semibold">How the adaptive engine masters</h3></div>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Analysis first: LUFS, true peak, crest factor, dynamic range and spectral balance are measured from your actual mix</li>
            <li>• Adaptive EQ: corrections are applied only where the analysis finds a problem — dark mixes get air, bright mixes don't</li>
            <li>• Multiband dynamics with thresholds calibrated to your mix's measured level</li>
            <li>• Low-end intelligence: kick, bass and sub are balanced, never blanket-boosted</li>
            <li>• Normalization-aware loudness: the target adapts to your track (streaming services normalize around −14 LUFS), with extra true-peak headroom for louder masters</li>
            <li>• Self-checking: the result is re-measured, corrected only when needed — a correction that makes things worse rolls back, and every export passes a final quality gate</li>
            <li>• Genre personalities — Signature, Punchy, Heavy, Louder, Amapiano, Afrobeats — guide the target, never force one curve</li>
            <li>• Pro WAV export — 16/24-bit, up to 96 kHz for distribution</li>
          </ul>

          <ExportSettings
            sampleRate={exportRate}
            bitDepth={exportDepth}
            onSampleRateChange={changeRate}
            onBitDepthChange={changeDepth}
          />
          <div className="rounded-2xl bg-secondary p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Full master download</p>
              <p className="text-2xl font-extrabold">{money(MASTER_PRICE)}</p>
            </div>
            <Button
              className="rounded-full font-semibold"
              disabled={stage !== "ready" || dlBusy}
              onClick={() => (paid ? download() : setCheckout(true))}
            >
              {paid ? <><Download className="w-4 h-4 mr-1" /> Download</> : <><Lock className="w-4 h-4 mr-1" /> Unlock & download</>}
            </Button>
          </div>
          {driveState === "saving" && <p className="text-xs text-primary">Saving to Google Drive…</p>}
          {driveState === "saved" && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Saved to Google Drive — folder “{projectTitle()}”</p>}
          {driveState === "vault" && (
            <div className="rounded-2xl bg-secondary/60 border border-border/60 p-3 space-y-2">
              <p className="text-xs text-amber-300">Drive sync is paused by a service limit — your master is safe in the on-device vault and syncs automatically on your next visit.</p>
              <Button size="sm" variant="outline" onClick={retryVaultSync}>Retry Drive sync now</Button>
            </div>
          )}
          {driveState === "error" && <p className="text-xs text-muted-foreground">Drive save didn’t go through — your master is still downloadable to your device.</p>}
          <p className="text-xs text-muted-foreground">Your download is the complete full-length track — the {previewSeconds}s limit applies only to the free preview.</p>
          <p className="text-xs text-muted-foreground">Your track is analyzed and mastered locally on your device — the raw mix is never uploaded. The finished master auto-saves to your Google Drive when mastering completes.</p>
        </div>
      </div>

      <DawWorkflowGuide />

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        amount={MASTER_PRICE}
        service="movie"
        description={`RIDE X Song Master · ${fileName}`}
        onPaid={() => { setPaid(true); setPreviewable(true); setTimeout(() => download(), 400); if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); setPlaying(true); } }}
      />
    </div>
  );
}