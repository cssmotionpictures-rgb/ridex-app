// Direct speech-to-text proxy — bypasses Base44's metered TranscribeAudio
// integration entirely.
//
// Provider order:
//   1. Deepgram (nova-2) — primary, high-accuracy real STT with DEEPGRAM_API_KEY.
//   2. Groq free Whisper (whisper-large-v3) — automatic fallback.
//   3. OpenAI Whisper — final fallback.
//
// Limit: providers accept files up to ~25MB. Larger media is left to the
// caller's fallback (a vision-capable LLM).

function getKey(name: string): string | undefined {
  try { if (typeof (globalThis as any).Deno !== "undefined") return (globalThis as any).Deno.env.get(name); } catch {}
  try { return (process as any)?.env?.[name]; } catch {}
  return undefined;
}

function contentTypeFor(url: string): string {
  const u = (url || "").toLowerCase().split("?")[0];
  if (u.endsWith(".mp3")) return "audio/mpeg";
  if (u.endsWith(".wav")) return "audio/wav";
  if (u.endsWith(".webm")) return "audio/webm";
  if (u.endsWith(".ogg") || u.endsWith(".oga")) return "audio/ogg";
  if (u.endsWith(".m4a") || u.endsWith(".mp4") || u.endsWith(".mpeg")) return "audio/mp4";
  if (u.endsWith(".flac")) return "audio/flac";
  return "audio/mp4"; // deepgram infers from content when it can
}

async function deepgramTranscribe(audioUrl: string, key: string): Promise<string> {
  // Send the public media URL to Deepgram and let it fetch the file itself.
  // This avoids loading large movies (360MB+) into the function's memory.
  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
  });
  const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`deepgram ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (!transcript || !String(transcript).trim()) throw new Error("deepgram returned empty transcript");
  return String(transcript).trim();
}

async function whisperTranscribe(audioUrl: string, endpoint: string, model: string, key: string): Promise<string> {
  const mediaRes = await fetch(audioUrl);
  if (!mediaRes.ok) throw new Error(`fetch media failed (${mediaRes.status})`);
  const blob = await mediaRes.blob();
  if (blob.size > 25 * 1024 * 1024) throw new Error("file too large for whisper (>25MB)");

  const form = new FormData();
  form.append("file", blob, "media.mp4");
  form.append("model", model);
  form.append("response_format", "text");

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`whisper ${r.status}: ${t.slice(0, 200)}`);
  }
  return (await r.text()).trim();
}

export async function whisperProxy(audioUrl: string): Promise<string> {
  // 1. Deepgram (primary)
  const deepgramKey = getKey("DEEPGRAM_API_KEY");
  if (deepgramKey) {
    try {
      return await deepgramTranscribe(audioUrl, deepgramKey);
    } catch (e: any) {
      console.error("[whisperProxy] deepgram failed, falling back:", e?.message);
    }
  }

  // 2. Groq free Whisper
  const groqKey = getKey("GROQ_API_KEY");
  if (groqKey) {
    try {
      return await whisperTranscribe(audioUrl, "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3", groqKey);
    } catch (e: any) {
      console.error("[whisperProxy] groq failed, falling back to OpenAI:", e?.message);
    }
  }

  // 3. OpenAI Whisper
  const openaiKey = getKey("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("No speech-to-text key set — add DEEPGRAM_API_KEY, GROQ_API_KEY (free), or OPENAI_API_KEY in Settings → Secrets");
  return await whisperTranscribe(audioUrl, "https://api.openai.com/v1/audio/transcriptions", "whisper-1", openaiKey);
}