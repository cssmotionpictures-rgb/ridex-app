import { base44 } from "@/api/base44Client";

/**
 * Keyless, in-browser image generation.
 *
 * Primary: Base44 Core GenerateImage (permanent storage) — resumes
 * automatically when integration credits reset (2026-09-01).
 * Fallback: Pollinations image API — keyless, CORS-friendly, no signup.
 *   Returns a direct image URL that loads in <img>/<Image>; ~1 req / 15s
 *   anonymous rate limit, on-demand generation takes 5–15s.
 *
 * Always returns { url, provider } so callers can use it identically.
 */
export async function generateImageClient(prompt, { width = 768, height = 1152, seed } = {}) {
  // Try Core first (permanent storage; works again on reset)
  try {
    const res = await base44.integrations.Core.GenerateImage({ prompt });
    const url = res?.url || res?.file_url;
    if (url) return { url, provider: "base44" };
  } catch {}

  // Fallback: Pollinations keyless image URL
  const s = seed ?? Math.floor(Math.random() * 1e6);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?width=${width}&height=${height}&nologo=true&seed=${s}`;
  return { url, provider: "pollinations" };
}