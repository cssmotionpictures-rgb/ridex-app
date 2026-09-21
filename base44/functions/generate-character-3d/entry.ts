import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { submitGeneration } from "../../shared/character3dProvider.ts";

// POST /functions/generate-character-3d
// Admin-only. Submits a reference portrait to an image-to-3D provider (Meshy or
// Tripo) server-side. The provider API key is read from base44 secrets and is
// NEVER sent to the browser. Stores the provider task id on the
// GameCharacterAsset record and sets status to "generating".
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { assetId, provider, referenceImageUrl } = body || {};
    if (!assetId) return Response.json({ error: "assetId required" }, { status: 400 });
    if (!["meshy", "tripo"].includes(provider))
      return Response.json({ error: "provider must be 'meshy' or 'tripo'" }, { status: 400 });

    const keyName = provider === "meshy" ? "MESHY_API_KEY" : "TRIPO_API_KEY";
    const key = secrets.get(keyName);
    if (!key)
      return Response.json({ error: `${keyName} required — set it in Settings → Secrets` }, { status: 400 });

    const record = await base44.entities.GameCharacterAsset.get(assetId);
    if (!record) return Response.json({ error: "Asset record not found" }, { status: 404 });

    const imageUrl = referenceImageUrl || record.reference_portrait_url;
    if (!imageUrl)
      return Response.json({ error: "Reference image required — upload a reference portrait first" }, { status: 400 });

    // mark as generating and clear prior error
    await base44.entities.GameCharacterAsset.update(assetId, {
      provider,
      status: "generating",
      error_message: "",
      generation_task_id: "",
      generated_model_url: "",
    });

    const result = await submitGeneration(provider, imageUrl, key);
    if (!result.ok) {
      await base44.entities.GameCharacterAsset.update(assetId, {
        status: "error",
        error_message: result.error,
      });
      console.error("[generate-character-3d] submit failed:", result.error);
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }

    await base44.entities.GameCharacterAsset.update(assetId, {
      generation_task_id: result.taskId,
    });

    return Response.json({ ok: true, provider, taskId: result.taskId, status: "generating" });
  } catch (error) {
    console.error("[generate-character-3d] fatal:", error?.message || error);
    return Response.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}