// Official contact-email search + direct delivery — shared by every outbound
// submission flow (lenders, influencers, talent, curators, tickets).
//
// The recipient's real, official email is found by LIVE WEB SEARCH:
//   1) Gemini grounded search (google_search tool) — free key; when its
//      quota is exhausted it falls straight through.
//   2) Groq compound web-search model — visits the official site itself and
//      answers with the address it actually found there.
// Every result is cached in AutomationSetting.contact_email_cache so each
// subject is searched once, ever. Delivery goes through emailProxy
// (Brevo/Resend) — zero Base44 integration credits, reaches any address.

import { emailProxy } from "./emailProxy.ts";

export interface OfficialEmail {
  email: string;
  website?: string | null;
  cached?: boolean;
}

const GEMINI_SEARCH_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const GROQ_COMPOUND = "groq/compound-mini";

function getEnv(name: string): string | undefined {
  try {
    if (typeof (globalThis as any).Deno !== "undefined") return (globalThis as any).Deno.env.get(name);
  } catch {}
  try {
    return (process as any)?.env?.[name];
  } catch {}
  return undefined;
}

export function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

export function extractOfficialEmail(text: string): OfficialEmail | null {
  if (!text) return null;
  let email: string | null = null;
  let website: string | null = null;
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const j = JSON.parse(jsonMatch[0]);
      email = j?.email || null;
      website = j?.website || null;
    } catch {}
  }
  if (!email) {
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
    if (m) email = m[0];
  }
  if (
    email &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    !/example\.|your?email|@test|sentry\.io|wixpress|no-?reply/i.test(email)
  ) {
    return { email: email.toLowerCase().trim(), website };
  }
  return null;
}

function searchPrompt(query: string): string {
  return (
    `Search the web for ${query}. Only accept an email address published on the person or company's own official website or a verified official channel. ` +
    `Reply with ONLY a JSON object: {"email": "the email address or null", "website": "the official website where you found it or null"}.`
  );
}

async function searchGemini(key: string, prompt: string): Promise<OfficialEmail | null> {
  for (const model of GEMINI_SEARCH_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0 },
          }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (res.status === 429 || res.status === 404 || res.status === 403) continue;
      if (!res.ok) {
        console.error("[officialEmailSearch] gemini", model, res.status, (await res.text()).slice(0, 160));
        continue;
      }
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join(" ");
      const hit = extractOfficialEmail(text);
      if (hit) return hit;
    } catch (e: any) {
      console.error("[officialEmailSearch] gemini failed", model, e?.message);
    }
  }
  return null;
}

async function searchGroqCompound(key: string, prompt: string): Promise<OfficialEmail | null> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_COMPOUND, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      console.error("[officialEmailSearch] groq", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    return extractOfficialEmail(data?.choices?.[0]?.message?.content || "");
  } catch (e: any) {
    console.error("[officialEmailSearch] groq failed", e?.message);
    return null;
  }
}

export async function searchOfficialEmail(query: string): Promise<OfficialEmail | null> {
  const prompt = searchPrompt(query);
  const geminiKey = getEnv("GEMINI_API_KEY");
  if (geminiKey) {
    const hit = await searchGemini(geminiKey, prompt);
    if (hit) return hit;
  }
  const groqKey = getEnv("GROQ_API_KEY");
  if (groqKey) {
    const hit = await searchGroqCompound(groqKey, prompt);
    if (hit) return hit;
  }
  return null;
}

// --- shared cache (AutomationSetting.contact_email_cache) ---

async function readCacheMap(base44: any) {
  const rows = await base44.asServiceRole.entities.AutomationSetting.filter({ name: "global" }).catch(() => []);
  const row = rows?.[0];
  let map: any = {};
  try {
    map = row?.contact_email_cache ? JSON.parse(row.contact_email_cache) : {};
  } catch {
    map = {};
  }
  return { row, map };
}

export async function findOfficialEmailCached(
  base44: any,
  key: string,
  query: string
): Promise<OfficialEmail | null> {
  try {
    const { map } = await readCacheMap(base44);
    const hit = map?.[key];
    if (hit?.email) return { ...(hit as OfficialEmail), cached: true };
  } catch {}
  const found = await searchOfficialEmail(query);
  if (!found) return null;
  try {
    const { row, map } = await readCacheMap(base44);
    map[key] = found;
    const payload = { contact_email_cache: JSON.stringify(map) };
    if (row?.id) await base44.asServiceRole.entities.AutomationSetting.update(row.id, payload);
    else await base44.asServiceRole.entities.AutomationSetting.create({ name: "global", ...payload });
  } catch (e: any) {
    console.error("[officialEmailSearch] cache write failed", e?.message);
  }
  return { ...found, cached: false };
}

// Direct delivery through the app's own email channel (Brevo primary, Resend
// fallback) with one retry on failure.
export async function sendDirectEmail(opts: {
  to: string;
  subject: string;
  body: string;
  from_name?: string;
}): Promise<{ ok: boolean; bypassed?: string; error?: string }> {
  let result = await emailProxy(opts);
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, 2000));
    result = await emailProxy(opts);
  }
  return result;
}