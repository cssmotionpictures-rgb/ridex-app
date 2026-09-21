// Email proxy — thin HTTP wrapper around the shared direct-to-Resend helper.
// Bypasses Base44's metered SendEmail integration entirely.
import { emailProxy } from "../../shared/emailProxy.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.to || !body.subject || !body.body) {
      return Response.json({ error: "to, subject and body are required" }, { status: 400 });
    }
    const result = await emailProxy({
      to: body.to,
      subject: body.subject,
      body: body.body,
      from_name: body.from_name,
    });
    return Response.json(result);
  } catch (e: any) {
    console.error("[email-proxy]", e?.message);
    return Response.json({ error: e?.message || "proxy error" }, { status: 500 });
  }
}