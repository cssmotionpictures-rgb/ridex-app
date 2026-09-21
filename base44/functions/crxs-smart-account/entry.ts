import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { readCdpCreationCredentials, cdpGetOrCreateAccounts, cdpNamesFor } from "../../shared/cdpRest.ts";

// UNIQUE CRIXCOIN ADDRESS PER USER (Coinbase CDP, pure Web-Crypto REST — no
// SDK, because the SDK bundle cannot be built by the deploy pipeline).
// Every user gets one unique owner EOA that owns exactly one smart account —
// the user's permanent CRIXCOIN address, derived deterministically, known
// before deployment, never changing. Idempotent: a repeat call recovers the
// SAME owner and account instead of creating another. No private key material
// ever touches this app — CDP holds key material in its own secure
// infrastructure. If a required credential is still missing, the honest
// answer is CDP_NOT_CONFIGURED and NOTHING is created.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const service = base44.asServiceRole;

    // Idempotency — one permanent CRIXCOIN address per user, forever.
    const existing = await service.entities.CrxsSmartAccount.filter({ user_id: user.id });
    const row = (existing || [])[0] || null;
    if (row && row.status === "CREATED" && row.account_address) {
      return Response.json({
        ok: true,
        created: false,
        account_name: row.account_name,
        crixcoin_address: row.account_address,
        owner_address: row.owner_address,
        note: "Existing CRIXCOIN address returned — one permanent address per user, forever",
      });
    }

    // Honest credential gate — nothing is created from thin air.
    const creds = readCdpCreationCredentials();
    if (!creds.apiKeyId || !creds.apiKeySecret) {
      return Response.json({
        error: "CDP_NOT_CONFIGURED — server-side smart account operations are not possible yet. Still missing: " + creds.missing.join(" · ") + ". Nothing was created.",
        missing: creds.missing,
      }, { status: 409 });
    }

    // By-name lookups need only the API key pair; creation also needs the
    // wallet secret — so an existing account is returned even without it.
    const names = cdpNamesFor(user.id);
    const allowCreate = !!creds.walletSecret;
    const result = await cdpGetOrCreateAccounts(creds, names.eoa, names.smart, allowCreate);

    if (result.error) {
      if (/WALLET_SECRET_MISSING/.test(result.error)) {
        return Response.json({
          error: "CDP_NOT_CONFIGURED — no CDP account exists for this user yet, and first-time creation requires CDP_WALLET_SECRET (create it alongside the CDP API key in the CDP Portal, then add it in Settings → Secrets). Nothing was created.",
          missing: ["CDP_WALLET_SECRET"],
          evidence: result.evidence || [],
        }, { status: 409 });
      }
      if (row) {
        await service.entities.CrxsSmartAccount.update(row.id, {
          status: "FAILED",
          failure_reason: result.error,
          evidence_json: JSON.stringify(result.evidence || []),
        });
      }
      return Response.json({ error: result.error, evidence: result.evidence || [] }, { status: 502 });
    }

    const ownerAddress = result.owner_address || "";
    const address = result.account_address || "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(ownerAddress) || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      const reason = "CDP returned no valid owner or smart account address for this user yet";
      if (row) {
        await service.entities.CrxsSmartAccount.update(row.id, {
          status: "FAILED",
          failure_reason: reason,
          evidence_json: JSON.stringify(result.evidence || []),
        });
      }
      return Response.json({ error: reason + " — nothing was recorded as created", evidence: result.evidence || [] }, { status: 502 });
    }

    const data = {
      user_id: user.id,
      owner_address: String(ownerAddress).toLowerCase(),
      account_name: names.smart,
      account_address: String(address).toLowerCase(),
      network: "base",
      chain_id: 8453,
      status: "CREATED",
      evidence_json: JSON.stringify(result.evidence || []),
      failure_reason: "",
    };
    if (row) await service.entities.CrxsSmartAccount.update(row.id, data);
    else await service.entities.CrxsSmartAccount.create(data);

    return Response.json({
      ok: true,
      created: true,
      account_name: names.smart,
      crixcoin_address: address,
      owner_address: ownerAddress,
      evidence: result.evidence || [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}