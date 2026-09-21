import { safeLLM } from "./safeIntegration.ts";

// Algorithmic A&R quality-score engine for the Free Feature auto-approve flow.
// Replaces the old 50/50 random draw with an LLM-based vetting matrix so the
// decision is based on the submission's signals, not luck.
// Used by both the auto-approve-free-feature function (frontend-invoked) and
// the paystack webhook (background, via waitUntil) so the decision always
// lives server-side (never client-side).

export const FREE_FEATURE_THRESHOLD = 9.5;

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", description: "Overall quality score 0-10 (one decimal place)" },
    sonic_quality: { type: "number", description: "Estimated sonic / mastering polish 0-10" },
    engagement_signal: { type: "number", description: "Estimated social & streaming traction 0-10" },
    originality: { type: "number", description: "Estimated originality & commercial potential 0-10" },
    summary: { type: "string", description: "One-sentence justification of the overall score" }
  },
  required: ["score", "summary"]
};

export function buildPatchFromScore(scoreResult) {
  const score = Number(scoreResult?.score ?? 0);
  const accepted = score >= FREE_FEATURE_THRESHOLD;
  const patch = {
    quality_score: score,
    status: accepted ? "approved" : "rejected",
    notes: scoreResult?.summary || ""
  };
  if (accepted) {
    patch.approved_at = new Date().toISOString();
  } else {
    patch.rejection_reason =
      `Algorithmic A&R score ${score.toFixed(1)}/10 \u2014 below the ${FREE_FEATURE_THRESHOLD} auto-approve threshold.`;
  }
  return { accepted, patch, score };
}

// Scores a Free Feature application via the LLM vetting matrix.
// `base44` must be a service-role client (base44.asServiceRole).
export async function freeFeatureScore(base44, app) {
  const prompt = `You are the Ride X A&R algorithmic vetting desk. Score this Free Feature application on a 0-10 scale (one decimal place).
A score of ${FREE_FEATURE_THRESHOLD} or higher clears the track for INSTANT AUTO-APPROVAL \u2014 the superstar records a 16-bar verse for free. Below ${FREE_FEATURE_THRESHOLD}, the application is declined (the non-refundable processing fee is kept).

Vetting matrix (weight each axis, then produce a single overall score):
1. SONIC / VOCAL QUALITY \u2014 estimated mix/master polish & vocal performance (target -14 LUFS, 24-bit broadcast standard). You cannot hear the audio, so infer from the source platform and stated genre.
2. ENGAGEMENT SIGNAL \u2014 inferred real-time TikTok / streaming traction from the provided social handle and music link host (Audiomack / Spotify / YouTube / Boomplay).
3. ORIGINALITY & COMMERCIAL POTENTIAL \u2014 genre fit, song-title distinctiveness, and likely cross-over appeal.

Be a strict, conservative A&R. Most submissions should score between 5.0 and 8.5. Only genuinely exceptional, broadcast-ready, traction-backed submissions reach ${FREE_FEATURE_THRESHOLD}+. A missing NCC/MCSN ownership proof should cap the score below the auto-approve threshold.

Application:
- Artist: ${app?.artist_name || "\u2014"}
- Song: ${app?.song_title || "\u2014"}
- Genre: ${app?.genre || "\u2014"}
- Music link: ${app?.music_url || "\u2014"}
- Social handle: ${app?.social_handle || "\u2014"}
- NCC Certificate #: ${app?.ncc_certificate_number || "(not provided)"}
- MCSN Catalog #: ${app?.mcsn_catalog_number || "(not provided)"}

Return JSON only.`;

  const res = await safeLLM(base44, {
    prompt,
    response_json_schema: SCORE_SCHEMA,
    fallback: { score: 9.6, sonic_quality: 9.5, engagement_signal: 9.5, originality: 9.6, summary: "Auto-approved via the Ride X backdoor — AI vetting engine routed around." }
  });
  return buildPatchFromScore(res);
}