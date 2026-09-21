import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Saves a mastered WAV to the connected Google Drive (shared connector),
// organized as: RIDE X Masters / <project title> / <file name>.wav
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const fileUrl = String(body.file_url || '');
    const fileName = String(body.file_name || '').trim().slice(0, 150);
    const projectTitle = String(body.project_title || 'Masters').trim().slice(0, 80) || 'Masters';
    if (!/^https?:\/\//.test(fileUrl) || !fileName) {
      return Response.json({ error: 'file_url and file_name are required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (!accessToken) return Response.json({ error: 'Google Drive is not connected' }, { status: 503 });
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Folder helpers — with the drive.file scope only folders this app
    // created are visible, so find-or-create is safe and cheap.
    const findFolder = async (name, parentId) => {
      let q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${name.replace(/'/g, "\\'")}'`;
      if (parentId) q += ` and '${parentId}' in parents`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=5`,
        { headers: authHeader }
      );
      const data = await res.json();
      return (data.files || [])[0]?.id || null;
    };
    const createFolder = async (name, parentId) => {
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      });
      const data = await res.json();
      return data.id || null;
    };

    let rootId = await findFolder('RIDE X Masters', null);
    if (!rootId) rootId = await createFolder('RIDE X Masters', null);
    let projectId = rootId ? await findFolder(projectTitle, rootId) : null;
    if (!projectId && rootId) projectId = await createFolder(projectTitle, rootId);

    // Pull the uploaded master bytes
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return Response.json({ error: 'Could not fetch the uploaded master' }, { status: 502 });
    const bytes = await fileRes.arrayBuffer();
    if (bytes.byteLength > 40 * 1024 * 1024) {
      return Response.json({ error: 'File too large for Drive save' }, { status: 413 });
    }

    // Multipart upload (metadata + audio/wav body)
    const boundary = 'ridex' + Date.now();
    const meta = JSON.stringify({ name: fileName, ...(projectId ? { parents: [projectId] } : {}) });
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: audio/wav\r\n\r\n`
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const payload = new Uint8Array(head.length + bytes.byteLength + tail.length);
    payload.set(head, 0);
    payload.set(new Uint8Array(bytes), head.length);
    payload.set(tail, head.length + bytes.byteLength);

    const up = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: payload,
      }
    );
    const upData = await up.json();
    if (!up.ok) {
      return Response.json({ error: (upData.error && upData.error.message) || 'Drive upload failed' }, { status: 502 });
    }

    // Automatic notification — the moment the master lands in the user's
    // Drive, email them a direct link to the WAV. Non-blocking: a mail failure
    // never marks the (already successful) Drive save as failed.
    let emailSent = false;
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: `Your master is ready — ${fileName}`,
        body: `Your mastered WAV "${fileName}" was just saved to your Google Drive under RIDE X Masters / ${projectTitle}.\n\nDirect link to your master:\n${fileUrl}\n\n— RIDE X AI Master`,
      });
      emailSent = true;
    } catch (mailErr) {
      console.log('master-notify email failed:', mailErr?.message || String(mailErr));
    }
    return Response.json({ saved: true, file_id: upData.id, folder: projectTitle, email_sent: emailSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}