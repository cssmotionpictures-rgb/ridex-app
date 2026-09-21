import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { notifyCuratorsOfSubmission } from '../../shared/curatorEmail.ts';

// Best-effort email notification to curators for submissions created from the
// client-side Curators page flow (manual submit + Auto-Promote payment path).
// Returns per-curator delivery results so the caller can show an honest toast.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const submissions = Array.isArray(b.submissions) ? b.submissions : [];
    if (!submissions.length) return Response.json({ results: [] });

    const results = await notifyCuratorsOfSubmission(base44, submissions);
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}