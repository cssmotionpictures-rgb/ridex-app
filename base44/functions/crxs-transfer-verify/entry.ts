// CRXS TRANSFER VERIFICATION + INDEXER — records a REAL CRXS Transfer event
// from Base Sepolia into the CrxsOnchainTransfer indexer ledger. NOTHING is
// stored until this function independently verifies the facts against the
// public RPC: the receipt, the recorded contract address (never the zero
// address or a placeholder), the Transfer event, the sender, and the
// recipient's on-chain balance. A wrong or fabricated submission fails with
// the real reason.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { rpc, callContract, decodeTransferLog, TRANSFER_TOPIC, ZERO_ADDRESS } from '../../shared/crxsRpc.ts';

const DEPLOYER = '0xa6647b69af892b0f2894fc24fb58b2adcbedade1';

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
    const txHash = String(body.tx_hash || '').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) return fail('Invalid transaction hash.');

    // 1 — the ONLY allowed contract address source is the recorded deployment
    const records = await base44.entities.CrxsDeploymentRecord.filter({ registry_key: 'crxs-deployment' });
    const record = (records || [])[0];
    const contractAddress = String(record && record.contract_address ? record.contract_address : '').toLowerCase();
    if (!record || record.deployment_status !== 'DEPLOYED' || !/^0x[0-9a-f]{40}$/.test(contractAddress) || contractAddress === ZERO_ADDRESS) {
      return fail('No verified CRXS deployment on record — the indexer refuses zero or placeholder contract addresses.');
    }

    // 2 — the real receipt, read from the chain
    const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (!receipt || !receipt.transactionHash) {
      return fail('No receipt found on Base Sepolia for this transaction — the transfer is NOT confirmed on-chain. Nothing was indexed.');
    }
    if (String(receipt.status) !== '0x1') {
      return fail('The transfer transaction REVERTED on-chain (status ' + receipt.status + '). Nothing was indexed.');
    }
    // MetaMask may route the send through its transaction relay, so the raw
    // destination can be the relayer contract instead of the token contract.
    // The token contract ITSELF emitting a Transfer from the approved deployment
    // wallet is the cryptographic evidence — the deployer's tokens cannot move
    // without the deployer's authorization, no matter who submitted the tx.
    const txDestination = String(receipt.to || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(txDestination) || txDestination === ZERO_ADDRESS) {
      return fail('The transaction has no valid destination — refused.');
    }
    const directToContract = txDestination === contractAddress;

    // 3 — the Transfer event, decoded from real logs emitted by the CRXS contract
    const logs = (receipt.logs || []).filter(
      (l) => String(l.address || '').toLowerCase() === contractAddress &&
             String((l.topics || [])[0] || '').toLowerCase() === TRANSFER_TOPIC
    );
    if (logs.length === 0) return fail('No Transfer event found in the transaction logs for the CRXS contract.');
    const log = logs.find((l) => {
      const ev = decodeTransferLog(l);
      return ev && ev.from === DEPLOYER && ev.to !== ZERO_ADDRESS;
    });
    const event = decodeTransferLog(log);
    if (!event) return fail('No Transfer from the approved deployment wallet found in the transaction logs — the deployment wallet\'s tokens cannot move without its authorization.');
    if (event.from === ZERO_ADDRESS || event.to === ZERO_ADDRESS) {
      return fail('Zero address in the Transfer event — refused. (The zero address only legitimately appears as the sender of the initial mint Transfer, which is not indexed as a transfer.)');
    }

    // 4 — contract state read directly from the chain
    const balanceRes = await callContract(contractAddress, '0x70a08231' + event.to.slice(2).padStart(64, '0'));
    const recipientBalance = BigInt(balanceRes).toString();
    if (BigInt(recipientBalance) < BigInt(event.amountRaw)) {
      return fail('Recipient balance on-chain (' + recipientBalance + ') is smaller than the transferred amount (' + event.amountRaw + ') — verification failed.');
    }

    const blockNumber = Number(BigInt(receipt.blockNumber));
    const logIndex = Number(BigInt(event.logIndex || '0x0'));
    const eventKey = 'crxs-transfer|' + txHash + '|' + logIndex;

    const payload = {
      event_key: eventKey,
      contract_address: contractAddress,
      tx_hash: txHash,
      block_number: blockNumber,
      from_address: event.from,
      to_address: event.to,
      amount_raw: event.amountRaw,
      amount_display: (BigInt(event.amountRaw) / 10n ** 18n).toString() + ' CRXS',
      verified_json: JSON.stringify([
        { check: 'receipt exists on Base Sepolia', pass: true },
        { check: 'receipt status 0x1 (success)', pass: true },
        { check: directToContract ? 'destination is the recorded CRXS contract' : 'send routed via relay — CRXS contract Transfer event verified in logs', pass: true, value: txDestination },
        { check: 'Transfer event present in logs', pass: true },
        { check: 'sender is the approved deployment wallet', pass: true, value: event.from },
        { check: 'no zero address in the event', pass: true },
        { check: 'recipient balance includes the transferred amount', pass: true, value: recipientBalance },
      ]),
      indexed_at: new Date().toISOString(),
    };

    const existing = await base44.entities.CrxsOnchainTransfer.filter({ event_key: eventKey });
    if ((existing || []).length === 0) {
      await base44.entities.CrxsOnchainTransfer.create(payload);
    }
    return Response.json({ ok: true, transfer: payload, duplicate: (existing || []).length > 0 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) });
  }
}