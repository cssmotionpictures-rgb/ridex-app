// LLM proxy — thin HTTP wrapper around the shared direct-to-OpenAI helper.
// Bypasses Base44's metered InvokeLLM integration entirely.
import { llmProxy } from "../../shared/llmProxy.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = (body.prompt || "").toString().trim();
    if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });

    const result = await llmProxy({
      prompt,
      system: body.system,
      model: body.model,
      response_json_schema: body.response_json_schema || null,
    });

    return Response.json(result);
  } catch (e: any) {
    console.error("[llm-proxy]", e?.message);
    return Response.json({ error: e?.message || "proxy error" }, { status: 500 });
  }
}