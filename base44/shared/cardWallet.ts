// Wallet→owner resolution for Ride X Cards. The authenticated user's id (or,
// on the webhook path, the card owner's id) is the PRIMARY ownership
// relationship — NEVER a client-supplied id, and never a bare email match.
//
//   PRIMARY:    wallet.user_id === owner id
//   LEGACY:     wallet.user_id empty AND wallet.created_by_id === owner id
//               (wallets created before user_id existed)
//   DIAGNOSTIC: same-email wallets are inspected only to explain a mismatch —
//               a wallet that belongs to a DIFFERENT user id is never charged.
//
// Every caller must treat a null wallet as a hard stop (reject / record owed).

export function walletBelongsTo(wallet, ownerId) {
  if (!wallet || !ownerId) return false;
  const wid = String(wallet.user_id || "");
  const cid = String(wallet.created_by_id || "");
  return wid === ownerId || (wid === "" && cid === ownerId);
}

// Resolve the wallet that belongs to `ownerId`. `email` is optional and used
// ONLY as a secondary diagnostic. `base44` is the caller's client (service
// role on webhook/cron paths, the authenticated user client on user actions).
export async function findOwnerWallet(base44, ownerId, email) {
  if (!ownerId) return { wallet: null, match: "no_owner_id", conflict: false };

  // PRIMARY — user_id ownership link.
  const byUserId = await base44.entities.RideXCard.filter({ user_id: ownerId });
  const w1 = byUserId && byUserId[0];
  if (w1 && walletBelongsTo(w1, ownerId)) return { wallet: w1, match: "user_id", conflict: false };

  // LEGACY — wallets created before user_id was tracked.
  const byCreated = await base44.entities.RideXCard.filter({ created_by_id: ownerId });
  const w2 = byCreated && byCreated[0];
  if (w2 && walletBelongsTo(w2, ownerId)) return { wallet: w2, match: "created_by_id", conflict: false };

  // DIAGNOSTIC — same email, different account: report the conflict so the
  // caller can reject with a clear message. NEVER return this wallet.
  if (email) {
    const byEmail = await base44.entities.RideXCard.filter({ email });
    const w3 = byEmail && byEmail[0];
    if (w3 && !walletBelongsTo(w3, ownerId)) {
      return { wallet: null, match: "email_mismatch", conflict: true };
    }
  }

  return { wallet: null, match: "none", conflict: false };
}