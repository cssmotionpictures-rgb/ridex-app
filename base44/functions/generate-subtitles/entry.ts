import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeLLM } from "../../shared/safeIntegration.ts";
import { whisperProxy } from "../../shared/whisperProxy.ts";

export default async function(req) {
  const log = (...a) => console.log('[generate-subtitles]', ...a);
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'video' ? 'video' : 'movie';
    const entityId = body?.entityId || body?.movieId;
    const videoUrl = body?.videoUrl;
    const totalSeconds = Number(body?.totalSeconds) || 0;
    if (!entityId || !videoUrl) {
      return Response.json({ error: 'entityId (or movieId) and videoUrl are required' }, { status: 400 });
    }
    const entityName = kind === 'video' ? 'MusicVideo' : 'Movie';

    const base44 = createClientFromRequest(req);
    const ent = base44.asServiceRole.entities[entityName];
    await ent.update(entityId, { subtitles_status: 'processing' }).catch(() => {});
    log('starting for', entityName, entityId, 'dur~', totalSeconds);

    // 1. Raw transcript — Whisper first (fast, accurate, ≤25MB), then a video-capable LLM for larger files.
    let transcript = '';
    let whisperErr = '';
    try {
      transcript = await whisperProxy(videoUrl);
      log('whisper (direct) transcript len:', transcript.length);
    } catch (e) {
      whisperErr = e?.message || String(e);
      log('whisper direct failed, falling back to video LLM:', whisperErr);
    }
    if (!transcript) {
      const llm = await safeLLM(base44, {
        prompt: 'You are a professional subtitler. Watch/listen to this video and transcribe ALL spoken dialogue and lyrics as plain readable English text (translate to English if needed). Return ONLY the English transcript text — no timestamps, no speaker labels, no commentary, no markdown. If there is no speech or lyrics, return an empty string.',
        file_urls: [videoUrl],
        model: 'gemini_3_flash',
      });
      transcript = typeof llm === 'string' ? llm : (llm?.text ?? llm?.response ?? (llm ? String(llm) : ''));
      log('llm transcript len:', transcript.length);
    }

    if (!transcript || !transcript.trim()) {
      await ent.update(entityId, { subtitles_status: 'failed' }).catch(() => {});
      return Response.json({ error: 'No speech could be transcribed from this video', whisperErr }, { status: 422 });
    }

    // 2. Turn the transcript into timed, caption-length English cues (JSON) synced to the video duration.
    const durationHint = totalSeconds > 0
      ? `The full video is approximately ${totalSeconds} seconds long. Distribute cues across that full duration.`
      : 'Distribute cues across the full video duration based on what you see and hear.';
    const cueRes = await safeLLM(base44, {
      prompt: `You are a professional subtitler. Turn this ${kind === 'video' ? 'music video' : 'movie'} transcript into timed English subtitle cues. ${durationHint} Return a JSON object with a "cues" array. Each cue has "start" (seconds, number), "end" (seconds, number), and "text" (a short English subtitle line, caption-length). Make each cue 2–5 seconds long, sequential and continuous from 0 to the end with no gaps. Keep wording faithful to the transcript.\n\nTranscript:\n${transcript}`,
      response_json_schema: {
        type: 'object',
        properties: {
          cues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                start: { type: 'number' },
                end: { type: 'number' },
                text: { type: 'string' },
              },
              required: ['start', 'end', 'text'],
            },
          },
        },
        required: ['cues'],
      },
    });
    let cues = cueRes?.cues || cueRes?.data?.cues;

    if (!Array.isArray(cues) || !cues.length) {
      // Fallback: keep the plain transcript so something still shows.
      await ent.update(entityId, { subtitles_en: transcript, subtitles_status: 'ready' }).catch(() => {});
      log('no cues produced, stored plain transcript');
      return Response.json({ ok: true, subtitles: transcript });
    }

    const en = JSON.stringify(cues);
    await ent.update(entityId, { subtitles_en: en, subtitles_status: 'ready' }).catch(() => {});
    log('done for', entityName, entityId, 'cues:', cues.length);
    return Response.json({ ok: true, subtitles: cues });
  } catch (error) {
    console.error('generate-subtitles error:', error?.message || error);
    return Response.json({ error: error?.message || 'subtitle generation failed' }, { status: 500 });
  }
}