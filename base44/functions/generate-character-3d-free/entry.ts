import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  HF_PROVIDERS,
  validateSpace,
  uploadFile,
  submitCall,
  pollResult,
  extract3DFile,
} from "../../shared/hfGradioProvider.ts";

// POST /functions/generate-character-3d-free
// Admin-only. Credit-free image-to-3D generation via free Hugging Face Spaces
// (Microsoft TRELLIS.2 primary; Hunyuan3D-2.1, Stable Fast 3D, InstantMesh, etc.).
// Uses HF_TOKEN (server-side). Downloads the reference portrait, uploads it to
// the Space, submits a Gradio generation, polls the SSE result, extracts the
// 3D file, validates the GLB magic header, and attempts permanent Base44 storage.
// If Base44 storage (UploadFile) is unavailable (integration credits exhausted),
// it stores the Space's file URL as a TEMP url and instructs the admin to use the
// "Set public GLB URL" bypass — model_3d_url is never set to a non-permanent URL.
export default async function (req) {
  let base44;
  let assetId;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    assetId = body?.assetId;
    const providerKey = body?.provider || "trellis";
    const cfg = HF_PROVIDERS[providerKey];
    if (!assetId) return Response.json({ error: "assetId required" }, { status: 400 });
    if (!cfg) return Response.json({ error: `Unknown provider: ${providerKey}` }, { status: 400 });

    const hfToken = secrets.get("HF_TOKEN");
    if (!hfToken) return Response.json({ error: "HF_TOKEN required — set it in Settings → Secrets" }, { status: 400 });

    const record = await base44.entities.GameCharacterAsset.get(assetId);
    if (!record) return Response.json({ error: "Asset record not found" }, { status: 404 });
    const imageUrl = record.reference_portrait_url;
    if (!imageUrl) return Response.json({ error: "No reference_portrait_url — upload a reference portrait first" }, { status: 400 });

    await base44.entities.GameCharacterAsset.update(assetId, {
      status: "generating",
      provider: providerKey,
      error_message: "",
      generation_task_id: "",
    });

    // 1. Validate the Space is up and its Gradio API is reachable.
    await validateSpace(cfg.host, hfToken);

    // 2. Download the reference image.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Reference image download failed (${imgRes.status})`);
    const imgBlob = await imgRes.blob();

    // 3. Upload to the Space's file API.
    const safeName = (record.name || "character").replace(/\s+/g, "_");
    const uploaded = await uploadFile(cfg.host, hfToken, imgBlob, `${safeName}.png`);

    // 4. Submit generation. Single-image input (most image-to-3D Spaces).
    const data = [
      {
        path: uploaded.path,
        url: uploaded.url,
        orig_name: uploaded.orig_name || `${safeName}.png`,
        meta: { _type: "gradio.FileData" },
      },
    ];
    const eventId = await submitCall(cfg.host, hfToken, cfg.apiName, data);

    // 5. Poll the SSE result (ZeroGPU can take 30–120s).
    const output = await pollResult(cfg.host, hfToken, cfg.apiName, eventId, 120000);

    // 6. Extract the 3D file from the output.
    const file = extract3DFile(cfg.host, output);
    if (!file) {
      await base44.entities.GameCharacterAsset.update(assetId, {
        status: "error",
        error_message: `${cfg.label} returned no downloadable 3D file. The Space output schema may have changed — inspect ${cfg.host}/gradio_api/info.`,
      });
      return Response.json({
        ok: false,
        error: "No 3D file in output",
        rawOutput: JSON.stringify(output).slice(0, 2000),
      });
    }

    // 7. Download + validate GLB magic header (credit-free server-side check).
    const glbRes = await fetch(file.url);
    if (!glbRes.ok) throw new Error(`GLB download failed (${glbRes.status})`);
    const glbBuf = await glbRes.arrayBuffer();
    let isGlb = false;
    if (glbBuf.byteLength >= 20) {
      const dv = new DataView(glbBuf);
      isGlb = dv.getUint32(0, true) === 0x46546c67; // "glTF"
    }
    const details = {
      glb: isGlb,
      sizeBytes: glbBuf.byteLength,
      checkedBy: "server",
      provider: cfg.label,
      origName: file.orig_name,
    };

    // 8. Attempt permanent Base44 storage (UploadFile). If credits are exhausted,
    //    keep the Space URL as a TEMP url only — model_3d_url stays empty so the
    //    arena spawn gate stays correctly BLOCKED until permanent storage exists.
    let permanentUrl = "";
    try {
      const glbFile = new File([glbBuf], `${safeName}.glb`, { type: "model/gltf-binary" });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file: glbFile });
      permanentUrl = up.file_url;
    } catch (e) {
      console.warn("[generate-character-3d-free] permanent storage failed (credits?):", e?.message || e);
    }

    if (permanentUrl) {
      await base44.entities.GameCharacterAsset.update(assetId, {
        model_3d_url: permanentUrl,
        generated_model_url: file.url,
        asset_type: "glb",
        status: "ready",
        validation_status: isGlb ? "valid" : "invalid",
        validation_details: JSON.stringify(details),
        generation_task_id: eventId,
        temp_model_expires_at: "",
        error_message: "",
        notes: `Generated via ${cfg.label} (Hugging Face Space).`,
      });
      return Response.json({
        ok: true,
        status: "ready",
        provider: cfg.label,
        permanentUrl,
        isGlb,
        sizeBytes: glbBuf.byteLength,
      });
    }

    // Permanent storage unavailable — store temp URL only, arena spawn stays blocked.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await base44.entities.GameCharacterAsset.update(assetId, {
      generated_model_url: file.url,
      temp_model_expires_at: expiresAt,
      status: "generated",
      validation_status: isGlb ? "valid" : "invalid",
      validation_details: JSON.stringify(details),
      generation_task_id: eventId,
      error_message:
        "GLB generated & validated, but permanent Base44 storage is unavailable (integration credits exhausted until 2026-09-01). Paste the temp URL into 'Set public GLB URL' to spawn credit-free, or wait for the reset.",
      notes: `Generated via ${cfg.label}. Temp URL on the HF Space (ephemeral).`,
    });
    return Response.json({
      ok: true,
      status: "generated",
      provider: cfg.label,
      tempUrl: file.url,
      isGlb,
      sizeBytes: glbBuf.byteLength,
      message: "Permanent storage blocked by credits — temp URL stored. Use the public-URL bypass to spawn.",
    });
  } catch (error) {
    console.error("[generate-character-3d-free] fatal:", error?.message || error);
    if (base44 && assetId) {
      try {
        await base44.entities.GameCharacterAsset.update(assetId, {
          status: "error",
          error_message: String(error?.message || error).slice(0, 500),
        });
      } catch {
        /* non-critical */
      }
    }
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}