import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { pollGeneration } from "../../shared/character3dProvider.ts";

// POST /functions/character-3d-status
// Admin-only. Polls the image-to-3D provider. On success, performs a CREDIT-FREE
// server-side validation of the returned GLB (fetch + glTF magic-header check +
// size), then stores the TEMPORARY provider URL in generated_model_url with an
// expiry timestamp. It does NOT write model_3d_url (the permanent slot) — that
// stays empty until Base44 storage (UploadFile) is available, so the arena
// spawn gate stays correctly BLOCKED. status = "generated" (temp valid), not
// "ready" (which requires permanent storage).
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
    if (!record.provider || !record.generation_task_id)
      return Response.json({ error: "No generation in progress for this asset" }, { status: 400 });

    const keyName = record.provider === "meshy" ? "MESHY_API_KEY" : "TRIPO_API_KEY";
    const key = secrets.get(keyName);
    if (!key) return Response.json({ error: `${keyName} required — set it in Settings → Secrets` }, { status: 400 });

    const result = await pollGeneration(record.provider, record.generation_task_id, key);
    if (!result.ok) {
      await base44.entities.GameCharacterAsset.update(assetId, { status: "error", error_message: result.error });
      console.error("[character-3d-status] poll failed:", result.error);
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }

    if (result.status === "succeeded" && result.modelUrl) {
      // Credit-free server-side GLB validation: fetch bytes, check glTF magic header.
      const v = await validateGlb(result.modelUrl);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const details = {
        glb: v.ok,
        sizeBytes: v.sizeBytes,
        fullBody: "pending",
        mesh: "pending",
        materials: "pending",
        textures: "pending",
        grounded: "pending",
        scale: "pending",
        animations: "pending",
        checkedBy: "server",
      };
      await base44.entities.GameCharacterAsset.update(assetId, {
        generated_model_url: result.modelUrl,
        temp_model_expires_at: expiresAt,
        status: "generated",
        validation_status: v.ok ? "valid" : "invalid",
        validation_details: JSON.stringify(details),
        error_message: v.ok ? "" : v.error,
      });
      return Response.json({
        ok: true, status: "succeeded", modelUrl: result.modelUrl, expiresAt,
        validation: { glb: v.ok, sizeBytes: v.sizeBytes },
        recordStatus: "generated",
        permanentStorage: "WAITING_FOR_STORAGE_ACCESS",
      });
    }

    if (result.status === "failed") {
      await base44.entities.GameCharacterAsset.update(assetId, { status: "error", error_message: result.error || "Generation failed" });
      return Response.json({ ok: true, status: "failed", error: result.error || "Generation failed" });
    }

    return Response.json({ ok: true, status: "generating", progress: typeof result.progress === "number" ? result.progress : null });
  } catch (error) {
    console.error("[character-3d-status] fatal:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

// Fetch the GLB and verify the glTF binary magic header (0x46546C67 = "glTF").
// No integration credits used — plain fetch + byte read. Caps at 60MB.
async function validateGlb(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `GLB fetch failed (${res.status})` };
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 20) return { ok: false, error: "GLB too small", sizeBytes: buf.byteLength };
    if (buf.byteLength > 60 * 1024 * 1024) return { ok: false, error: "GLB exceeds 60MB cap", sizeBytes: buf.byteLength };
    const dv = new DataView(buf);
    const magic = dv.getUint32(0, true);
    if (magic !== 0x46546c67) return { ok: false, error: "Not a glTF binary (bad magic header)", sizeBytes: buf.byteLength };
    return { ok: true, sizeBytes: buf.byteLength };
  } catch (e) {
    return { ok: false, error: `GLB validation error: ${e.message}` };
  }
}