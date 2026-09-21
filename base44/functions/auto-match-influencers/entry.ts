import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findOfficialEmailCached, sendDirectEmail, esc } from "../../shared/officialEmailSearch.ts";

// Auto-Match Influencers — runs after an artist pays for a submission.
// Scores every approved influencer by genre/audience/engagement/past, creates
// InfluencerMatch records for the top N, marks the submission "matched", and
// DIRECTLY emails every matched influencer (on-file email → live web search,
// cached). Per-match DELIVERY STATUS is stored on each InfluencerMatch record
// so the Delivery Dashboard can show and retry failures. Also supports
// action:"resend" for manual re-delivery of a failed email.

function buildInfluencerEmail(submission: any, inf: any, score: number): string {
  const rowHtml = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;white-space:nowrap">${esc(label)}</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(value)}</td></tr>`;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto">
    <div style="background:#0d0d12;padding:16px 20px;border-radius:12px 12px 0 0">
      <p style="margin:0;color:#f7c948;font-weight:bold">RIDE X</p>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:12px">A new submission was matched to you</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 20px">
      <p style="font-size:15px;margin:0 0 4px">Hi ${esc(inf.full_name || inf.username)},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">A new ${esc(submission.type || "song")} submission was routed to you through the Ride X platform — it matched your audience at <strong>${score}%</strong>. The artist has already paid for this placement.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:14px">
        ${rowHtml("Artist", submission.artist_name || "—")}
        ${rowHtml("Title", submission.title)}
        ${submission.genre ? rowHtml("Genre", submission.genre) : ""}
        ${submission.description ? rowHtml("About", submission.description) : ""}
      </table>
      ${submission.audio_url ? `<p style="font-size:13px;margin:0 0 6px">Listen: <a href="${esc(submission.audio_url)}">${esc(submission.audio_url)}</a></p>` : ""}
      ${submission.video_url ? `<p style="font-size:13px;margin:0 0 6px">Watch: <a href="${esc(submission.video_url)}">${esc(submission.video_url)}</a></p>` : ""}
      <p style="font-size:12px;color:#6b7280;margin:14px 0 0">To accept this placement, reply to this email or log the outcome in your Ride X influencer dashboard.</p>
    </div>
  </body></html>`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // ---------- MANUAL RESEND (from the Delivery Dashboard) ----------
    if (body.action === 'resend' && body.match_id) {
      const match = await base44.asServiceRole.entities.InfluencerMatch.get(body.match_id).catch(() => null);
      if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });
      const inf = await base44.asServiceRole.entities.Influencer.get(match.influencer_id).catch(() => null);
      const submission = match.submission_id
        ? await base44.asServiceRole.entities.InfluencerSubmission.get(match.submission_id).catch(() => null)
        : null;
      if (!inf || !submission) {
        return Response.json({ error: 'Influencer or submission details unavailable' }, { status: 404 });
      }
      let to = (inf.email || '').trim();
      if (!to) {
        const found = await findOfficialEmailCached(
          base44,
          `influencer:${inf.id}`,
          `the official business contact email address of ${inf.full_name || inf.username}, a ${inf.platform || "social media"} influencer`
        ).catch(() => null);
        if (found?.email) {
          to = found.email;
          await base44.asServiceRole.entities.Influencer.update(inf.id, { email: to }).catch(() => {});
        }
      }
      if (!to) {
        const errMsg = 'No contact email on file or found by web search — add one on the influencer profile and retry';
        await base44.asServiceRole.entities.InfluencerMatch.update(match.id, { delivery_status: 'failed', delivery_error: errMsg });
        return Response.json({ ok: false, error: errMsg });
      }
      const res = await sendDirectEmail({
        to,
        subject: `New ${submission.type || "song"} submission for you — "${submission.title}" via RIDE X`,
        body: buildInfluencerEmail(submission, inf, match.match_score || 0),
        from_name: 'RIDE X',
      });
      const now = new Date().toISOString();
      if (res.ok) {
        await base44.asServiceRole.entities.InfluencerMatch.update(match.id, {
          delivery_status: 'sent', delivery_email: to, delivery_error: '', delivered_at: now, auto_notified: true,
        });
        return Response.json({ ok: true, email: to });
      }
      await base44.asServiceRole.entities.InfluencerMatch.update(match.id, {
        delivery_status: 'failed', delivery_email: to, delivery_error: (res.error || 'email failed').slice(0, 250),
      });
      return Response.json({ ok: false, error: res.error || 'email failed' });
    }

    const submissionId = body.submission_id;
    if (!submissionId) return Response.json({ error: 'submission_id required' }, { status: 400 });

    const submission = await base44.asServiceRole.entities.InfluencerSubmission.get(submissionId);
    if (!submission) return Response.json({ error: 'Submission not found' }, { status: 404 });

    const influencers = await base44.asServiceRole.entities.Influencer.filter({ verification_status: 'approved' });
    if (!influencers.length) {
      await base44.asServiceRole.entities.InfluencerSubmission.update(submissionId, { status: 'matched' });
      return Response.json({ matched: 0, reason: 'no influencers' });
    }

    const subGenres = (submission.genre || '').toLowerCase().split(/[,\s/]+/).map((g) => g.trim()).filter(Boolean);
    const targetTier = submission.target_tier && submission.target_tier !== 'any' ? submission.target_tier : null;

    // Hand-picked mode: the artist chose specific influencers — route directly to them.
    const pickedIds = Array.isArray(body.influencer_ids) ? body.influencer_ids.filter(Boolean) : [];
    let top;
    if (pickedIds.length) {
      const idSet = new Set(pickedIds);
      top = influencers
        .filter((inf) => idSet.has(inf.id))
        .map((inf) => ({ inf, score: 100 }));
    } else {
      const scored = influencers
        .filter((inf) => !targetTier || (inf.tier || 'nano') === targetTier)
        .map((inf) => {
          const infGenres = (inf.genres || '').toLowerCase().split(',').map((g) => g.trim()).filter(Boolean);
          let genreScore = 30;
          if (!infGenres.length || !subGenres.length) genreScore = 80;
          else if (infGenres.some((g) => subGenres.some((s) => s === g))) genreScore = 100;
          else if (infGenres.some((g) => subGenres.some((s) => s.includes(g) || g.includes(s)))) genreScore = 70;
          const audience = Math.min(100, Math.log10((inf.follower_count || 1) + 1) * 30);
          const engagement = Math.min(100, (inf.engagement_rate || 2) * 10);
          const past = 50;
          const score = Math.round(genreScore * 0.4 + audience * 0.3 + engagement * 0.2 + past * 0.1);
          return { inf, score };
        })
        .filter((x) => x.score >= 20)
        .sort((a, b) => b.score - a.score);
      const topN = Number(body.top_n) || 15;
      top = scored.slice(0, topN);
    }

    const existing = await base44.asServiceRole.entities.InfluencerMatch.filter({ submission_id: submissionId }).catch(() => []);
    const have = new Set(existing.map((m) => m.influencer_id));
    const now = new Date().toISOString();
    // Every tier auto-accepts on payment EXCEPT mega — the ₦8M celebrity-tier names
    // (Ronaldo, Messi, MrBeast…) are expression-of-interest only, reached out to on
    // the artist's behalf; their acceptance depends on availability, never guaranteed.
    const matches = top
      .filter((x) => !have.has(x.inf.id))
      .map((x) => {
        const auto = (x.inf.tier || 'nano') !== 'mega';
        return {
          submission_id: submissionId,
          submission_title: submission.title,
          artist_id: submission.artist_id || '',
          artist_name: submission.artist_name || '',
          influencer_id: x.inf.id,
          influencer_name: x.inf.full_name || x.inf.username,
          match_score: x.score,
          status: auto ? 'accepted' : 'pending',
          auto_notified: true,
          responded_at: auto ? now : undefined,
          feedback: auto ? 'Auto-accepted on payment — RIDE X partner' : undefined,
        };
      });

    const created = matches.length ? await base44.asServiceRole.entities.InfluencerMatch.bulkCreate(matches) : [];

    // Fair payout: 80% of the paid total split equally among auto-accepted partners.
    const accepted = matches.filter((m) => m.status === 'accepted');
    if (accepted.length) {
      const share = Math.round(((submission.price || 0) * 0.8) / accepted.length);
      try {
        await base44.asServiceRole.entities.InfluencerEarning.bulkCreate(
          accepted.map((m) => ({
            influencer_id: m.influencer_id,
            influencer_name: m.influencer_name,
            submission_id: submissionId,
            submission_title: submission.title,
            amount: share,
            status: 'pending',
          }))
        );
      } catch (e) { console.error('earning create failed:', e.message); }
      try {
        await base44.asServiceRole.entities.Influencer.bulkUpdate(
          accepted.map((m) => {
            const cur = influencers.find((i) => i.id === m.influencer_id);
            return { id: m.influencer_id, total_earnings: (cur?.total_earnings || 0) + share };
          })
        );
      } catch (e) { console.error('earning bump failed:', e.message); }
      await base44.asServiceRole.entities.InfluencerSubmission.update(submissionId, { status: 'live' });
    } else {
      await base44.asServiceRole.entities.InfluencerSubmission.update(submissionId, { status: 'matched' });
    }

    // ---------- DIRECT DELIVERY (delivery status stored per match) ----------
    // Each matched influencer receives the actual submission in their inbox:
    // on-file email first, otherwise a live web search finds their official
    // contact email (cached, saved on their profile, max 2 fresh searches per
    // run so the payment response stays fast). Sent through the app's own
    // email channel; every outcome is written to the InfluencerMatch record
    // so the Delivery Dashboard can highlight and retry failures.
    let searched = 0;
    let delivered = 0;
    const createdIds = new Map((created || []).map((c) => [c.influencer_id, c.id]));
    const markMatch = (matchId: string | undefined, fields: any) =>
      matchId ? base44.asServiceRole.entities.InfluencerMatch.update(matchId, fields).catch(() => {}) : Promise.resolve();

    for (const x of top) {
      const inf = x.inf;
      const matchId = createdIds.get(inf.id);
      let to = (inf.email || '').trim();
      if (!to && searched < 2) {
        searched++;
        const found = await findOfficialEmailCached(
          base44,
          `influencer:${inf.id}`,
          `the official business contact email address of ${inf.full_name || inf.username}, a ${inf.platform || "social media"} influencer`
        ).catch(() => null);
        if (found?.email) {
          to = found.email;
          await base44.asServiceRole.entities.Influencer.update(inf.id, { email: to }).catch(() => {});
        }
      }
      if (!to) {
        await markMatch(matchId, { delivery_status: 'failed', delivery_error: 'No contact email on file or found by web search' });
        continue;
      }

      try {
        const res = await sendDirectEmail({
          to,
          subject: `New ${submission.type || "song"} submission for you — "${submission.title}" via RIDE X`,
          body: buildInfluencerEmail(submission, inf, x.score),
          from_name: 'RIDE X',
        });
        if (res.ok) {
          delivered++;
          await markMatch(matchId, {
            delivery_status: 'sent', delivery_email: to, delivery_error: '', delivered_at: new Date().toISOString(),
          });
        } else throw new Error(res.error || 'email failed');
      } catch (e: any) {
        console.error('influencer email failed:', e.message);
        await markMatch(matchId, {
          delivery_status: 'failed', delivery_email: to, delivery_error: String(e.message || 'email failed').slice(0, 250),
        });
      }
    }

    return Response.json({ matched: created.length, emails_sent: delivered, matches: created });
  } catch (error: any) {
    console.error('auto-match-influencers error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}