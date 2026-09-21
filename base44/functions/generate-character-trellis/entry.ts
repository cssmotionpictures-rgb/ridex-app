import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

// POST /functions/generate-character-trellis
// Admin-only. Sends the asset's reference portrait to a SELF-HOSTED, open-source
// TRELLIS.2 GPU server (Microsoft, MIT license) — NOT Base44, NOT a paid cloud API.
// The GPU server generates a textured 3D mesh, exports a GLB, and returns a permanent
// download URL living on that server. We store that URL directly in model_3d_url —
// credit-free: no Base44 UploadFile, no integration credits, no per-generation API fee.
// Tripo and Meshy remain as OPTIONAL cloud providers (generate-character-3d).
//
// The browser never receives the TRELLIS server key. The browser never runs TRELLIS.
//
// IMPORTANT: the reference portrait is an IDENTITY reference only — never the fighter.
// The playable fighter is the GLB stored in model_3d_url. If the GLB is missing or
// fails to load, the arena shows "3D CHARACTER ASSET NOT READY" — never a portrait,
// stick figure, or procedural humanoid.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { assetId } = body || {};
    if (!assetId) return Response.json({ error: "assetId required" }, { status: 400 });

    const record = await base44.entities.GameCharacterAsset.get(assetId);
    if (!record) return Response.json({ error: "Asset record not found" }, { status: 404 });

    const imageUrl = record.reference_portrait_url;
    if (!imageUrl)
      return Response.json({ error: "No reference portrait uploaded. Upload a reference image first." }, { status: 400 });

    const trellisUrl = (secrets.get("TRELLIS_SERVER_URL") || "").replace(/\/+$/, "");
    const trellisKey = secrets.get("TRELLIS_SERVER_KEY");
    if (!trellisUrl || !trellisKey)
      return Response.json({ error: "TRELLIS server not configured. Set TRELLIS_SERVER_URL and TRELLIS_SERVER_KEY in Settings → Secrets." }, { status: 400 });

    // Mark generating
    await base44.entities.GameCharacterAsset.update(assetId, {
      status: "generating",
      provider: "trellis",
      error_message: "",
    });

    // Download the reference image server-side (the TRELLIS server can't reach Base44 auth).
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      const msg = `Could not download reference image (${imgRes.status})`;
      await base44.entities.GameCharacterAsset.update(assetId, { status: "error", error_message: msg });
      return Response.json({ error: msg }, { status: 400 });
    }
    const imgBlob = await imgRes.blob();

    // POST multipart/form-data to the TRELLIS server: POST /generate?key=<secret>
    const form = new FormData();
    form.append("file", imgBlob, `${(record.name || "character").replace(/\s+/g, "_")}.png`);

    let genRes;
    try {
      genRes = await fetch(`${trellisUrl}/generate?key=${encodeURIComponent(trellisKey)}`, {
        method: "POST",
        body: form,
      });
    } catch (e) {
      const msg = `Could not reach TRELLIS server at ${trellisUrl}: ${e.message}`;
      await base44.entities.GameCharacterAsset.update(assetId, { status: "error", error_message: msg });
      return Response.json({ error: msg }, { status: 502 });
    }

    const result = await genRes.json().catch(() => ({}));
    if (!genRes.ok) {
      const errMsg = result.detail || result.error || `TRELLIS server error (${genRes.status})`;
      await base44.entities.GameCharacterAsset.update(assetId, { status: "error", error_message: String(errMsg) });
      return Response.json({ error: "TRELLIS generation failed", details: String(errMsg) }, { status: 502 });
    }

    // Synchronous server returns { success, job_id, download_url } where download_url
    // is a relative path like "/download/<job_id>.glb". We build the full URL and store
    // it directly in model_3d_url — no UploadFile, no integration credits.
    const jobId = result.job_id || "";
    const downloadUrl = result.download_url || "";

    if (!downloadUrl) {
      // Async server variant: only a job id returned. Store for polling.
      await base44.entities.GameCharacterAsset.update(assetId, {
        status: "queued",
        generation_task_id: jobId,
      });
      return Response.json({ ok: true, jobId, status: "queued", message: "TRELLIS accepted job. Poll the server once generation completes." });
    }

    const fullGlbUrl = downloadUrl.startsWith("http") ? downloadUrl : `${trellisUrl}${downloadUrl}`;

    await base44.entities.GameCharacterAsset.update(assetId, {
      model_3d_url: fullGlbUrl,
      generated_model_url: fullGlbUrl,
      temp_model_expires_at: "",
      asset_type: "glb",
      status: "ready",
      provider: "trellis",
      generation_task_id: jobId,
      validation_status: "pending",
      error_message: "",
    });

    return Response.json({ ok: true, jobId, modelUrl: fullGlbUrl, status: "ready" });
  } catch (error) {
    console.error("[generate-character-trellis] fatal:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}