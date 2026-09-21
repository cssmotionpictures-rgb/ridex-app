import React, { useRef, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Upload, Check, X, Loader2, Trash2, FileBox, Image as ImageIcon, Sparkles, RefreshCw, Wand2, Download, Box, ShieldCheck, AlertTriangle } from "lucide-react";
import GlbTestViewer from "@/components/admin/GlbTestViewer";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";

// Free Hugging Face image-to-3D providers (credit-free; ~5 min/day ZeroGPU quota per HF account).
const FREE_PROVIDERS = [
  { key: "trellis", label: "Microsoft TRELLIS.2" },
  { key: "hunyuan", label: "Tencent Hunyuan3D-2.1" },
  { key: "stable_fast_3d", label: "Stable Fast 3D" },
  { key: "instantmesh", label: "InstantMesh" },
  { key: "triposr", label: "TripoSR" },
  { key: "wonder3d", label: "Wonder3D" },
  { key: "openlrm", label: "OpenLRM" },
  { key: "crm", label: "CRM" },
  { key: "step1x", label: "Step1X-3D" },
  { key: "unique3d", label: "Unique3D" },
];

// One required vertical-slice slot. Credit-free flow:
//   upload reference (public URL) → Generate (Tripo) → Check Status →
//   server validates GLB magic + stores TEMP url (5-min expiry) →
//   TEST MODEL (Three.js inspector, writes live PASS/FAIL back) →
//   Save Permanently (UploadFile — needs integration credits).
// model_3d_url (permanent) stays empty until saved → arena spawn stays BLOCKED.
export default function GameAssetSlot({ record, portraitUrl, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const [genMsg, setGenMsg] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [pubUrl, setPubUrl] = useState("");
  const [pubPngUrl, setPubPngUrl] = useState("");
  const [freeProvider, setFreeProvider] = useState("trellis");
  const pngInput = useRef(null);
  const glbInput = useRef(null);
  const refInput = useRef(null);

  const hasPortrait = !!(record.reference_portrait_url || (record.is_official_sheet_character && record.character_id));
  const hasRef = !!record.reference_portrait_url;
  const hasPng = !!record.full_body_png_url;
  const hasGlb = !!record.model_3d_url;            // PERMANENT
  const hasTemp = !!record.generated_model_url;    // TEMPORARY (provider)
  const hasFullBody = hasPng || hasGlb;
  const isGenerating = ["queued", "generating"].includes(record.status);
  const isError = record.status === "error";
  const isTempReady = record.status === "generated" && hasTemp && !hasGlb;
  const isPermReady = record.status === "ready" && hasGlb;

  const vDetails = useMemo(() => {
    try { return record.validation_details ? JSON.parse(record.validation_details) : null; } catch { return null; }
  }, [record.validation_details]);

  const expired = record.temp_model_expires_at && new Date(record.temp_model_expires_at).getTime() < Date.now();

  const uploadFile = async (file, kind) => {
    if (!file) return;
    setBusy(kind);
    try {
      const { file_url } = await uploadFileWithProgress(file);
      let patch;
      if (kind === "png") patch = { full_body_png_url: file_url, asset_type: "png", status: "ready" };
      else if (kind === "glb") patch = { model_3d_url: file_url, asset_type: "glb", status: "ready", validation_status: "valid" };
      else if (kind === "ref") patch = { reference_portrait_url: file_url };
      await base44.entities.GameCharacterAsset.update(record.id, patch);
      onUpdated();
    } catch (e) {
      alert("Upload failed (integration credits may be exhausted): " + (e?.message || String(e)));
    } finally {
      setBusy(null);
      [pngInput, glbInput, refInput].forEach((r) => { if (r.current) r.current.value = ""; });
    }
  };

  const generate3D = async (provider) => {
    setBusy(`gen-${provider}`);
    setGenMsg(null);
    try {
      const res = await base44.functions.invoke("generate-character-3d", { assetId: record.id, provider });
      const data = res.data || {};
      if (!data.ok && data.error) setGenMsg({ type: "error", text: data.error });
      else {
        setGenMsg({ type: "info", text: `Generation submitted to ${provider.toUpperCase()} (task ${data.taskId}). Click "Check Status" to poll — takes 10–120s.` });
        onUpdated();
      }
    } catch (e) {
      setGenMsg({ type: "error", text: "Generation failed: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  // Free Hugging Face image-to-3D (primary, credit-free). Calls the
  // generate-character-3d-free backend function, which uploads the reference to a
  // HF Space, polls the Gradio SSE result, validates the GLB, and stores it.
  const generate3DFree = async (provider) => {
    setBusy(`gen-free-${provider}`);
    setGenMsg(null);
    try {
      const res = await base44.functions.invoke("generate-character-3d-free", { assetId: record.id, provider });
      const data = res.data || {};
      if (data.error) setGenMsg({ type: "error", text: data.error });
      else if (data.status === "ready") setGenMsg({ type: "success", text: `${data.provider || provider} generated the GLB & stored it permanently. Arena spawn unblocked.` });
      else if (data.status === "generated") setGenMsg({ type: "info", text: data.message || `GLB generated but permanent storage blocked (credits). Temp URL stored — use "Set public GLB URL" to spawn.` });
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Free generation failed: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  const checkStatus = async () => {
    setBusy("status");
    setGenMsg(null);
    try {
      const res = await base44.functions.invoke("character-3d-status", { assetId: record.id });
      const data = res.data || {};
      if (!data.ok && data.error) setGenMsg({ type: "error", text: data.error });
      else if (data.status === "succeeded")
        setGenMsg({ type: "info", text: "GLB generated & validated. Temporary URL stored (expires ~5 min). Use DOWNLOAD / TEST MODEL now. Permanent storage waiting on credits." });
      else if (data.status === "failed") setGenMsg({ type: "error", text: "Generation failed on the provider side." });
      else setGenMsg({ type: "info", text: `Still generating… ${data.progress != null ? data.progress + "%" : ""}` });
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Status check failed: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  // Save the temporary provider GLB permanently via UploadFile.
  // Requires integration credits — will report a clear error if blocked.
  const savePermanently = async () => {
    if (!hasTemp || expired) { setGenMsg({ type: "error", text: "Temp URL expired or missing. Re-run Check Status first." }); return; }
    setBusy("save");
    setGenMsg({ type: "info", text: "Downloading GLB & saving to permanent storage…" });
    try {
      const resp = await fetch(record.generated_model_url);
      if (!resp.ok) throw new Error("fetch failed");
      const blob = await resp.blob();
      const file = new File([blob], `${record.name.replace(/\s+/g, "_")}.glb`, { type: "model/gltf-binary" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.GameCharacterAsset.update(record.id, { model_3d_url: file_url, asset_type: "glb", status: "ready", validation_status: "valid" });
      setGenMsg({ type: "success", text: "Saved permanently! Arena spawn is now unblocked." });
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Could not save permanently — integration credits are likely exhausted. Wait for the 2026-09-01 reset, then click again." });
    } finally { setBusy(null); }
  };

  // Bypass Base44 storage entirely: set model_3d_url to ANY public GLB URL.
  // The arena fetches the GLB directly from that URL — no UploadFile, no credits.
  // Use this with a Tripo temp link, a self-hosted file, a CDN URL, etc.
  const usePublicGlbUrl = async () => {
    const url = pubUrl.trim();
    if (!url || !/^https?:\/\//.test(url)) { setGenMsg({ type: "error", text: "Paste a full https:// URL to a .glb file." }); return; }
    setBusy("puburl");
    setGenMsg(null);
    try {
      await base44.entities.GameCharacterAsset.update(record.id, {
        model_3d_url: url, generated_model_url: url, asset_type: "glb",
        status: "ready", validation_status: "valid",
        temp_model_expires_at: "",
      });
      setGenMsg({ type: "success", text: "Public GLB URL set — arena spawn is now UNBLOCKED (no Base44 storage used)." });
      setPubUrl("");
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Could not set URL: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  // Credit-free 2.5D path: set full_body_png_url to ANY public PNG URL.
  // The existing arena renders this as the fighter sprite — works 100% while
  // GLB generation is blocked by integration credits.
  const usePublicPngUrl = async () => {
    const url = pubPngUrl.trim();
    if (!url || !/^https?:\/\//.test(url)) { setGenMsg({ type: "error", text: "Paste a full https:// URL to a .png file." }); return; }
    setBusy("pubpng");
    setGenMsg(null);
    try {
      await base44.entities.GameCharacterAsset.update(record.id, {
        full_body_png_url: url, asset_type: "png", status: "ready",
      });
      setGenMsg({ type: "success", text: "Public PNG URL set — 2.5D fighter will spawn in the arena (no Base44 storage used)." });
      setPubPngUrl("");
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Could not set URL: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  const onValidated = async (details) => {
    try {
      await base44.entities.GameCharacterAsset.update(record.id, {
        validation_details: JSON.stringify(details),
        animation_status: details.animations ? "ready" : "pending",
        rig_status: details.rig ? "ready" : "pending",
      });
      onUpdated();
    } catch (e) { /* non-critical */ }
  };

  const clearAsset = async (kind) => {
    setBusy(`clear-${kind}`);
    try {
      const other = kind === "png" ? !!record.model_3d_url : !!record.full_body_png_url;
      const patch = kind === "png"
        ? { full_body_png_url: "", asset_type: other ? "glb" : "none", status: other ? "ready" : "missing" }
        : { model_3d_url: "", asset_type: other ? "png" : "none", status: other ? "ready" : "missing" };
      await base44.entities.GameCharacterAsset.update(record.id, patch);
      onUpdated();
    } catch (e) { alert("Could not remove asset: " + (e?.message || String(e))); }
    finally { setBusy(null); }
  };

  // Blender rig worker (self-hosted server OR Hugging Face ZeroGPU Gradio Space).
  // Calls the generate-rig / rig-status backend functions, which talk to the worker
  // server-side only via BLENDER_RIG_SERVER_URL + BLENDER_RIG_SERVER_KEY.
  const generateRig = async () => {
    if (!record.model_3d_url && !record.generated_model_url) {
      setGenMsg({ type: "error", text: "No source GLB. Generate or paste a GLB URL first." });
      return;
    }
    setBusy("rig-gen"); setGenMsg(null);
    try {
      const res = await base44.functions.invoke("generate-rig", { assetId: record.id });
      const d = res.data || {};
      if (!d.ok && d.error) setGenMsg({ type: "error", text: d.error });
      else setGenMsg({ type: "info", text: `Rig job queued (job ${d.jobId}). Click CHECK STATUS to poll.` });
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Rig request failed: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  const checkRigStatus = async () => {
    if (!record.rig_job_id) { setGenMsg({ type: "error", text: "No rig job. Click GENERATE RIG first." }); return; }
    setBusy("rig-status"); setGenMsg(null);
    try {
      const res = await base44.functions.invoke("rig-status", { assetId: record.id });
      const d = res.data || {};
      if (!d.ok && d.error) setGenMsg({ type: "error", text: d.error });
      else if (d.combat === "COMBAT_READY") setGenMsg({ type: "success", text: "COMBAT_READY — final GLB stored. Fighter is PLAYABLE." });
      else if (d.combat === "ERROR") setGenMsg({ type: "error", text: `Rig failed at stage: ${d.failedStage || d.stage}` });
      else setGenMsg({ type: "info", text: `${d.stage || d.combat} — ${d.progress || 0}%` });
      onUpdated();
    } catch (e) {
      setGenMsg({ type: "error", text: "Status check failed: " + (e?.message || String(e)) });
    } finally { setBusy(null); }
  };

  const Badge = ({ ok, label }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold tracking-wide border ${
      ok ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/40" : "bg-red-950/50 text-red-300 border-red-800/40"
    }`}>
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{label}
    </span>
  );

  const Diag = ({ ok, label, value }) => (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-[#c5a059]/10">
      <span className="text-[11px] text-[#d1a985]">{label}</span>
      <span className={`flex items-center gap-1 text-[11px] font-bold ${
        ok === true ? "text-emerald-300" : ok === false ? "text-red-300" : "text-amber-300"
      }`}>
        {ok === true ? <><Check className="w-3.5 h-3.5" /> PASS</>
        : ok === false ? <><X className="w-3.5 h-3.5" /> FAIL</>
        : <span>PENDING</span>}
        {value && ok !== null && <span className="text-[9px] text-[#6a5a3b] font-normal">({value})</span>}
      </span>
    </div>
  );

  return (
    <div className="noir-panel rounded-2xl p-5 flex flex-col gap-4">
      {showViewer && hasTemp && (
        <GlbTestViewer
          url={record.generated_model_url}
          characterName={record.name}
          onValidated={onValidated}
          onClose={() => setShowViewer(false)}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a6d3b] font-bold">{record.role === "player" ? "Player Fighter" : "Enemy Fighter"}</p>
          <h3 className="text-lg font-extrabold text-[#f0d9a8] font-heading truncate">{record.name}</h3>
          <p className="text-[11px] text-[#6a5a3b] mt-0.5">{record.is_official_sheet_character ? "On official 17-character master sheet — identity fixed" : "Not on master sheet — visual identity must be supplied here"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${
            isPermReady ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
            : isTempReady ? "bg-amber-950/40 text-amber-200 border-amber-700/50"
            : isGenerating ? "bg-amber-950/40 text-amber-300 border-amber-700/50"
            : isError ? "bg-red-950/50 text-red-300 border-red-800/50"
            : "bg-red-950/50 text-red-300 border-red-800/50"
          }`}>
            {isPermReady ? "READY (PERM)" : isTempReady ? "GENERATED (TEMP)" : isGenerating ? "GENERATING" : isError ? "ERROR" : "MISSING"}
          </div>
          {record.provider && <span className="text-[10px] font-bold text-[#8a6d3b]">{record.provider.toUpperCase()}</span>}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="shrink-0 w-24 h-32 rounded-lg overflow-hidden border border-[#c5a059]/25 bg-black/60 flex items-center justify-center">
          {record.reference_portrait_url ? <Image src={record.reference_portrait_url} fittingType="fit" className="w-full h-full object-cover" />
          : portraitUrl ? <Image src={portraitUrl} fittingType="fit" className="w-full h-full object-cover" />
          : (<div className="text-center px-1"><ImageIcon className="w-6 h-6 text-[#6a5a3b] mx-auto" /><p className="text-[9px] text-[#6a5a3b] mt-1">No portrait</p></div>)}
        </div>
        <div className="flex-1 flex flex-col gap-2 justify-center">
          <div className="flex flex-wrap gap-1.5">
            <Badge ok={hasPortrait} label="Reference" />
            <Badge ok={hasTemp} label="Temp GLB" />
            <Badge ok={hasGlb} label="Perm GLB" />
            <Badge ok={hasPng} label="Sprite" />
            <Badge ok={hasFullBody} label="Playable" />
          </div>
          <p className="text-[11px] text-[#8a6d3b] leading-snug">
            {isPermReady ? "Permanent GLB stored — fighter will spawn in the arena."
            : isTempReady ? "Temp GLB valid but NOT permanently stored — arena spawn blocked until saved."
            : "Upload a reference portrait, then Generate 3D (Free) via Hugging Face — or paste a public PNG/GLB URL below."}
          </p>
        </div>
      </div>

      {/* ===== ASSET DIAGNOSTIC PANEL ===== */}
      <div className="rounded-xl border border-[#c5a059]/20 bg-black/50 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Box className="w-3.5 h-3.5 text-[#d97757]" />
          <p className="text-[11px] font-bold text-[#d1a985] tracking-wide">Asset Diagnostics</p>
        </div>
        <Diag ok={hasTemp || hasGlb} label="3D MODEL" value={hasGlb ? "permanent" : hasTemp ? "temp" : "none"} />
        <Diag ok={vDetails?.fullBody ?? null} label="FULL BODY" value={vDetails?.height ? `${vDetails.height}m` : null} />
        <Diag ok={vDetails?.glb ?? (hasGlb ? true : null)} label="GLB (magic)" value={vDetails?.sizeBytes ? `${(vDetails.sizeBytes/1048576).toFixed(1)}MB` : null} />
        <Diag ok={vDetails?.mesh ?? null} label="MESH" value={vDetails?.meshCount ? `${vDetails.meshCount} mesh` : null} />
        <Diag ok={vDetails?.materials ?? null} label="MATERIALS" value={vDetails?.materialCount ? `${vDetails.materialCount}` : null} />
        <Diag ok={vDetails?.textures ?? null} label="TEXTURES" value={vDetails?.textureCount ? `${vDetails.textureCount}` : null} />
        <Diag ok={vDetails?.grounded ?? null} label="GROUNDED" />
        <Diag ok={vDetails?.scale ?? null} label="SCALE" />
        <Diag ok={vDetails?.animations ?? null} label="ANIMATION" value={vDetails?.animationNames ? `${vDetails.animationNames.length}` : null} />
        <Diag ok={isPermReady} label="COMBAT" value={isPermReady ? "ready" : "blocked"} />
        <Diag ok={isPermReady} label="ARENA" value={isPermReady ? "ready" : "blocked"} />
        {vDetails?.checkedBy === "browser-threejs"
          ? <p className="text-[10px] text-emerald-400 mt-2 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Validated live in Three.js</p>
          : <p className="text-[10px] text-[#6a5a3b] mt-2">Start a battle in the 3D arena to fill these checks live from the real GLB.</p>}
      </div>

      {/* ===== BLENDER RIG PIPELINE (7 stages + PLAYABLE gate) ===== */}
      <div className="rounded-xl border border-[#c5a059]/20 bg-black/50 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-[#d97757]" />
          <p className="text-[11px] font-bold text-[#d1a985] tracking-wide">Blender Rig Pipeline</p>
          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded border ${
            record.combat_status === "COMBAT_READY" || record.combat_status === "PLAYABLE" ? "border-emerald-700/40 bg-emerald-950/40 text-emerald-300"
            : record.combat_status === "ERROR" ? "border-red-800/40 bg-red-950/30 text-red-300"
            : record.combat_status && record.combat_status !== "none" ? "border-amber-700/40 bg-amber-950/30 text-amber-200"
            : "border-[#c5a059]/30 bg-black/40 text-[#8a6d3b]"
          }`}>{record.combat_status || "none"}</span>
        </div>
        {(() => {
          let ps = null;
          try { ps = record.pipeline_stages ? JSON.parse(record.pipeline_stages) : null; } catch {}
          const groups = ["model","rig","skin","animation","hitbox","glb","validation"];
          const labels = { model:"MODEL", rig:"RIG", skin:"SKIN", animation:"ANIMATION", hitbox:"HITBOX", glb:"GLB", validation:"VALIDATION" };
          const color = (s) => s === "PASSED" ? "border-emerald-700/40 bg-emerald-950/40 text-emerald-300"
            : s === "PROCESSING" ? "border-amber-700/40 bg-amber-950/40 text-amber-200 animate-pulse"
            : s === "FAILED" ? "border-red-800/40 bg-red-950/30 text-red-300"
            : "border-[#c5a059]/20 bg-black/40 text-[#6a5a3b]";
          const playable = groups.every((g) => ps?.[g] === "PASSED");
          return (
            <>
              <div className="flex flex-wrap gap-1">
                {groups.map((g) => (
                  <span key={g} className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-bold ${color(ps?.[g])}`}>
                    {ps?.[g] === "PASSED" ? <Check className="w-2.5 h-2.5" /> : ps?.[g] === "FAILED" ? <X className="w-2.5 h-2.5" /> : null}{labels[g]}
                  </span>
                ))}
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-bold ${playable ? "text-emerald-300" : "text-[#8a6d3b]"}`}>
                <ShieldCheck className="w-3.5 h-3.5" /> PLAYABLE: {playable ? "TRUE — combat unlocked" : "FALSE"}
              </div>
            </>
          );
        })()}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={generateRig} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-noir-primary text-[10px] font-bold disabled:opacity-40">
            {busy === "rig-gen" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Generate Rig
          </button>
          <button onClick={checkRigStatus} disabled={!!busy || !record.rig_job_id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#c5a059]/30 text-[10px] font-bold text-[#d1a985] disabled:opacity-40">
            {busy === "rig-status" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check Status
          </button>
          {record.processed_model_url && (
            <a href={record.processed_model_url} download={`${record.name.replace(/\s+/g,"_")}_FINAL.glb`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700/40 bg-emerald-950/30 text-[10px] font-bold text-emerald-300">
              <Download className="w-3.5 h-3.5" /> Download GLB
            </a>
          )}
        </div>
        <p className="text-[9px] text-[#6a5a3b] leading-snug">
          The Blender rig worker (your own server or a Hugging Face ZeroGPU Gradio Space) rigs → skins → animates → hitboxes → exports a combat-ready GLB. Set <code className="text-[#d1a985]">BLENDER_RIG_SERVER_URL</code> + <code className="text-[#d1a985]">BLENDER_RIG_SERVER_KEY</code> in Settings → Secrets first. A character is PLAYABLE only when all 7 stages pass — never faked.
        </p>
      </div>

      {/* temp url status */}
      {hasTemp && !hasGlb && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${expired ? "border-red-800/50 bg-red-950/30 text-red-300" : "border-amber-700/40 bg-amber-950/30 text-amber-200"}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {expired ? <AlertTriangle className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            TEMPORARY MODEL URL — {expired ? "EXPIRED" : `expires ${new Date(record.temp_model_expires_at).toLocaleTimeString()}`}
          </div>
          <p className="text-[10px] text-[#6a5a3b] mt-1 truncate">Provider URL (not permanent): {record.generated_model_url}</p>
          <p className="text-[10px] text-amber-300 mt-1">PERMANENT STORAGE: WAITING FOR STORAGE ACCESS (integration credits)</p>
        </div>
      )}

      {isError && record.error_message && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 text-red-300 text-[11px] px-3 py-2">{record.error_message}</div>
      )}
      {genMsg && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${
          genMsg.type === "error" ? "border-red-800/50 bg-red-950/30 text-red-300"
          : genMsg.type === "success" ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-300"
          : "border-amber-700/40 bg-amber-950/30 text-amber-200"
        }`}>{genMsg.text}</div>
      )}

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <select
            value={freeProvider}
            onChange={(e) => setFreeProvider(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-black/50 border border-[#2bb3c0]/40 text-[10px] font-bold text-[#5ed1da] max-w-[150px]"
          >
            {FREE_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button onClick={() => generate3DFree(freeProvider)} disabled={!!busy || !hasRef}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-noir-primary text-[10px] font-bold disabled:opacity-40">
            {busy === `gen-free-${freeProvider}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate 3D (Free)
          </button>
        </div>
        <button onClick={() => generate3D("tripo")} disabled={!!busy || !hasRef}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97757]/15 border border-[#d97757]/40 text-[10px] font-bold text-[#f0c9a8] disabled:opacity-40">
          {busy === "gen-tripo" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate (Tripo)
        </button>
        <button onClick={checkStatus} disabled={!!busy || !record.generation_task_id}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#c5a059]/30 text-[10px] font-bold text-[#d1a985] disabled:opacity-40">
          {busy === "status" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check Status
        </button>
        {hasTemp && (
          <a href={record.generated_model_url} download={`${record.name.replace(/\s+/g, "_")}.glb`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold ${expired ? "border-red-800/40 text-red-400 opacity-60" : "border-emerald-700/40 bg-emerald-950/30 text-emerald-300"}`}>
            <Download className="w-3.5 h-3.5" /> Download GLB
          </a>
        )}
        {hasTemp && (
          <button onClick={() => setShowViewer(true)} disabled={expired}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold ${expired ? "border-red-800/40 text-red-400 opacity-60" : "border-[#2bb3c0]/50 bg-[#2bb3c0]/10 text-[#5ed1da]"}`}>
            <Box className="w-3.5 h-3.5" /> Test Model
          </button>
        )}
        {hasTemp && !hasGlb && (
          <button onClick={savePermanently} disabled={!!busy || expired}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#f7c948]/50 bg-[#f7c948]/10 text-[10px] font-bold text-[#f7c948] disabled:opacity-50">
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Save Permanently
          </button>
        )}
      </div>

      {/* ===== UPLOAD CONTROLS ===== */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => refInput.current?.click()} disabled={!!busy}
          className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-dashed border-[#c5a059]/40 bg-black/40 hover:border-[#d97757]/60 disabled:opacity-50">
          {busy === "ref" ? <Loader2 className="w-4 h-4 animate-spin text-[#d97757]" /> : <ImageIcon className="w-4 h-4 text-[#d1a985]" />}
          <span className="text-[10px] font-semibold text-[#d1a985]">Reference</span>
        </button>
        <button onClick={() => pngInput.current?.click()} disabled={!!busy}
          className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-dashed border-[#c5a059]/40 bg-black/40 hover:border-[#d97757]/60 disabled:opacity-50">
          {busy === "png" ? <Loader2 className="w-4 h-4 animate-spin text-[#d97757]" /> : <Upload className="w-4 h-4 text-[#d1a985]" />}
          <span className="text-[10px] font-semibold text-[#d1a985]">PNG Sprite</span>
        </button>
        <button onClick={() => glbInput.current?.click()} disabled={!!busy}
          className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-dashed border-[#c5a059]/40 bg-black/40 hover:border-[#d97757]/60 disabled:opacity-50">
          {busy === "glb" ? <Loader2 className="w-4 h-4 animate-spin text-[#d97757]" /> : <FileBox className="w-4 h-4 text-[#d1a985]" />}
          <span className="text-[10px] font-semibold text-[#d1a985]">GLB File</span>
        </button>
      </div>
      <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "ref")} />
      <input ref={pngInput} type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "png")} />
      <input ref={glbInput} type="file" accept=".glb,.gltf" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "glb")} />

      {/* Credit-free bypass: paste ANY public GLB or PNG URL → arena uses it directly, no UploadFile */}
      <div className="rounded-xl border border-[#d97757]/30 bg-[#d97757]/5 p-2.5 space-y-2">
        <p className="text-[10px] font-bold text-[#f0c9a8] tracking-wide flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> BYPASS STORAGE — paste a public URL (works now, no credits)
        </p>
        <div className="flex gap-1.5">
          <input
            value={pubUrl}
            onChange={(e) => setPubUrl(e.target.value)}
            placeholder="https://…/Babatunde_Adesanya.glb"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/50 border border-[#c5a059]/25 text-[11px] text-[#f0d9a8] placeholder:text-[#6a5a3b]"
          />
          <button onClick={usePublicGlbUrl} disabled={!!busy}
            className="shrink-0 px-3 py-1.5 rounded-lg btn-noir-primary text-[10px] font-bold disabled:opacity-50">
            {busy === "puburl" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set GLB"}
          </button>
        </div>
        <div className="flex gap-1.5">
          <input
            value={pubPngUrl}
            onChange={(e) => setPubPngUrl(e.target.value)}
            placeholder="https://…/Babatunde_fullbody.png"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/50 border border-[#c5a059]/25 text-[11px] text-[#f0d9a8] placeholder:text-[#6a5a3b]"
          />
          <button onClick={usePublicPngUrl} disabled={!!busy}
            className="shrink-0 px-3 py-1.5 rounded-lg btn-noir-ghost text-[10px] font-bold disabled:opacity-50">
            {busy === "pubpng" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set PNG"}
          </button>
        </div>
        <p className="text-[9px] text-[#6a5a3b]">GLB → 3D fighter (needs the 3D arena). PNG → 2.5D fighter (works in the current arena today). Both bypass Base44 storage & integration credits.</p>
      </div>
    </div>
  );
}