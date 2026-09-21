// Generic Hugging Face Spaces (Gradio) client for free image-to-3D providers.
// Used by base44/functions/generate-character-3d-free.
// All providers run on ZeroGPU — free but quota-limited (~5 min/day per HF account).
// Auth: HF_TOKEN (server-side only).

// Registry of free image-to-3D HF Spaces. apiName is the Gradio endpoint path
// under /gradio_api/call/<apiName>. If a Space changes its endpoint, the function
// will surface a clear error so the apiName can be corrected here.
export const HF_PROVIDERS = {
  trellis: {
    label: "Microsoft TRELLIS.2",
    host: "https://microsoft-trellis-2.hf.space",
    apiName: "v2/predict",
    notes: "Primary. MIT license. Textured GLB export.",
  },
  hunyuan: {
    label: "Tencent Hunyuan3D-2.1",
    host: "https://tencent-hunyuan3d-2-1.hf.space",
    apiName: "predict",
    notes: "Territory-limited community license — verify before commercial use.",
  },
  stable_fast_3d: {
    label: "Stable Fast 3D",
    host: "https://dylanebert-stable-fast-3d.hf.space",
    apiName: "predict",
    notes: "Stability Community License (<$1M revenue). Game-oriented UV/materials.",
  },
  instantmesh: {
    label: "InstantMesh (Huawei Noah)",
    host: "https://huawei-noah-instantmesh.hf.space",
    apiName: "predict",
    notes: "Open-source, 4-view reconstruction.",
  },
  triposr: {
    label: "TripoSR (Stability)",
    host: "https://stabilityai-triposr.hf.space",
    apiName: "predict",
    notes: "Fast single-image-to-3D.",
  },
  wonder3d: {
    label: "Wonder3D",
    host: "https://wwwgao-wonder3d.hf.space",
    apiName: "predict",
    notes: "Multi-view diffusion + reconstruction.",
  },
  openlrm: {
    label: "OpenLRM",
    host: "https://wwwgao-openlrm.hf.space",
    apiName: "predict",
    notes: "Open Large Reconstruction Model.",
  },
  crm: {
    label: "CRM (Convolutional Recon. Model)",
    host: "https://judystone-crm.hf.space",
    apiName: "predict",
    notes: "Single-image to textured mesh.",
  },
  step1x: {
    label: "Step1X-3D",
    host: "https://step1x-3d-step1x-3d.hf.space",
    apiName: "predict",
    notes: "Step1X-3D diffusion pipeline.",
  },
  unique3d: {
    label: "Unique3D",
    host: "https://wuqikai-unique3d.hf.space",
    apiName: "predict",
    notes: "High-fidelity multi-view 3D.",
  },
};

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// Validate the Space is up and its Gradio API is reachable (catches renamed endpoints).
export async function validateSpace(host, token) {
  const res = await fetch(`${host}/gradio_api/info`, { headers: authHeaders(token) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Space ${host} unreachable (HTTP ${res.status}). ${t.slice(0, 200)}`);
  }
  return true;
}

// Upload an image blob to the Space's Gradio file API. Returns a FileData {path,url,orig_name,...}.
export async function uploadFile(host, token, blob, filename) {
  const form = new FormData();
  form.append("files", blob, filename);
  const res = await fetch(`${host}/gradio_api/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HF upload failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr[0]) throw new Error("HF upload returned an invalid response");
  return arr[0];
}

// Submit a generation job. Returns event_id.
export async function submitCall(host, token, apiName, data) {
  const res = await fetch(`${host}/gradio_api/call/${apiName}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HF submit to "${apiName}" failed (HTTP ${res.status}). The Space may have renamed its endpoint — check ${host}/gradio_api/info. ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.event_id) throw new Error(`HF submit returned no event_id: ${JSON.stringify(json).slice(0, 200)}`);
  return json.event_id;
}

// Poll the SSE result stream until complete. Returns the parsed output (Gradio data array).
export async function pollResult(host, token, apiName, eventId, timeoutMs = 120000) {
  const url = `${host}/gradio_api/call/${apiName}/${eventId}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    let res;
    try {
      res = await fetch(url, { headers: authHeaders(token), signal: ctrl.signal });
    } catch {
      clearTimeout(to);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    } finally {
      clearTimeout(to);
    }
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const text = await res.text();
    const lines = text.split("\n");
    let pendingComplete = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("event:")) {
        const evt = line.replace(/^event:\s*/, "").trim();
        if (evt === "complete") pendingComplete = true;
        if (evt === "error") {
          const dl = lines.slice(i + 1).find((l) => l.startsWith("data:")) || "";
          throw new Error(`HF Space error: ${dl.replace(/^data:\s*/, "").slice(0, 300)}`);
        }
      } else if (line.startsWith("data:") && pendingComplete) {
        const raw = line.replace(/^data:\s*/, "").trim();
        if (!raw) continue;
        try {
          return JSON.parse(raw);
        } catch {
          /* not json, keep scanning */
        }
      }
    }
    if (pendingComplete) return text; // completed but non-JSON; caller inspects
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("HF generation timed out — ZeroGPU daily quota may be exhausted or the queue is long. Retry later.");
}

// Recursively collect Gradio FileData objects from an output tree.
function collectFileData(node, acc) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) collectFileData(n, acc);
    return;
  }
  if (typeof node === "object") {
    if (node.path && (node.meta?._type === "gradio.FileData" || node.url)) {
      acc.push(node);
    }
    for (const k of Object.keys(node)) collectFileData(node[k], acc);
  }
}

// From the completed Gradio output, find the best 3D file (prefer .glb).
export function extract3DFile(host, output) {
  const files = [];
  collectFileData(output, files);
  if (!files.length) return null;
  const prefer =
    files.find((f) => (f.orig_name || f.path || "").toLowerCase().endsWith(".glb")) ||
    files.find((f) => (f.orig_name || f.path || "").toLowerCase().endsWith(".gltf")) ||
    files[0];
  const path = prefer.path || "";
  const url = prefer.url || `${host}/gradio_api/file=${encodeURIComponent(path)}`;
  return { url, path, orig_name: prefer.orig_name || "" };
}