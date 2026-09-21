// SERVER-SIDE TRANSACTION PIN — the customer's personal verification for every
// purchase (bills, betting top-ups, dollar cards). Stored ONLY as a salted
// SHA-256 hash. Never logged, never returned, never compared client-side.
// One PIN row per user; changing it requires the current PIN.

export function normalizePin(pin: any): string {
  return String(pin || "").replace(/\D/g, "");
}

async function hashPin(salt: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ":" + pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getPinRow(svc: any, userId: string): Promise<any> {
  const rows = await svc.entities.CrixSecurityPin.filter({ user_id: userId });
  return (rows || [])[0] || null;
}

export async function pinStatus(svc: any, userId: string): Promise<{ has_pin: boolean }> {
  return { has_pin: !!(await getPinRow(svc, userId)) };
}

// Set (first time) or change (requires the current PIN) the transaction PIN.
export async function setPin(svc: any, userId: string, pin: any, currentPin?: any): Promise<void> {
  const p = normalizePin(pin);
  if (p.length < 4 || p.length > 6) throw new Error("Your PIN must be 4 to 6 digits.");
  const row = await getPinRow(svc, userId);
  if (row) {
    const curHash = await hashPin(row.pin_salt, normalizePin(currentPin));
    if (curHash !== row.pin_hash) throw new Error("Incorrect current PIN — your PIN was not changed.");
    const salt = crypto.randomUUID();
    const hash = await hashPin(salt, p);
    await svc.entities.CrixSecurityPin.update(row.id, { pin_salt: salt, pin_hash: hash, failed_attempts: 0, locked_until: "" });
    return;
  }
  const salt = crypto.randomUUID();
  const hash = await hashPin(salt, p);
  await svc.entities.CrixSecurityPin.create({ user_id: userId, pin_salt: salt, pin_hash: hash, failed_attempts: 0, locked_until: "" });
}

// Verify the PIN for a purchase. Fail-closed: no PIN row, lockout or wrong
// hash → nothing moves. 5 wrong attempts lock the PIN for 5 minutes.
export async function verifyPin(svc: any, userId: string, pin: any): Promise<{ ok: boolean; reason: string }> {
  const row = await getPinRow(svc, userId);
  if (!row) return { ok: false, reason: "Create your CRIXCOIN transaction PIN first (in CRIXCOIN Protection)" };
  if (row.locked_until && new Date(String(row.locked_until)) > new Date()) {
    return { ok: false, reason: "Too many wrong attempts — try again in a few minutes" };
  }
  const hash = await hashPin(row.pin_salt, normalizePin(pin));
  if (hash === row.pin_hash) {
    if (Number(row.failed_attempts) > 0 || row.locked_until) {
      await svc.entities.CrixSecurityPin.update(row.id, { failed_attempts: 0, locked_until: "" }).catch(() => {});
    }
    return { ok: true, reason: "" };
  }
  const fails = (Number(row.failed_attempts) || 0) + 1;
  const lockedUntil = fails >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : "";
  await svc.entities.CrixSecurityPin.update(row.id, { failed_attempts: fails, locked_until: lockedUntil }).catch(() => {});
  return { ok: false, reason: lockedUntil ? "Too many wrong attempts — locked for 5 minutes" : "Incorrect PIN" };
}