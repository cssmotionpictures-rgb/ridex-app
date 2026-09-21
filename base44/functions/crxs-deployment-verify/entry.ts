import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { rpc, callContract, decodeAbiString, ZERO_ADDRESS } from '../../shared/crxsRpc.ts';

// CRXS DEPLOYMENT VERIFICATION — records the REAL Base Sepolia deployment.
// NOTHING is stored until this function independently verifies every fact
// against the public Base Sepolia RPC: the receipt, the contract address, the
// deployer, the bytecode at the address, and name()/symbol()/decimals()/
// totalSupply()/balanceOf() read straight from the deployed contract. A wrong
// or fabricated submission fails with the real reason — the client can never
// make this path record a fake contract, hash or supply.

const DEPLOYER = '0xa6647b69af892b0f2894fc24fb58b2adcbedade1';
const EXPECTED_SUPPLY = 500000000000000000000000000000n; // 5e29 raw units = 500,000,000,000 CRXS at 18 decimals (exact BigInt — a JS number literal loses precision above 2^53)
const EXPLORER = 'https://sepolia.basescan.org';

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

    const body = await req.json().catch(() => ({}));
    const contractAddress = String(body.contract_address || '').toLowerCase();
    const txHash = String(body.tx_hash || '').toLowerCase();
    const postTransfer = body.post_transfer === true;
    const compilerVersion = String(body.compiler_version || '').slice(0, 60);
    const optimizer = String(body.optimizer || '').slice(0, 60);
    const bytecodeSha = String(body.bytecode_sha256 || '').slice(0, 80);

    if (!/^0x[0-9a-f]{40}$/.test(contractAddress) || contractAddress === ZERO_ADDRESS) return fail('Invalid or zero contract address.');
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) return fail('Invalid transaction hash.');

    // 1 — the real receipt, read from the chain
    const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (!receipt || !receipt.transactionHash) {
      return fail('No receipt found on Base Sepolia for this transaction — the deployment is NOT confirmed on-chain. Nothing was recorded.');
    }
    if (String(receipt.status) !== '0x1') {
      return fail('The transaction REVERTED on-chain (status ' + receipt.status + '). Nothing was deployed and nothing was recorded.', { blockNumber: receipt.blockNumber });
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

    // 1b — real bytecode must exist at the address on this chain
    const code = await rpc('eth_getCode', [contractAddress, 'latest']);
    if (!code || code === '0x' || code === '0x0') {
      return fail('No contract bytecode exists at ' + contractAddress + ' — it is not a live contract on Base Sepolia.');
    }

    // 2 — contract state read directly from the chain
    const [nameRes, symbolRes, decimalsRes, supplyRes, balanceRes] = await Promise.all([
      callContract(contractAddress, '0x06fdde03'), // name()
      callContract(contractAddress, '0x95d89b41'), // symbol()
      callContract(contractAddress, '0x313ce567'), // decimals()
      callContract(contractAddress, '0x18160ddd'), // totalSupply()
      callContract(contractAddress, '0x70a08231' + DEPLOYER.slice(2).padStart(64, '0')), // balanceOf(deployer)
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
      return fail('Deployment wallet balance is ' + deployerBalance + ' raw units, which does not equal totalSupply (' + totalSupply + '). If the small test transfer already happened, retry with post_transfer=true.');
    }

    // 3 — the real block timestamp
    const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
    const timestamp = block && block.timestamp
      ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString()
      : '';

    const blockNumber = Number(BigInt(receipt.blockNumber));
    const gasUsed = Number(BigInt(receipt.gasUsed || '0x0'));
    const explorerUrl = EXPLORER + '/address/' + contractAddress;

    const verification = [
      { check: 'receipt exists on Base Sepolia', pass: true },
      { check: 'receipt status 0x1 (success)', pass: true },
      { check: 'contract creation transaction', pass: true },
      { check: 'receipt contract address matches submission', pass: true },
      { check: 'sender is the approved deployment wallet', pass: true },
      { check: 'contract bytecode exists at the address (eth_getCode)', pass: true },
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
      registry_key: 'crxs-deployment',
      deployment_status: 'DEPLOYED',
      verification_status: 'ONCHAIN_VERIFIED',
      chain: 'BASE_SEPOLIA',
      chain_id: 84532,
      network: 'Base Sepolia',
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

    const existing = await base44.entities.CrxsDeploymentRecord.filter({ registry_key: 'crxs-deployment' });
    if ((existing || []).length === 0) {
      await base44.entities.CrxsDeploymentRecord.create(payload);
    } else {
      await base44.entities.CrxsDeploymentRecord.update(existing[0].id, payload);
    }

    return Response.json({ ok: true, deployment: payload, verification });
  } catch (error) {
    return Response.json({ ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) });
  }
}