import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { freeFeatureScore } from "../../shared/freeFeatureScore.ts";
// freeFeatureScore now routes through safeLLM (OpenAI → Core → local auto-pass fallback).

// Free Feature auto-approve engine — runs the algorithmic A&R score server-side.
// The frontend invokes this after payment settles (sandbox / admin-bypass);
// live Paystack payments are scored by the webhook (via waitUntil) using the
// same shared helper. Replaces the old 50/50 random draw.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const applicationId = body?.application_id || body?.applicationId;
    if (!applicationId) return Response.json({ error: 'application_id required' }, { status: 400 });

    const txId = body?.transaction_id || body?.transactionId || '';
    const paystackRef = body?.paystack_reference || body?.paystackReference || '';

    const app = await base44.asServiceRole.entities.FreeFeatureApplication.get(applicationId).catch(() => null);
    if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });

    // Only the applicant or an admin may trigger the score.
    if (app.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build the patch: mark paid (if not already), then score if still pending.
    const patch = {};
    if (app.payment_status !== 'paid') {
      patch.payment_status = 'paid';
      if (txId) patch.transaction_id = txId;
      if (paystackRef) patch.paystack_reference = paystackRef;
    }

    if (app.status === 'pending') {
      const result = await freeFeatureScore(base44, app);
      Object.assign(patch, result.patch);
      await base44.asServiceRole.entities.FreeFeatureApplication.update(applicationId, patch);
      return Response.json({ status: patch.status, accepted: result.accepted, score: result.score, application_id: applicationId });
    }

    // Already decided — return the existing result (idempotent).
    const accepted = app.status === 'approved';
    return Response.json({ status: app.status, accepted, score: app.quality_score ?? null, application_id: applicationId, already_decided: true });
  } catch (error) {
    console.error('auto-approve-free-feature failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}