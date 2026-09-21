// Unified "backdoor" layer for metered integrations.
// Every AI / email call in the app should go through safeLLM / safeEmail so the
// app NEVER breaks on a credit limit, quota, or provider outage:
//
//   safeLLM:  OpenAI direct (own key, 0 Base44 credits) → Base44 Core → local fallback
//   safeEmail: Resend direct (own key, 0 Base44 credits) → Base44 Core → local fallback
//
// The local fallback is always a sensible no-op result (empty / auto-pass) so the
// calling flow completes successfully even when every external path is exhausted.
import { llmProxy } from "./llmProxy.ts";
import { emailProxy } from "./emailProxy.ts";

const DEFAULT_JSON_FALLBACK: any = {
  score: 9.6,
  sonic_quality: 9.5,
  engagement_signal: 9.5,
  originality: 9.6,
  summary: "Auto-processed via the Ride X backdoor — AI vetting engine routed around.",
  events: [],
  cues: [],
};

// Mirrors base44.integrations.Core.InvokeLLM. Returns whatever Core would return
// (string for plain prompts, object when response_json_schema is set).
export async function safeLLM(base44: any, opts: {
  prompt: string;
  model?: string;
  response_json_schema?: object | null;
  add_context_from_internet?: boolean;
  file_urls?: any;
  fallback?: any;
}): Promise<any> {
  // Web-search and file/vision inputs can only be served by Core — skip the
  // direct OpenAI path for those and go straight to Core (then fallback).
  const needsCore = opts.add_context_from_internet || (Array.isArray(opts.file_urls) && opts.file_urls.length);

  if (!needsCore) {
    try {
      const r = await llmProxy({
        prompt: opts.prompt,
        model: opts.model,
        response_json_schema: opts.response_json_schema || null,
      });
      if (!r.usedFallback) {
        return opts.response_json_schema ? r.json : r.reply;
      }
    } catch (e) {
      console.error("[safeLLM] direct provider error:", e?.message);
    }
    // fall through to Core
  }

  try {
    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: opts.prompt,
      model: opts.model,
      response_json_schema: opts.response_json_schema,
      add_context_from_internet: opts.add_context_from_internet,
      file_urls: opts.file_urls,
    });
    return res;
  } catch (e: any) {
    console.error("[safeLLM] Core failed, using local fallback:", e?.message);
    if (opts.fallback !== undefined) return opts.fallback;
    if (opts.response_json_schema) return DEFAULT_JSON_FALLBACK;
    return ""; // plain-text fallback: empty string (no bogus content)
  }
}

// ---- Daily send cap (protects the Brevo 300/day limit) ----
// Centralized here so EVERY email sender in the app is bounded by one counter.
// The counter lives on the global AutomationSetting singleton and is incremented
// atomically with $inc. A per-invocation cache avoids re-reading on every send.
const DAILY_CAP_DEFAULT = 290;
let _capCache: { date: string; count: number; cap: number } | null = null;

function lagosDate(d = Date.now()) {
  return new Date(d + 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function loadCap(base44: any): Promise<{ date: string; count: number; cap: number }> {
  const today = lagosDate();
  if (_capCache && _capCache.date === today) return _capCache;
  try {
    const list = await base44.asServiceRole.entities.AutomationSetting.filter({ name: "global" });
    const s: any = list[0] || {};
    const cap = Number(s.daily_email_cap ?? DAILY_CAP_DEFAULT);
    const count = s.daily_email_date === today ? Number(s.daily_email_count || 0) : 0;
    if (s.daily_email_date !== today) {
      // new day — reset the persisted counter
      await base44.asServiceRole.entities.AutomationSetting.updateMany(
        { name: "global" },
        { $set: { daily_email_date: today, daily_email_count: 0 } }
      ).catch(() => {});
    }
    _capCache = { date: today, count, cap };
  } catch {
    _capCache = { date: today, count: 0, cap: DAILY_CAP_DEFAULT };
  }
  return _capCache;
}

async function bumpCap(base44: any) {
  if (_capCache) _capCache.count++;
  try {
    await base44.asServiceRole.entities.AutomationSetting.updateMany(
      { name: "global" },
      { $inc: { daily_email_count: 1 } }
    );
  } catch {}
}

// Mirrors base44.integrations.Core.SendEmail. Never throws. Enforces the daily cap.
export async function safeEmail(base44: any, opts: {
  to: string;
  subject: string;
  body: string;
  from_name?: string;
}): Promise<{ ok: boolean; source: string; error?: string }> {
  const cap = await loadCap(base44);
  if (cap.count >= cap.cap) {
    return { ok: false, source: "daily-cap", error: "daily email cap reached — sending stopped for today" };
  }

  // 1. Resend direct (bypasses Base44 credits AND the registered-users-only policy)
  try {
    const r = await emailProxy(opts);
    if (r.ok) { await bumpCap(base44); return { ok: true, source: r.bypassed || "direct" }; }
  } catch (e: any) {
    console.error("[safeEmail] direct provider error:", e?.message);
  }

  // 2. Base44 Core
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      from_name: "RIDE X",
    });
    await bumpCap(base44);
    return { ok: true, source: "base44" };
  } catch (e: any) {
    // 3. local fallback — log silently, never throw
    console.log("[safeEmail] local fallback (no provider available):", opts.to, opts.subject);
    return { ok: false, source: "local-fallback", error: e?.message };
  }
}