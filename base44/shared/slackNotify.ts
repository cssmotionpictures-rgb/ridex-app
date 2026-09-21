import { secrets } from "base44:runtime";

// Shared Slack alert — posts to the "RIDE X Notifications" incoming webhook
// (SLACK_CRIXCOIN_WEBHOOK secret). Non-blocking by design: it NEVER throws;
// a missing or failed webhook is reported in the returned result so every
// caller can fire the alert and forget it. The webhook value is created and
// controlled by the founder at api.slack.com/apps — never logged, never returned.
export async function sendSlackAlert(alert: {
  title?: string;
  message?: string;
  fields?: { label: string; value?: string | number }[];
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const url = String(secrets.get("SLACK_CRIXCOIN_WEBHOOK") || "").trim();
    if (!url) return { sent: false, reason: "webhook not configured yet" };
    const lines: string[] = [String(alert.title || "RIDE X alert")];
    if (alert.message) lines.push(String(alert.message));
    for (const f of alert.fields || []) {
      if (f && f.label) lines.push("• " + f.label + ": " + (f.value !== undefined && f.value !== null ? f.value : "—"));
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
    if (!res.ok) return { sent: false, reason: "slack returned HTTP " + res.status };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: String((e && e.message) || e).slice(0, 120) };
  }
}