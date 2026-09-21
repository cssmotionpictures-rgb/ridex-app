// Shared Gmail send helper for backend functions — RFC 2822 message with a
// base64-encoded UTF-8 body (RFC 2045 76-char wrapping), so any unicode content
// is safe without manual RFC 2047 header encoding. Server-side only — never
// import this from a frontend file.
//
// Requires the authorized Gmail connector (gmail.send). The OAuth token is
// resolved server-side via asServiceRole and is NEVER exposed to the client.

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function buildRfc2822(to, subject, textBody) {
  const headers = [
    'From: me',
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
  ].join('\r\n');
  const wrapped = utf8ToBase64(textBody).replace(/(.{76})/g, '$1\r\n');
  return btoa(headers + '\r\n' + wrapped);
}

export async function sendGmail(base44, to, subject, textBody) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildRfc2822(to, subject, textBody) }),
  });
  if (!res.ok) {
    throw new Error('gmail-send-failed: ' + (await res.text()).slice(0, 200));
  }
}