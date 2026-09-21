import { findOfficialEmailCached, sendDirectEmail, esc } from "./officialEmailSearch.ts";

// Direct delivery: email each curator (music / movie / video content creator)
// that a submission has been routed to. The curator's on-file email is used
// first; when there is none on file, a live web search finds their official
// contact / submission email (cached, saved back on the curator record, max
// 3 fresh searches per call). Sent through the app's own email channel
// (Brevo/Resend). Never throws — delivery is logged per recipient. Callers
// should not block the user-facing response on this — wrap in waitUntil()
// or fire-and-forget.
//
// submissions: CuratorSubmission records (need curator_id, artist_name,
// song_title, genre, audio_url, id). Curator email is looked up per submission.
export async function notifyCuratorsOfSubmission(base44: any, submissions: any[]) {
  const results: any[] = [];
  if (!Array.isArray(submissions) || !submissions.length) return results;
  let searched = 0;

  for (const s of submissions) {
    if (!s || !s.curator_id) continue;
    try {
      const curator: any = await base44.asServiceRole.entities.Curator.get(s.curator_id).catch(() => null);
      let to = (curator?.email || "").trim();
      if (!to && curator && searched < 3) {
        searched++;
        const found = await findOfficialEmailCached(
          base44,
          `curator:${curator.id}`,
          `the official submission contact email address of ${curator.name}, a ${curator.platform || "music"} curator`
        ).catch(() => null);
        if (found?.email) {
          to = found.email;
          await base44.asServiceRole.entities.Curator.update(curator.id, { email: to }).catch(() => {});
        }
      }
      if (!to) {
        results.push({ curator_id: s.curator_id, ok: false, reason: "no email on file" });
        continue;
      }

      const subject = `New submission routed to you — "${s.song_title || "Untitled"}" via RIDE X`;
      const lines = [
        `Hi ${curator?.name || "there"},`,
        ``,
        `A new submission has been routed to you through the RIDE X Curator Program.`,
        ``,
        `Artist: ${s.artist_name || "—"}`,
        `Title: ${s.song_title || "—"}`,
        s.genre ? `Genre: ${s.genre}` : null,
        s.audio_url ? `Listen: ${s.audio_url}` : null,
        ``,
        `Submission ID: ${s.id || "—"}`,
        `Routed: ${new Date().toISOString()}`,
        ``,
        `To accept or decline, reply to this email or log the outcome in your RIDE X curator portal.`,
        ``,
        `— RIDE X Curator Program`,
      ].filter(Boolean).join("\n");
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto"><div style="padding:18px 20px;font-size:14px;line-height:1.6">${esc(lines).replace(/\n/g, "<br>")}</div></body></html>`;

      const _e = await sendDirectEmail({ to, subject, body: html, from_name: "RIDE X Curator Program" });
      if (!_e.ok) throw new Error(_e.error || "email failed");
      results.push({ curator_id: s.curator_id, ok: true });
    } catch (e: any) {
      results.push({ curator_id: s.curator_id, ok: false, error: e?.message || String(e) });
    }
  }

  return results;
}