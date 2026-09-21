import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { hashPersonalMessage, ecrecover, hexToBytes } from "../../shared/ecdsaK1.ts";
import {
  SIMPLE_ACCOUNT_FACTORY,
  saltHexFor,
  bindingMessage,
  deriveAccountAddressOnChain,
} from "../../shared/smartAccountFactory.ts";

// CRIXCOIN ADDRESS REGISTRATION — Coinbase-free, in-browser, fail-closed.
//
// The customer derives their permanent smart-account address in their own
// browser (public Base read through the official ERC-4337 SimpleAccountFactory,
// owner = their connected wallet). This function then:
//   1. requires an authenticated user;
//   2. verifies the wallet signature recovers to the submitted owner address
//      (ADDRESS DERIVATION ≠ WALLET CONTROL — a record is never created from a
//      guessed address);
//   3. enforces idempotency (one permanent address per user, forever) and
//      uniqueness (one owner wallet belongs to at most one user);
//   4. derives the salt SERVER-SIDE from the authenticated user id;
//   5. independently re-derives and verifies the address ON-CHAIN against the
//      official factory (chain 8453, factory code, ≥2 agreeing endpoints);
//   6. records the user's own CrxsSmartAccount row with full evidence.
// No private key material ever touches this app. If any check fails, nothing
// is created (fail closed) and the honest reason is returned.
// (Deploy retry 3 — signature-verified Coinbase-free address registration.)

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const owner = String(body.owner_address || "").toLowerCase().trim();
    const signature = String(body.signature || "").trim();
    if (!/^0x[0-9a-f]{40}$/.test(owner)) {
      return Response.json({ error: "INVALID_OWNER_ADDRESS — no address was created." }, { status: 400 });
    }
    if (!/^0x[0-9a-f]{130}$/.test(signature)) {
      return Response.json({ error: "INVALID_SIGNATURE — no address was created." }, { status: 400 });
    }

    const service = base44.asServiceRole;

    // Idempotency — one permanent CRIXCOIN address per user, forever. A repeat
    // registration returns the SAME address and never creates a second wallet.
    const existing = await service.entities.CrxsSmartAccount.filter({ user_id: user.id });
    const row = (existing || [])[0] || null;
    if (row && row.status === "CREATED" && row.account_address) {
      return Response.json({
        ok: true,
        created: false,
        crixcoin_address: row.account_address,
        owner_address: row.owner_address,
        note: "Existing permanent CRIXCOIN address — one address per user, forever.",
      });
    }

    // Wallet control — the personal_sign signature must recover to the owner.
    const message = bindingMessage(user.id, owner);
    const recovered = ecrecover(hashPersonalMessage(message), hexToBytes(signature));
    if (!recovered || recovered !== owner) {
      return Response.json(
        { error: "WALLET_SIGNATURE_INVALID — the signature does not prove control of this wallet, so no address was created." },
        { status: 400 }
      );
    }

    // Uniqueness — an owner wallet may belong to at most one CRIXCOIN user.
    const ownerTaken = await service.entities.CrxsSmartAccount.filter({ owner_address: owner });
    if ((ownerTaken || []).some((r) => r.user_id !== user.id)) {
      return Response.json(
        { error: "WALLET_ALREADY_BOUND — this wallet is already registered to another CRIXCOIN account. No address was created." },
        { status: 409 }
      );
    }

    // Deterministic salt, derived server-side from the authenticated user id.
    const saltHex = await saltHexFor(user.id);

    // Independent on-chain derivation + verification (fail closed).
    const { address, checks } = await deriveAccountAddressOnChain(owner, saltHex);

    const data = {
      user_id: user.id,
      owner_address: owner,
      account_name: "base-simpleaccount-v1",
      account_address: address,
      network: "base",
      chain_id: 8453,
      status: "CREATED",
      evidence_json: JSON.stringify([
        { check: "owner_signature", pass: true, source: "personal_sign verified server-side (ecrecover)" },
        ...checks,
        { check: "salt_deterministic_from_user_id", pass: true, source: "SHA-256, server-side" },
      ]),
      failure_reason: "",
    };
    if (row) await service.entities.CrxsSmartAccount.update(row.id, data);
    else await service.entities.CrxsSmartAccount.create(data);

    // Append-only audit trail (non-critical — never blocks the operation).
    try {
      await service.entities.CrixAuditEvent.create({
        event_id: "address_register|" + user.id + "|" + Date.now(),
        user_id: user.id,
        operation: "address_register",
        new_state: "CREATED",
        wallet: address,
        reason: "Coinbase-free smart-account registration — signature-proven owner, independently verified against the official Base factory",
        payload_json: JSON.stringify({ owner_address: owner, factory: SIMPLE_ACCOUNT_FACTORY, chain_id: 8453 }),
      });
    } catch (e) {
      // audit failure must not fail the registration
    }

    return Response.json({ ok: true, created: true, crixcoin_address: address, owner_address: owner, evidence: checks });
  } catch (error) {
    return Response.json({ error: String((error && error.message) || error) }, { status: 500 });
  }
}