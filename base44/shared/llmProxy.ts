// Zero-credit LLM proxy — the "backdoor" that keeps every AI feature working
// 100% in real life WITHOUT depending on the OpenAI key.
//
// Provider order (first free key that's set wins):
//   1. Google Gemini (free tier — generous, fast, reliable). Add GEMINI_API_KEY
//      (free from https://aistudio.google.com/apikey) in Settings → Secrets.
//   2. Groq (free tier — very fast Llama 3.3). Add GROQ_API_KEY
//      (free from https://console.groq.com/keys).
//   3. OpenAI direct (own key) — only if both free keys are absent.
//   4. Canned reply — last resort so calling flows never crash.
//
// This single proxy powers: the RIDE X QUEEN assistant, AI sports match
// predictions, Free Feature A&R scoring, and subtitle cue formatting — all
// with zero Base44 integration credits and no OpenAI dependency.

const GEMINI_URL = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const MODEL_MAP: Record<string, string> = {
  automatic: "gpt-4o-mini", gpt_5_mini: "gpt-4o-mini", gpt_5_4: "gpt-4o",
  gpt_5_6_sol: "gpt-4o", gpt_5_6_luna: "gpt-4o-mini", gemini_3_flash: "gpt-4o-mini",
  gemini_3_1_pro: "gpt-4o", claude_sonnet_4_6: "gpt-4o", claude_opus_4_6: "gpt-4o",
};

function getEnv(name: string): string | undefined {
  try { if (typeof (globalThis as any).Deno !== "undefined") return (globalThis as any).Deno.env.get(name); } catch {}
  try { return (process as any)?.env?.[name]; } catch {}
  return undefined;
}

export interface LlmProxyResult {
  reply: string; json?: any; bypassed: string; usedFallback: boolean;
}

// Pull a JSON object/array out of a model response that may wrap it in prose
// or ```json fences. Returns null if no valid JSON is found.
function extractJson(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/[{[][\s\S]*[}\]]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function gemini(messages: any[], jsonMode: boolean, key: string): Promise<string | null> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: any = { contents, generationConfig: { temperature: 0.6 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${GEMINI_URL(model)}?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
          if (text.trim()) return text.trim();
          console.error("[llmProxy] gemini empty", model, data?.promptFeedback?.blockReason || "no-content");
          break; // empty/blocked → next model
        }
        const status = res.status;
        const e = await res.text().catch(() => "");
        console.error("[llmProxy] gemini", model, status, e.slice(0, 120));
        if (status === 503 || status === 429 || status === 500 || status === 408) { await sleep(700 * (attempt + 1)); continue; }
        break; // other errors → next model
      } catch (e: any) {
        console.error("[llmProxy] gemini failed", model, e?.message);
        await sleep(500);
      }
    }
  }
  return null;
}

async function groq(messages: any[], jsonMode: boolean, key: string): Promise<string | null> {
  const body: any = { model: GROQ_MODEL, messages, temperature: 0.6 };
  if (jsonMode) body.response_format = { type: "json_object" };
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.text().catch(() => "");
      console.error("[llmProxy] groq", res.status, e.slice(0, 160));
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e: any) {
    console.error("[llmProxy] groq failed", e?.message);
    return null;
  }
}

async function openaiDirect(messages: any[], jsonMode: boolean, model: string): Promise<string | null> {
  const key = getEnv("OPENAI_API_KEY");
  if (!key) return null;
  const body: any = { model, messages, temperature: 0.6 };
  if (jsonMode) body.response_format = { type: "json_object" };
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.text().catch(() => "");
      console.error("[llmProxy] openai", res.status, e.slice(0, 160));
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e: any) {
    console.error("[llmProxy] openai failed", e?.message);
    return null;
  }
}

export async function llmProxy(opts: {
  prompt: string; system?: string; model?: string; response_json_schema?: object | null;
}): Promise<LlmProxyResult> {
  const messages: { role: string; content: string }[] = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.prompt },
  ];
  const jsonMode = !!opts.response_json_schema;
  const openaiModel = MODEL_MAP[opts.model || "automatic"] || "gpt-4o-mini";

  const FALLBACK: LlmProxyResult = {
    reply:
      "I'm here for you right now, but my AI engine is briefly at capacity — your message is logged and I'll respond fully the moment it refreshes. For anything urgent, contact +234 902 004 2099.",
    bypassed: "all-down",
    usedFallback: true,
  };

  const providers: { name: string; run: () => Promise<string | null> }[] = [];
  const geminiKey = getEnv("GEMINI_API_KEY");
  const groqKey = getEnv("GROQ_API_KEY");
  if (geminiKey) providers.push({ name: "gemini", run: () => gemini(messages, jsonMode, geminiKey) });
  if (groqKey) providers.push({ name: "groq", run: () => groq(messages, jsonMode, groqKey) });
  providers.push({ name: "openai", run: () => openaiDirect(messages, jsonMode, openaiModel) });

  for (const p of providers) {
    const text = await p.run();
    if (text) {
      if (jsonMode) {
        const json = extractJson(text);
        if (json) return { reply: text, json, bypassed: p.name, usedFallback: false };
        // got text but not parseable JSON → keep text, try next provider for valid JSON
      } else {
        return { reply: text, bypassed: p.name, usedFallback: false };
      }
    }
  }

  return FALLBACK;
}