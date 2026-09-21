// (redeploy probe 3 — comment only, no functional change)
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { verifyAddressOnBaseMainnet } from "../../shared/crxsMainnetRpc.ts";
import { TREASURY_TARGET_ETH, TREASURY_MINIMUM_ETH, TREASURY_CRITICAL_ETH, treasuryStatusFromBalance } from "../../shared/gasFeeEngine.ts";

// CRIXCOIN_GAS_TREASURY sync — admin-only. Locates the EXISTING CRIXCOIN
// deployment wallet from the project's own records (never generates a new
// wallet, never accepts a client-supplied address), verifies it live on Base
// Mainnet, and records the real treasury state. A configured treasury row that
// points anywhere else is a TREASURY_DESTINATION_MISMATCH and stops the sync.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — treasury sync is admin-only" }, { status: 403 });

    // 1) Locate the EXISTING wallet in the project's own deployment records.
    const mainnetRows = await base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" });
    const sepoliaRows = await base44.entities.CrxsDeploymentRecord.filter({ registry_key: "crxs-deployment" });
    const candidates = [];
    for (const row of mainnetRows || []) {
      if (row.deployer) candidates.push({ address: String(row.deployer).toLowerCase(), source: "CrxsMainnetDeploymentRecord.deployer (existing CRIXCOIN deployment wallet)" });
    }
    for (const row of sepoliaRows || []) {
      if (row.deployer) candidates.push({ address: String(row.deployer).toLowerCase(), source: "CrxsDeploymentRecord.deployer (existing CRIXCOIN deployment wallet)" });
    }
    const unique = [];
    for (const c of candidates) if (!unique.some((u) => u.address === c.address)) unique.push(c);

    if (unique.length === 0) {
      return Response.json({ error: "No existing CRIXCOIN wallet found in the project's deployment records — nothing was invented and no wallet was created" }, { status: 409 });
    }
    if (unique.length > 1) {
      return Response.json({ error: "Multiple candidate wallets found (" + unique.map((u) => u.address).join(", ") + ") — resolve the deployment records first; the treasury address is never guessed" }, { status: 409 });
    }
    const { address, source } = unique[0];

    // 2) Destination safety — an existing treasury row must already match the discovered address.
    const rows = await base44.entities.CrxsGasTreasury.filter({ registry_key: "crxs-gas-treasury" });
    const current = (rows || [])[0] || null;
    if (current && current.wallet_address && String(current.wallet_address).toLowerCase() !== address) {
      return Response.json({ error: "TREASURY_DESTINATION_MISMATCH — the configured treasury address does not match the existing CRIXCOIN deployment wallet. Nothing was changed.", configured: current.wallet_address, expected: address }, { status: 409 });
    }

    // 3) Verify live on Base Mainnet — real RPC, real balance, real account type.
    const verification = await verifyAddressOnBaseMainnet(address);
    const isEoa = verification.checks.find((c) => c.check === "account_type")?.value === "EOA (externally owned wallet)";

    // 4) Real CRXS production contract, if one exists (empty until a real Mainnet deployment).
    const mainnetRecord = (mainnetRows || [])[0] || null;
    const crxsContract = mainnetRecord && mainnetRecord.deployment_status === "DEPLOYED" && mainnetRecord.contract_address ? mainnetRecord.contract_address : "";

    // 5) Status derives ONLY from the live balance against the thresholds.
    const target = current?.target_eth ?? TREASURY_TARGET_ETH;
    const minimum = current?.minimum_eth ?? TREASURY_MINIMUM_ETH;
    const critical = current?.critical_eth ?? TREASURY_CRITICAL_ETH;
    const reserved = current?.reserved_eth ?? 0;
    const status = treasuryStatusFromBalance(verification.eth_balance, target, minimum, critical);

    const data = {
      registry_key: "crxs-gas-treasury",
      chain_id: 8453,
      network: "Base Mainnet",
      wallet_address: address,
      wallet_address_source: source,
      wallet_type: isEoa ? "EOA" : "CONTRACT",
      crxs_contract_address: crxsContract,
      eth_balance: verification.eth_balance,
      eth_balance_raw: verification.eth_balance_wei,
      reserved_eth: reserved,
      available_eth: verification.eth_balance - reserved,
      target_eth: target,
      minimum_eth: minimum,
      critical_eth: critical,
      status,
      verification_json: JSON.stringify(verification.checks),
      last_synced_at: verification.verified_at,
    };

    if (current) await base44.entities.CrxsGasTreasury.update(current.id, data);
    else await base44.entities.CrxsGasTreasury.create(data);

    // CRITICAL reserve → sponsored transactions must halt honestly. The gate is
    // set PAUSED with the live evidence; it can only ever be re-opened by the
    // health check on real on-chain evidence, never automatically.
    if (status === "CRITICAL") {
      const gateRows = await base44.entities.CrxsAAProviderStatus.filter({ registry_key: "crxs-aa-transfer-gate" });
      const gate = (gateRows || [])[0] || null;
      const gateData = {
        registry_key: "crxs-aa-transfer-gate",
        provider: "system",
        role: "TRANSFER_GATE — external on-chain transfers",
        state: "PAUSED",
        capabilities_json: JSON.stringify({ external_transfers: "PAUSED", reason: "CRITICAL_GAS_LOW — treasury holds " + verification.eth_balance + " ETH, below the " + critical + " ETH critical threshold" }),
        entry_points_json: "[]",
        missing_credentials: "",
        required_credentials_json: JSON.stringify([]),
        verification_json: JSON.stringify([{ check: "gas_treasury_critical", pass: false, value: "live balance " + verification.eth_balance + " ETH < critical " + critical + " ETH — sponsored transactions halted honestly" }]),
        notes: "PAUSED by gas treasury sync: the reserve is CRITICAL. The gate re-opens ONLY after the treasury is genuinely funded and the health check re-verifies every real on-chain condition — never automatically.",
        last_checked_at: new Date().toISOString(),
      };
      if (gate) await base44.entities.CrxsAAProviderStatus.update(gate.id, gateData);
      else await base44.entities.CrxsAAProviderStatus.create(gateData);
    }

    // Below minimum → trigger the settlement router (the self-funding engine:
    // accumulated 0.2% CRIXCOIN fees are swapped to ETH to replenish the
    // reserve). The router re-verifies every real condition itself and
    // refuses honestly if anything is missing — nothing is ever forced.
    let replenishment = { triggered: false, status: "", reason: "" };
    if (verification.eth_balance < minimum && status !== "CRITICAL") {
      try {
        const routerUrl = "https://ridex-all-go.base44.app/functions/crxs-settlement-router";
        const auth = req.headers.get("authorization") || "";
        const res = await fetch(routerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
          body: JSON.stringify({ action: "settle", settlement_key: "auto-treasury-" + Date.now() }),
        });
        const j = await res.json().catch(() => ({}));
        replenishment = {
          triggered: true,
          status: String(j.status || "unknown"),
          reason: Array.isArray(j.missing) ? j.missing.join("; ") : String(j.reason || j.note || ""),
        };
      } catch (triggerError) {
        replenishment = { triggered: false, status: "", reason: String(triggerError.message).slice(0, 200) };
      }
    }

    return Response.json({
      ok: true,
      crixcoin_gas_treasury_address: address,
      address_source: source,
      eth_balance: verification.eth_balance,
      status,
      crxs_contract_on_mainnet: crxsContract || "NOT_DEPLOYED — no production CRXS contract exists yet",
      transfer_gate: status === "CRITICAL" ? "PAUSED (CRITICAL_GAS_LOW)" : "unchanged",
      replenishment,
      created: !current,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}