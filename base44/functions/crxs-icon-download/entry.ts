// Public download endpoint for the official 32x32 CRIXCOIN (CRXS) icon.
// Serves the SVG with Content-Disposition: attachment so any browser
// auto-downloads the file instead of rendering it. No auth needed — it is a
// public brand asset (the icon itself contains no sensitive data).

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset=".5" stop-color="#f7c948"/>
      <stop offset="1" stop-color="#8a6d3b"/>
    </linearGradient>
    <radialGradient id="space" cx=".5" cy=".42" r=".75">
      <stop offset="0" stop-color="#16213f"/>
      <stop offset="1" stop-color="#05070f"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="1" stop-color="#c5a059"/>
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="16" fill="url(#rim)"/>
  <circle cx="16" cy="16" r="12.6" fill="url(#space)"/>
  <circle cx="16" cy="16" r="7.3" fill="none" stroke="url(#gold)" stroke-width="4.6" stroke-dasharray="34.5 11.4"/>
  <path d="M21.2 12.2 23.9 9.5 23.4 12.6 20.4 13.9Z" fill="url(#gold)"/>
  <path d="M23.9 9.5 25.5 8 23.5 11.3Z" fill="#5ed1da"/>
  <path d="M17.8 15.6 20.2 14.2 19.6 16.6Z" fill="#5ed1da" opacity=".8"/>
</svg>`;

export default async function (req: Request): Promise<Response> {
  try {
    return new Response(SVG, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": 'attachment; filename="crxs-icon-32.svg"',
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}