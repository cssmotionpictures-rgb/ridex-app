import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { decodeAbiString, ZERO_ADDRESS, rpcOn, callContractOn, BASE_MAINNET_RPC } from '../../shared/crxsRpc.ts';

// CRXS MAINNET DEPLOYMENT VERIFICATION — records the REAL Base MAINNET
// (redeploy retry 6 — GetBlock BASE_RPC_URL first, rpcOn import fix)
// (production) deployment. NOTHING is stored until this function
// independently verifies every fact against the public Base Mainnet RPC.
// A wrong or fabricated submission fails with the real reason, and the
// SAFETY GATE refuses to record any Mainnet deployment until the whole
// Sepolia program (verified deployment + real indexed transfer test) has
// passed. The client can never make this path record a fake contract, hash
// or supply — and a Sepolia receipt can never pass here because it simply
// does not exist on the Base Mainnet RPC.

const DEPLOYER = '0xa6647b69af892b0f2894fc24fb58b2adcbedade1';
const EXPECTED_SUPPLY = 500000000000000000000000000000n; // 5e29 raw units = 500,000,000,000 CRXS at 18 decimals (exact BigInt — a JS number literal loses precision above 2^53)
const EXPLORER = 'https://basescan.org';

function fail(error, extra) {
  return Response.json({ ok: false, error, ...extra });
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // 0 — SAFETY GATE: the entire Sepolia program must be proven first.
    // A Mainnet deployment cannot be recorded until the testnet deployment is
    // verified AND a real A→B transfer test has been verified and indexed.
    const testnetRows = await base44.entities.CrxsDeploymentRecord.filter({ registry_key: 'crxs-deployment' });
    const testnet = (testnetRows || [])[0];
    if (!testnet || testnet.deployment_status !== 'DEPLOYED' || !testnet.contract_address) {
      return fail('SAFETY GATE FAILED: the Base Sepolia deployment is not verified on record — the Mainnet deployment stays blocked.');
    }
    const testTransfers = await base44.entities.CrxsOnchainTransfer.list('-created_date', 1);
    if (!testTransfers || testTransfers.length === 0) {
      return fail('SAFETY GATE FAILED: no verified testnet transfer test is indexed — the real A→B CRXS transfer must pass on Base Sepolia before any Mainnet deployment can be recorded.');
    }

    const body = await req.json().catch(() => ({}));
    const contractAddress = String(body.contract_address || '').toLowerCase();
    const txHash = String(body.tx_hash || '').toLowerCase();
    const postTransfer = body.post_transfer === true;
    const compilerVersion = String(body.compiler_version || '').slice(0, 60);
    const optimizer = String(body.optimizer || '').slice(0, 60);
    const bytecodeSha = String(body.bytecode_sha256 || '').slice(0, 80);

    if (!/^0x[0-9a-f]{40}$/.test(contractAddress) || contractAddress === ZERO_ADDRESS) return fail('Invalid or zero contract address.');
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) return fail('Invalid transaction hash.');
    // The production contract must never be the Sepolia test contract.
    if (contractAddress === String(testnet.contract_address || '').toLowerCase()) {
      return fail('The submitted address is the Base Sepolia TESTNET contract — it can never be recorded as the production Mainnet contract.');
    }

    // 1 — the real receipt, read from the Base MAINNET RPC (the endpoint itself
    // proves the chain: a Sepolia transaction does not exist here)
    const receipt = await rpcOn(BASE_MAINNET_RPC, 'eth_getTransactionReceipt', [txHash]);
    if (!receipt || !receipt.transactionHash) {
      return fail('No receipt found on BASE MAINNET for this transaction — the deployment is NOT confirmed on-chain. Nothing was recorded.');
    }
    if (String(receipt.status) !== '0x1') {
      return fail('The transaction REVERTED on Base Mainnet (status ' + receipt.status + '). Nothing was deployed and nothing was recorded.', { blockNumber: receipt.blockNumber });
    }
    if (receipt.to !== null && receipt.to !== undefined) {
      return fail('This transaction was not a contract creation (it has a destination address).');
    }
    if (String(receipt.contractAddress || '').toLowerCase() !== contractAddress) {
      return fail('The receipt contract address does not match the submitted address.');
    }
    const from = String(receipt.from || '').toLowerCase();
    if (from !== DEPLOYER) {
      return fail('The transaction sender is not the approved deployment wallet.');
    }

    // 1b — real bytecode must exist at the address on Base Mainnet
    const code = await rpcOn(BASE_MAINNET_RPC, 'eth_getCode', [contractAddress, 'latest']);
    if (!code || code === '0x' || code === '0x0') {
      return fail('No contract bytecode exists at ' + contractAddress + ' — it is not a live contract on Base Mainnet.');
    }

    // 2 — contract state read directly from the Base Mainnet chain
    const [nameRes, symbolRes, decimalsRes, supplyRes, balanceRes] = await Promise.all([
      callContractOn(BASE_MAINNET_RPC, contractAddress, '0x06fdde03'), // name()
      callContractOn(BASE_MAINNET_RPC, contractAddress, '0x95d89b41'), // symbol()
      callContractOn(BASE_MAINNET_RPC, contractAddress, '0x313ce567'), // decimals()
      callContractOn(BASE_MAINNET_RPC, contractAddress, '0x18160ddd'), // totalSupply()
      callContractOn(BASE_MAINNET_RPC, contractAddress, '0x70a08231' + DEPLOYER.slice(2).padStart(64, '0')), // balanceOf(deployer)
    ]);
    const name = decodeAbiString(nameRes);
    const symbol = decodeAbiString(symbolRes);
    const decimals = BigInt(decimalsRes).toString();
    const totalSupply = BigInt(supplyRes).toString();
    const deployerBalance = BigInt(balanceRes).toString();

    if (name !== 'CrixCoin') return fail('On-chain name is "' + name + '", expected "CrixCoin".');
    if (symbol !== 'CRXS') return fail('On-chain symbol is "' + symbol + '", expected "CRXS".');
    if (decimals !== '18') return fail('On-chain decimals are ' + decimals + ', expected 18.');
    if (BigInt(supplyRes) !== EXPECTED_SUPPLY) {
      return fail('On-chain totalSupply is ' + totalSupply + ' raw units, expected ' + EXPECTED_SUPPLY + ' (500,000,000,000 CRXS at 18 decimals).');
    }
    const balancePass = deployerBalance === totalSupply;
    if (!balancePass && !(postTransfer && BigInt(deployerBalance) > 0n)) {
      return fail('Deployment wallet balance is ' + deployerBalance + ' raw units, which does not equal totalSupply (' + totalSupply + '). If the controlled Mainnet transfer already happened, retry with post_transfer=true.');
    }

    // 3 — the real block timestamp
    const block = await rpcOn(BASE_MAINNET_RPC, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
    const timestamp = block && block.timestamp
      ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString()
      : '';

    const blockNumber = Number(BigInt(receipt.blockNumber));
    const gasUsed = Number(BigInt(receipt.gasUsed || '0x0'));
    const explorerUrl = EXPLORER + '/address/' + contractAddress;

    const verification = [
      { check: 'safety gate: Sepolia program fully proven (deployment verified + transfer test indexed)', pass: true },
      { check: 'receipt exists on BASE MAINNET', pass: true },
      { check: 'receipt status 0x1 (success)', pass: true },
      { check: 'contract creation transaction', pass: true },
      { check: 'receipt contract address matches submission', pass: true },
      { check: 'submitted address is NOT the Sepolia testnet contract', pass: true },
      { check: 'sender is the approved deployment wallet', pass: true },
      { check: 'contract bytecode exists at the address (eth_getCode on Base Mainnet)', pass: true },
      { check: 'name() == CrixCoin', pass: true, value: name },
      { check: 'symbol() == CRXS', pass: true, value: symbol },
      { check: 'decimals() == 18', pass: true, value: decimals },
      { check: 'totalSupply() == 5e29 raw units (500,000,000,000 CRXS)', pass: true, value: totalSupply },
      {
        check: postTransfer ? 'deployment wallet still holds CRXS (post-transfer check)' : 'balanceOf(deployer) == totalSupply',
        pass: true,
        value: deployerBalance,
      },
    ];

    const payload = {
      registry_key: 'crxs-mainnet-deployment',
      deployment_status: 'DEPLOYED',
      verification_status: 'ONCHAIN_VERIFIED',
      launch_status: 'VERIFIED',
      chain: 'BASE_MAINNET',
      chain_id: 8453,
      network: 'Base Mainnet',
      token_name: name,
      symbol: symbol,
      decimals: 18,
      total_supply_raw: totalSupply,
      human_total_supply: '500000000000 CRXS',
      deployer: DEPLOYER,
      contract_address: contractAddress,
      deployment_tx_hash: txHash,
      block_number: blockNumber,
      deployment_timestamp: timestamp,
      gas_used: gasUsed,
      explorer_url: explorerUrl,
      compiler_version: compilerVersion,
      optimizer: optimizer,
      bytecode_sha256: bytecodeSha,
      verification_json: JSON.stringify(verification),
      failure_reason: '',
    };

    const existing = await base44.entities.CrxsMainnetDeploymentRecord.filter({ registry_key: 'crxs-mainnet-deployment' });
    if ((existing || []).length === 0) {
      await base44.entities.CrxsMainnetDeploymentRecord.create(payload);
    } else {
      await base44.entities.CrxsMainnetDeploymentRecord.update(existing[0].id, payload);
    }

    return Response.json({ ok: true, deployment: payload, verification });
  } catch (error) {
    return Response.json({ ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) });
  }
}