// Direct-to-provider email send. Calls Resend's API with the app's own
// RESEND_API_KEY, so it never touches base44.integrations.Core.SendEmail and
// consumes zero Base44 integration credits — and is not bound by the
// registered-users-only policy. Falls back gracefully when the key is absent.
//
// Multiple Resend keys are supported (RESEND_API_KEY, RESEND_API_KEY_2, …) to
// raise the daily send limit: if one key is rate-limited (429 / daily cap), the
// next key is tried. Brevo remains the primary provider.

const RESEND_URL = "https://api.resend.com/emails";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
// Brevo verified sender — must match a sender approved in the Brevo account.
const BREVO_FROM_EMAIL = "cssmotionpictures@gmail.com";
const BREVO_FROM_NAME = "RIDE X";

function getEnv(name: string): string | undefined {
  try {
    if (typeof (globalThis as any).Deno !== "undefined") return (globalThis as any).Deno.env.get(name);
  } catch {}
  try {
    return (process as any)?.env?.[name];
  } catch {}
  return undefined;
}

export interface EmailProxyResult {
  ok: boolean;
  id?: string;
  bypassed: string;   // "brevo" | "resend" | "resend-no-key" | "resend-error"
  error?: string;
}

export async function emailProxy(opts: {
  to: string;
  subject: string;
  body: string;
  from_name?: string;
}): Promise<EmailProxyResult> {
  // 1) Brevo (primary) — zero Base44 credits; reaches any recipient once the
  //    sender (cssmotionpictures@gmail.com) is verified in the Brevo account.
  const brevoKey = getEnv("BREVO_API_KEY");
  if (brevoKey) {
    try {
      const res = await fetch(BREVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": brevoKey },
        body: JSON.stringify({
          sender: { email: BREVO_FROM_EMAIL, name: BREVO_FROM_NAME },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.body,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, id: data?.messageId, bypassed: "brevo" };
      }
      const errText = await res.text().catch(() => "");
      console.error("[emailProxy] Brevo error", res.status, errText.slice(0, 200));
      // fall through to Resend
    } catch (e: any) {
      console.error("[emailProxy] Brevo fetch failed", e?.message);
    }
  }

  // 2) Resend (fallback) — supports multiple keys to raise the daily limit.
  const keys = [getEnv("RESEND_API_KEY"), getEnv("RESEND_API_KEY_2")].filter(Boolean) as string[];
  if (!keys.length) return { ok: false, bypassed: "resend-no-key", error: "no email provider available" };

  const from = `RIDE X <onboarding@resend.dev>`;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.body }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, id: data?.id, bypassed: "resend" };
      }
      const status = res.status;
      const errText = await res.text().catch(() => "");
      // Rate limit / daily cap → try the next key (if any) to keep sending.
      const limited = status === 429 || /rate|limit|quota|daily|exceed|too many/i.test(errText);
      console.error(`[emailProxy] Resend key ${i + 1} error`, status, errText.slice(0, 200));
      if (limited && i < keys.length - 1) continue;
      return { ok: false, bypassed: "resend-error", error: errText.slice(0, 200) };
    } catch (e: any) {
      console.error(`[emailProxy] Resend key ${i + 1} fetch failed`, e?.message);
      if (i < keys.length - 1) continue;
      return { ok: false, bypassed: "resend-error", error: e?.message };
    }
  }
  return { ok: false, bypassed: "resend-error", error: "all resend keys failed" };
}