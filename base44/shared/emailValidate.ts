// Lightweight, server-side email deliverability check (no third-party key).
// 1) RFC-ish syntax validation.
// 2) reject known disposable / throwaway domains.
// 3) confirm the domain has DNS records (MX, A, or AAAA) so it can receive mail,
//    looked up via Google DNS-over-HTTPS.
// MX lookup is cached per-domain for the lifetime of a run (B2B lists often share
// domains). DoH / network failures are treated as "valid" so a transient DNS
// blip never blocks a legitimate send — only a hard "no records" = invalid.

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "temp-mail.org", "emailondeck.com", "mintemail.com", "mohmal.com",
  "tempmail.net", "tempmailaddress.com", "spam4.me", "mailnesia.com",
  "tempr.email", "guerrillamail.info", "grr.la", "discard.email", "mailcatch.com",
]);

const SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const mxCache = new Map<string, boolean>();

export function isValidSyntax(email: string): boolean {
  return SYNTAX.test(String(email || '').trim().toLowerCase());
}

export function isDisposable(domain: string): boolean {
  return DISPOSABLE.has(String(domain || '').trim().toLowerCase());
}

async function domainCanReceiveMail(domain: string): Promise<boolean> {
  const d = String(domain || '').trim().toLowerCase();
  if (mxCache.has(d)) return mxCache.get(d)!;
  let result = true; // lenient default
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(d)}&type=MX`);
    if (res.ok) {
      const data: any = await res.json();
      const answers: any[] = data?.Answer || data?.Authority || [];
      if (!answers.length) {
        result = false; // NXDOMAIN / no records at all → dead
      } else {
        // MX=15, A=1, AAAA=28. SOA-only (type 6) → no mail server → dead.
        result = answers.some((a) => a.type === 15 || a.type === 1 || a.type === 28);
      }
    }
  } catch {
    result = true; // DoH unreachable — don't block
  }
  mxCache.set(d, result);
  return result;
}

export async function validateEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { valid: false, reason: 'empty' };
  if (!isValidSyntax(e)) return { valid: false, reason: 'syntax' };
  const domain = e.split('@')[1];
  if (isDisposable(domain)) return { valid: false, reason: 'disposable' };
  const canReceive = await domainCanReceiveMail(domain);
  if (!canReceive) return { valid: false, reason: 'dead-domain' };
  return { valid: true };
}