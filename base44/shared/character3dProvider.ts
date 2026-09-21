// === Image-to-3D Provider Adapter ===
// Shared by the generate-character-3d and character-3d-status backend functions.
// Keeps provider-specific request/response shapes in one place so the game code
// never embeds provider logic and never sees the API keys (keys are passed in
// by the calling function, which reads them from base44:runtime secrets).
//
// Supported providers:
//   - meshy : https://api.meshy.ai/openapi/v1/image-to-3d  (needs MESHY_API_KEY)
//   - tripo : v3 primary (openapi.tripo3d.ai/v3) + v2 fallback (api.tripo3d.ai/v2)
//
// Tripo uses the game-ready P1-20260311 model (low-poly, textured, PBR) so the
// output GLB is suitable for real-time Three.js rendering in the browser.
//
// Normalized result shape:
//   submitGeneration(provider, imageUrl, key) -> { ok, taskId, rawStatus, error }
//   pollGeneration(provider, taskId, key) ->
//     { ok, status: "queued"|"generating"|"succeeded"|"failed",
//       modelUrl, progress, error }

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";
const TRIPO_V3 = "https://openapi.tripo3d.ai/v3";
const TRIPO_V2 = "https://api.tripo3d.ai/v2/openapi";

async function submitGeneration(provider, imageUrl, key) {
  if (provider === "meshy") return meshySubmit(imageUrl, key);
  if (provider === "tripo") return tripoSubmit(imageUrl, key);
  return { ok: false, error: "UNKNOWN_PROVIDER" };
}

async function pollGeneration(provider, taskId, key) {
  if (provider === "meshy") return meshyPoll(taskId, key);
  if (provider === "tripo") return tripoPoll(taskId, key);
  return { ok: false, error: "UNKNOWN_PROVIDER" };
}

// ---- Meshy ----
async function meshySubmit(imageUrl, key) {
  try {
    const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        target_formats: ["glb"],
        pose_mode: "a-pose",
        should_texture: true,
        enable_pbr: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || data?.message || `Meshy submit failed (${res.status})` };
    const taskId = data.id || data.task_id || data.result;
    if (!taskId) return { ok: false, error: "Meshy returned no task id" };
    return { ok: true, taskId: String(taskId), rawStatus: data.status || "IN_PROGRESS" };
  } catch (e) {
    return { ok: false, error: `Meshy submit error: ${e.message}` };
  }
}

async function meshyPoll(taskId, key) {
  try {
    const res = await fetch(`${MESHY_BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || data?.message || `Meshy poll failed (${res.status})` };
    const st = (data.status || "").toUpperCase();
    const progress = typeof data.progress === "number" ? data.progress : null;
    if (st === "SUCCEEDED") {
      const modelUrl = (data.model_urls && (data.model_urls.glb || data.model_urls["glb-pbr"])) || data.model_url || data.glb_url;
      if (!modelUrl) return { ok: false, status: "failed", error: "Meshy succeeded but returned no model URL" };
      return { ok: true, status: "succeeded", modelUrl, progress: 100 };
    }
    if (st === "FAILED") return { ok: true, status: "failed", error: data?.error?.message || "Meshy generation failed" };
    return { ok: true, status: "generating", progress };
  } catch (e) {
    return { ok: false, error: `Meshy poll error: ${e.message}` };
  }
}

// ---- Tripo (v3 primary, v2 fallback) ----
// Game-ready params: model_version P1-20260311 (low-poly, mobile/game friendly),
// face_limit 5000, texture + pbr on. The file object accepts a direct `url`
// (per platform.tripo3d.ai/docs/generation) so no separate upload step is needed.
async function tripoSubmit(imageUrl, key) {
  const body = JSON.stringify({
    type: "image_to_model",
    model_version: "P1-20260311",
    file: { type: "jpg", url: imageUrl },
    face_limit: 5000,
    texture: true,
    pbr: true,
  });
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // Try v3 first.
  try {
    const res = await fetch(`${TRIPO_V3}/generation/image-to-model`, {
      method: "POST", headers, body,
    });
    const data = await res.json();
    if (res.ok && data?.code === 0 && data?.data?.task_id) {
      return { ok: true, taskId: String(data.data.task_id), rawStatus: "queued", version: "v3" };
    }
    // If v3 rejected the request, fall through to v2.
  } catch (e) {
    // network error on v3 — fall through to v2
  }

  // v2 fallback.
  try {
    const res = await fetch(`${TRIPO_V2}/task`, {
      method: "POST", headers, body,
    });
    const data = await res.json();
    if (!res.ok || data?.code !== 0) {
      return { ok: false, error: data?.message || data?.error?.message || `Tripo submit failed (${res.status})` };
    }
    const taskId = data?.data?.task_id;
    if (!taskId) return { ok: false, error: "Tripo returned no task id" };
    return { ok: true, taskId: String(taskId), rawStatus: "queued", version: "v2" };
  } catch (e) {
    return { ok: false, error: `Tripo submit error: ${e.message}` };
  }
}

async function tripoPoll(taskId, key) {
  const headers = { Authorization: `Bearer ${key}` };

  // Try v3 first.
  try {
    const res = await fetch(`${TRIPO_V3}/tasks/${taskId}`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data?.code === 0 && data?.data) {
        return normalizeTripo(data.data);
      }
    }
  } catch (e) {
    // fall through to v2
  }

  // v2 fallback.
  try {
    const res = await fetch(`${TRIPO_V2}/task/${taskId}`, { headers });
    const data = await res.json();
    if (!res.ok || data?.code !== 0) {
      return { ok: false, error: data?.message || data?.error?.message || `Tripo poll failed (${res.status})` };
    }
    return normalizeTripo(data.data);
  } catch (e) {
    return { ok: false, error: `Tripo poll error: ${e.message}` };
  }
}

function normalizeTripo(d) {
  const st = (d?.status || "").toLowerCase();
  const progress = typeof d?.progress === "number" ? d.progress : null;
  if (st === "success" || st === "succeeded") {
    const modelUrl = d?.output?.model_url || d?.output?.model || d?.output?.glb;
    if (!modelUrl) return { ok: false, status: "failed", error: "Tripo succeeded but returned no model URL" };
    return { ok: true, status: "succeeded", modelUrl, progress: 100 };
  }
  if (st === "failed" || st === "error" || st === "cancelled") {
    return { ok: true, status: "failed", error: "Tripo generation failed" };
  }
  return { ok: true, status: st === "queued" ? "queued" : "generating", progress };
}

export { submitGeneration, pollGeneration };