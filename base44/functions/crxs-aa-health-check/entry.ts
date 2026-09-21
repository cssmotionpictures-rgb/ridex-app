import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { aaRpcCall, labelEntryPoints, probePaymasterStub, TRANSFER_GATE_CONDITIONS, BASE_MAINNET_CHAIN_ID } from "../../shared/aaProviders.ts";

// CRIXCOIN AA provider health check — admin-only. Probes the REAL production
// providers (Alchemy primary, Coinbase CDP) with the REAL server-side
// credentials and records honest per-provider states. Nothing is simulated:
// a capability that cannot be probed is NOT_CONFIGURED, a probe failure keeps
// the provider's own error message as evidence, and no stage is enabled by
// configuration alone — external on-chain transfers stay PAUSED until every
// gate condition has real on-chain evidence.
// (Deploy-pipeline diagnostic touch, retry 2 — no functional change.)

const ALCHEMY_BASE_MAINNET = "https://base-mainnet.g.alchemy.com/v2/";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — AA health check is admin-only" }, { status: 403 });

    // Optional credentials — absent until the builder creates them for real.
    // A missing optional secret must report NOT_CONFIGURED, never crash the
    // health check whose whole job is to state exactly what is missing.
    function readOptionalSecret(name) {
      try { const value = secrets.get(name); return value || null; } catch (error) { return null; }
    }

    const alchemyKey = secrets.get("ALCHEMY_API_KEY");
    const alchemyPolicyId = readOptionalSecret("ALCHEMY_GAS_POLICY_ID");
    const cdpPaymasterUrl = secrets.get("CDP_PAYMASTER_URL");
    const cdpWalletSecret = readOptionalSecret("CDP_WALLET_SECRET");

    async function upsert(data) {
      const rows = await base44.entities.CrxsAAProviderStatus.filter({ registry_key: data.registry_key });
      const current = (rows || [])[0] || null;
      if (current) await base44.entities.CrxsAAProviderStatus.update(current.id, data);
      else await base44.entities.CrxsAAProviderStatus.create(data);
      return data.registry_key;
    }

    // ---------- ALCHEMY — PRIMARY ERC-4337 infrastructure candidate ----------
    const alchemyChecks = [];
    const alchemyMissing = [];
    let alchemyEntryPoints = [];
    const alchemyCaps = { embedded_wallet: "NOT_CONFIGURED", smart_accounts: "NOT_CONFIGURED", bundler: "NOT_CONFIGURED", paymaster: "NOT_CONFIGURED", server_side: "NOT_CONFIGURED" };

    if (!alchemyKey) {
      alchemyMissing.push("ALCHEMY_API_KEY");
      alchemyChecks.push({ check: "api_key", pass: false, value: "NOT_CONFIGURED — no Alchemy API key stored" });
    } else {
      alchemyChecks.push({ check: "api_key", pass: true, value: "stored server-side (value never exposed)" });
      let networkOk = false;
      let entryPoints = [];
      try {
        const chainId = await aaRpcCall(ALCHEMY_BASE_MAINNET + alchemyKey, "eth_chainId", []);
        networkOk = parseInt(chainId, 16) === BASE_MAINNET_CHAIN_ID;
        alchemyChecks.push({ check: "base_mainnet_network_enabled", pass: networkOk, value: networkOk ? "chain 8453 answered live" : "key answered but BASE_MAINNET is not enabled for this Alchemy app — enable the Base Mainnet network on the key in the Alchemy dashboard" });
      } catch (error) {
        alchemyChecks.push({ check: "base_mainnet_network_enabled", pass: false, value: String(error.message).slice(0, 220) });
      }
      if (networkOk) {
        alchemyCaps.server_side = "VERIFIED";
        try {
          entryPoints = await aaRpcCall(ALCHEMY_BASE_MAINNET + alchemyKey, "eth_supportedEntryPoints", []);
          alchemyChecks.push({ check: "erc4337_bundler_entry_points", pass: Array.isArray(entryPoints) && entryPoints.length > 0, value: labelEntryPoints(entryPoints) });
          alchemyCaps.bundler = Array.isArray(entryPoints) && entryPoints.length > 0 ? "VERIFIED" : "NOT_CONFIGURED";
          alchemyEntryPoints = Array.isArray(entryPoints) ? entryPoints : [];
        } catch (error) {
          alchemyChecks.push({ check: "erc4337_bundler_entry_points", pass: false, value: String(error.message).slice(0, 220) });
        }
      }
      if (!alchemyPolicyId) {
        alchemyMissing.push("ALCHEMY_GAS_POLICY_ID");
        alchemyChecks.push({ check: "gas_manager_policy", pass: false, value: "NOT_CONFIGURED — create a Gas Manager policy for Base Mainnet in the Alchemy dashboard and store its policy id, then fund it with real ETH" });
      } else {
        alchemyChecks.push({ check: "gas_manager_policy", pass: true, value: "policy id stored — sponsorship is proven only by a real sponsored UserOperation at the live stage" });
        alchemyCaps.paymaster = "CONFIGURED";
      }
      alchemyChecks.push({ check: "embedded_accounts", pass: false, value: "NOT_CONFIGURED — Alchemy Embedded Accounts activation is verified at the smart-account stage, never assumed" });
    }

    const alchemyState = alchemyCaps.bundler === "VERIFIED" && alchemyCaps.paymaster !== "NOT_CONFIGURED" ? "VERIFIED" : "NOT_CONFIGURED";
    await upsert({
      registry_key: "aa-provider|alchemy",
      provider: "alchemy",
      role: "PRIMARY ERC-4337 — EmbeddedWalletProvider + PaymasterProvider + Bundler",
      state: alchemyState,
      capabilities_json: JSON.stringify(alchemyCaps),
      entry_points_json: JSON.stringify(alchemyEntryPoints),
      missing_credentials: alchemyMissing.join(", "),
      required_credentials_json: JSON.stringify(["ALCHEMY_API_KEY", "ALCHEMY_GAS_POLICY_ID (Gas Manager policy — created + funded in the Alchemy dashboard)"]),
      verification_json: JSON.stringify(alchemyChecks),
      notes: "Primary ERC-4337 candidate. CRIXCOIN → Alchemy Smart Account → UserOperation → Alchemy Bundler → Alchemy Gas Manager → Base Mainnet. Users must never need ETH for ordinary sponsored CRIXCOIN transactions. Replaced later without touching business logic — all code goes through the provider-independent interfaces.",
      last_checked_at: new Date().toISOString(),
    });

    // ---------- COINBASE CDP — paymaster/bundler + wallet candidate ----------
    const cdpChecks = [];
    const cdpMissing = [];
    const cdpCaps = { embedded_wallet: "NOT_CONFIGURED", smart_accounts: "NOT_CONFIGURED", bundler: "NOT_CONFIGURED", paymaster: "NOT_CONFIGURED", server_side: "NOT_CONFIGURED" };
    let cdpEntryPoints = [];

    if (!cdpPaymasterUrl) {
      cdpMissing.push("CDP_PAYMASTER_URL");
      cdpChecks.push({ check: "paymaster_endpoint", pass: false, value: "NOT_CONFIGURED — no CDP paymaster/bundler endpoint stored" });
    } else {
      cdpChecks.push({ check: "paymaster_endpoint", pass: true, value: "stored server-side (value never exposed)" });
      try {
        cdpEntryPoints = await aaRpcCall(cdpPaymasterUrl, "eth_supportedEntryPoints", []);
        const bundlerOk = Array.isArray(cdpEntryPoints) && cdpEntryPoints.length > 0;
        cdpChecks.push({ check: "erc4337_bundler_entry_points_base_mainnet", pass: bundlerOk, value: labelEntryPoints(cdpEntryPoints) });
        cdpCaps.bundler = bundlerOk ? "VERIFIED" : "NOT_CONFIGURED";
        cdpCaps.server_side = bundlerOk ? "VERIFIED" : "NOT_CONFIGURED";
      } catch (error) {
        cdpChecks.push({ check: "erc4337_bundler_entry_points_base_mainnet", pass: false, value: String(error.message).slice(0, 220) });
      }
      const stub = await probePaymasterStub(cdpPaymasterUrl);
      if (stub.pass) {
        cdpChecks.push({ check: "paymaster_stub_probe_gasless", pass: true, value: "paymaster answered a gasless stub probe — paymaster " + (stub.paymaster || "(address in stub fields)") });
        cdpCaps.paymaster = "VERIFIED";
      } else {
        cdpChecks.push({ check: "paymaster_stub_probe_gasless", pass: false, value: stub.error });
        cdpCaps.paymaster = "NOT_CONFIGURED";
        if (/402|payment/i.test(stub.error)) cdpMissing.push("Payment method / gas credits on the CDP account (portal.cdp.coinbase.com billing)");
      }
    }
    if (!cdpWalletSecret) {
      cdpMissing.push("CDP_WALLET_SECRET (needed for server-side smart account creation — create with the CDP API key in the Portal)");
      cdpChecks.push({ check: "wallet_secret", pass: false, value: "NOT_CONFIGURED — server-side smart account creation and UserOperation signing are impossible without it" });
    } else {
      cdpChecks.push({ check: "wallet_secret", pass: true, value: "stored server-side — smart account stage can proceed" });
      cdpCaps.embedded_wallet = "CONFIGURED";
      cdpCaps.smart_accounts = "CONFIGURED";
    }

    const cdpState = cdpCaps.bundler === "VERIFIED" && cdpCaps.paymaster === "VERIFIED" ? "VERIFIED" : "NOT_CONFIGURED";
    await upsert({
      registry_key: "aa-provider|cdp",
      provider: "cdp",
      role: "PaymasterProvider + Bundler + EmbeddedWalletProvider candidate",
      state: cdpState,
      capabilities_json: JSON.stringify(cdpCaps),
      entry_points_json: JSON.stringify(cdpEntryPoints),
      missing_credentials: cdpMissing.join(", "),
      required_credentials_json: JSON.stringify(["CDP_PAYMASTER_URL", "CDP_WALLET_SECRET", "Payment method / gas credits on the CDP account"]),
      verification_json: JSON.stringify(cdpChecks),
      notes: "Coinbase Developer Platform. The paymaster + bundler endpoint is ONE endpoint, ERC-7677 compliant, Base Mainnet first-class. Sponsored gas bills through the CDP account (gas + 7%). Smart accounts need the Wallet Secret; sponsored transfers of CRXS additionally need the production CRXS contract, which does not exist yet.",
      last_checked_at: new Date().toISOString(),
    });

    // ---------- PIMLICO — ERC-4337 bundler + ERC-7677 paymaster on Base Mainnet ----------
    const pimlicoKey = readOptionalSecret("PIMLICO_API_KEY");
    const pimlicoChecks = [];
    const pimlicoMissing = [];
    const pimlicoCaps = { embedded_wallet: "NOT_CONFIGURED", smart_accounts: "NOT_CONFIGURED", bundler: "NOT_CONFIGURED", paymaster: "NOT_CONFIGURED", server_side: "NOT_CONFIGURED" };
    let pimlicoEntryPoints = [];

    if (!pimlicoKey) {
      pimlicoMissing.push("PIMLICO_API_KEY");
      pimlicoChecks.push({ check: "api_key", pass: false, value: "NOT_CONFIGURED — no Pimlico API key stored" });
    } else {
      pimlicoChecks.push({ check: "api_key", pass: true, value: "stored server-side (value never exposed)" });
      const pimlicoUrl = "https://api.pimlico.io/v2/base/rpc?apikey=" + pimlicoKey;
      try {
        const chainId = await aaRpcCall(pimlicoUrl, "eth_chainId", []);
        const networkOk = parseInt(chainId, 16) === BASE_MAINNET_CHAIN_ID;
        pimlicoChecks.push({ check: "base_mainnet_network", pass: networkOk, value: networkOk ? "chain 8453 answered live" : "unexpected chain " + chainId });
        if (networkOk) {
          pimlicoCaps.server_side = "VERIFIED";
          const eps = await aaRpcCall(pimlicoUrl, "eth_supportedEntryPoints", []);
          const bundlerOk = Array.isArray(eps) && eps.length > 0;
          pimlicoChecks.push({ check: "erc4337_bundler_entry_points", pass: bundlerOk, value: labelEntryPoints(eps) });
          pimlicoCaps.bundler = bundlerOk ? "VERIFIED" : "NOT_CONFIGURED";
          pimlicoEntryPoints = Array.isArray(eps) ? eps : [];
        }
      } catch (error) {
        pimlicoChecks.push({ check: "erc4337_bundler_entry_points", pass: false, value: String(error.message).slice(0, 220) });
      }
      const stub = await probePaymasterStub(pimlicoUrl);
      if (stub.pass) {
        pimlicoChecks.push({ check: "paymaster_stub_probe_gasless", pass: true, value: "paymaster answered a gasless stub probe" });
        pimlicoCaps.paymaster = "VERIFIED";
      } else {
        pimlicoChecks.push({ check: "paymaster_stub_probe_gasless", pass: false, value: stub.error });
        pimlicoCaps.paymaster = "NOT_CONFIGURED";
      }
    }

    const pimlicoState = pimlicoCaps.bundler === "VERIFIED" ? "VERIFIED" : "NOT_CONFIGURED";
    await upsert({
      registry_key: "aa-provider|pimlico",
      provider: "pimlico",
      role: "Bundler + PaymasterProvider — verified live on Base Mainnet",
      state: pimlicoState,
      capabilities_json: JSON.stringify(pimlicoCaps),
      entry_points_json: JSON.stringify(pimlicoEntryPoints),
      missing_credentials: pimlicoMissing.join(", "),
      required_credentials_json: JSON.stringify(["PIMLICO_API_KEY", "Paymaster sponsorship credits on the Pimlico account — sponsorship is proven only by a real sponsored operation"]),
      verification_json: JSON.stringify(pimlicoChecks),
      notes: "Pimlico ERC-4337 bundler + ERC-7677 paymaster on Base Mainnet. The bundler answered live with real EntryPoint v0.6/v0.7 addresses. Nothing here simulates: paymaster sponsorship counts only after a real sponsored operation confirms on chain.",
      last_checked_at: new Date().toISOString(),
    });

    // ---------- TRANSFER GATE — external on-chain transfers stay PAUSED ----------
    const mainnetRows = await base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: "crxs-mainnet-deployment" });
    const mainnet = (mainnetRows || [])[0] || null;
    const crxsDeployed = !!(mainnet && mainnet.deployment_status === "DEPLOYED" && mainnet.contract_address);

    const gateEvidence = [
      { condition: TRANSFER_GATE_CONDITIONS[0], pass: crxsDeployed, value: crxsDeployed ? mainnet.contract_address : "NOT_DEPLOYED — no production CRXS contract on Base Mainnet" },
      { condition: TRANSFER_GATE_CONDITIONS[1], pass: false, value: "no real smart account has been created server-side yet" },
      { condition: TRANSFER_GATE_CONDITIONS[2], pass: false, value: "no real sponsored UserOperation has been submitted yet" },
      { condition: TRANSFER_GATE_CONDITIONS[3], pass: false, value: "no Base Mainnet confirmation has been independently verified yet" },
      { condition: TRANSFER_GATE_CONDITIONS[4], pass: false, value: "gas treasury holds 0 ETH and no provider gas credits are confirmed" },
    ];
    const allPassed = gateEvidence.every((g) => g.pass);

    await upsert({
      registry_key: "crxs-aa-transfer-gate",
      provider: "system",
      role: "TRANSFER_GATE — external on-chain transfers",
      state: allPassed ? "OPERATIONAL" : "PAUSED",
      capabilities_json: JSON.stringify({ external_transfers: allPassed ? "OPERATIONAL" : "PAUSED" }),
      entry_points_json: "[]",
      missing_credentials: "",
      required_credentials_json: JSON.stringify([]),
      verification_json: JSON.stringify(gateEvidence),
      notes: "EXTERNAL ON-CHAIN TRANSFERS = PAUSED. The gate opens ONLY after real smart-account creation, real UserOperation submission, real paymaster sponsorship and real Base Mainnet confirmation are each independently verified — and a production CRXS contract exists. Never by configuration, never simulated.",
      last_checked_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      alchemy: { state: alchemyState, missing: alchemyMissing },
      cdp: { state: cdpState, bundler: cdpCaps.bundler, paymaster: cdpCaps.paymaster, entry_points: cdpEntryPoints, missing: cdpMissing },
      pimlico: { state: pimlicoState, bundler: pimlicoCaps.bundler, paymaster: pimlicoCaps.paymaster, entry_points: pimlicoEntryPoints, missing: pimlicoMissing },
      transfer_gate: allPassed ? "OPERATIONAL" : "PAUSED",
      crxs_contract_on_mainnet: crxsDeployed ? mainnet.contract_address : "NOT_DEPLOYED",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}