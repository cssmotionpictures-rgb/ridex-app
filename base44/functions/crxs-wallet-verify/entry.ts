import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { ethers } from 'npm:ethers@6.13.4';

// CRXS WALLET OWNERSHIP VERIFICATION (SIWE-style) — the server is the ONLY
// place a wallet address becomes "verified". The client can never claim an
// address by typing it: the server builds a single-use, expiring, plain
// human-readable sign-in message (it authorizes NOTHING — it only proves
// control of the wallet), the user signs it in their own wallet, and the
// server recovers the signer from the signature. Only when the recovered
// signer equals the submitted address is the identity written, and Crix ID
// claims are bound to that same proof. The app never sees or stores private
// keys — wallets sign, the server verifies.

const DAPP_HOST = 'ridex-all-go.base44.app';

function fail(error, status) {
  return Response.json({ ok: false, error }, { status: status || 200 });
}

function normalizeCrixId(raw) {
  let id = String(raw || '').trim().toLowerCase();
  if (id.startsWith('@')) id = id.slice(1);
  if (!/^[a-z0-9_]{3,24}$/.test(id)) return null;
  return '@' + id;
}

function buildMessage(address, nonce, issuedAt, expiresAt) {
  return [
    'Sign in to CrixCoin',
    '',
    'This signature only proves that you control this wallet.',
    'It does NOT authorize a blockchain transaction or transfer funds.',
    '',
    'Domain: ' + DAPP_HOST,
    'Wallet: ' + address,
    'Nonce: ' + nonce,
    'Issued At: ' + issuedAt,
    'Expiration: ' + expiresAt,
  ].join('\n');
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('Sign in to the app first.', 401);
    // Identity writes happen ONLY here, after cryptographic verification —
    // service role is used because the write is authorized by the wallet
    // signature, not by the RLS role.
    const svc = base44.asServiceRole || base44;

    const body = await req.json().catch(() => ({}));
    const address = String(body.address || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return fail('Invalid wallet address.');

    const existingRows = await svc.entities.CrixWalletIdentity.filter({ user_id: user.id });
    const identity = (existingRows || [])[0];

    // ——— step 1: issue a single-use, expiring sign-in message ———
    if (body.action === 'nonce') {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const message = buildMessage(address, nonce, issuedAt, expiresAt);
      const fields = {
        user_id: user.id,
        wallet_address: address,
        pending_message: message,
        nonce_expires_at: expiresAt,
      };
      if (identity) await svc.entities.CrixWalletIdentity.update(identity.id, fields);
      else await svc.entities.CrixWalletIdentity.create(fields);
      return Response.json({ ok: true, message, expires_at: expiresAt });
    }

    // ——— step 2: verify the wallet signature server-side ———
    const signature = String(body.signature || '');
    if (identity && body.crix_id !== undefined && body.crix_id !== null && normalizeCrixId(body.crix_id) === null) {
      return fail('Invalid Crix ID — use 3-24 characters: lowercase letters, numbers, underscores.');
    }
    if (!identity || !identity.pending_message) return fail('No pending verification — request a new one.');
    if (!identity.nonce_expires_at || new Date(identity.nonce_expires_at) < new Date()) {
      return fail('The verification expired — request a new one.');
    }
    if (String(identity.wallet_address || '').toLowerCase() !== address) {
      return fail('The pending verification belongs to a different wallet address.');
    }
    if (!/^0x[0-9a-f]{130}$/.test(signature)) return fail('Invalid signature format.');

    let recovered = '';
    try {
      recovered = ethers.verifyMessage(identity.pending_message, signature).toLowerCase();
    } catch (e) {
      return fail('Signature verification failed — the signature does not match the sign-in message.');
    }
    if (recovered !== address) {
      return fail('The signature does not prove control of this wallet — nothing was verified.');
    }

    // Crix ID claim/change (bound to this verified wallet)
    let finalCrixId = identity.crix_id || '';
    if (body.crix_id !== undefined && body.crix_id !== null) {
      const wanted = normalizeCrixId(body.crix_id);
      const taken = await svc.entities.CrixWalletIdentity.filter({ crix_id: wanted });
      if ((taken || []).some((r) => r.user_id !== user.id)) {
        return fail('Crix ID ' + wanted + ' is already taken — choose another.');
      }
      finalCrixId = wanted;
    }

    const now = new Date().toISOString();
    const patch = {
      wallet_verified: true,
      verified_at: now,
      signature_verified_count: (identity.signature_verified_count || 0) + 1,
      pending_message: '',
      nonce_expires_at: '',
    };
    if (body.crix_id !== undefined && body.crix_id !== null) patch.crix_id = finalCrixId;
    await svc.entities.CrixWalletIdentity.update(identity.id, patch);

    return Response.json({
      ok: true,
      identity: {
        wallet_address: address,
        crix_id: finalCrixId,
        wallet_verified: true,
        verified_at: now,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) });
  }
}