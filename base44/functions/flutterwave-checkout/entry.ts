import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { preparePendingTransaction } from '../../shared/paystackCheckout.ts';
import { flwV3Request } from '../../shared/flutterwaveV3.ts';

// FLUTTERWAVE HOSTED CHECKOUT — Stripe and Paystack are retired; every hosted
// payment now runs on Flutterwave. The pending Transaction is created through
// the same shared preparation as every other rail, then the customer is handed
// a Flutterwave payment link. Settlement is authoritative in the Flutterwave
// webhook (signature + provider re-verification); the `settle` action below is
// the verify-on-return fallback — the browser claim is NEVER trusted, the
// charge is re-verified at the provider before any money state changes.

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'pay');

    if (action === 'pay') {
      const pre = await preparePendingTransaction(base44, body);
      if (pre.error) return Response.json({ error: pre.error }, { status: 400 });
      const { p, tx, charged, reference, promoId, discount } = pre;
      if (charged <= 0) {
        await base44.asServiceRole.entities.Transaction.update(tx.id, { status: 'failed' }).catch(() => {});
        return Response.json({ error: 'A 100% discount cannot be charged on the payment page — confirm the free item instead.' }, { status: 400 });
      }

      const origin = req.headers.get('origin') || 'https://ridex-all-go.base44.app';
      const callbackUrl = `${origin}/payment-success?service=${encodeURIComponent(p.service)}&ref=${encodeURIComponent(p.referenceId || tx.id)}&flw_tx=${tx.id}`;

      const res = await flwV3Request('POST', '/v3/payments', {
        tx_ref: reference,
        amount: charged,
        currency: p.currency,
        redirect_url: callbackUrl,
        customer: { email: p.email, ...(p.userName ? { name: p.userName } : {}) },
        customizations: { title: 'Ride X', description: String(p.description).slice(0, 100) },
        meta: {
          transaction_id: tx.id,
          service: p.service,
          reference_id: p.referenceId,
          promo_code_id: promoId || '',
          discount,
          commission: p.commission,
          user_id: p.userId,
          user_name: p.userName,
        },
      });
      const link = res.ok && res.json && res.json.status && res.json.data ? res.json.data.link : '';
      if (!link) {
        await base44.asServiceRole.entities.Transaction.update(tx.id, { status: 'failed' }).catch(() => {});
        console.error('flutterwave-checkout init failed:', JSON.stringify(res.json).slice(0, 400));
        return Response.json({ error: (res.json && res.json.message) || 'Flutterwave initialization failed' }, { status: 502 });
      }
      return Response.json({ url: link, reference, transaction_id: tx.id });
    }

    if (action === 'settle') {
      // Redirect-return settlement for hosted payments. FLW appends tx_ref to
      // the callback URL — but the status there is just a claim, so the charge
      // is re-verified against the v3 API before anything is marked paid.
      const txId = String(body.transaction_id || '');
      const txRef = String(body.tx_ref || '').slice(0, 100);
      if (!/^[a-f0-9]{16,40}$/i.test(txId) || !txRef) return Response.json({ error: 'Invalid settlement request' }, { status: 400 });
      const tx = await base44.asServiceRole.entities.Transaction.get(txId).catch(() => null);
      if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
      if (tx.status === 'paid') return Response.json({ ok: true, paid: true });

      const v = await flwV3Request('GET', '/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(txRef));
      const d = v.json && v.json.data;
      if (v.ok && d && String(d.status) === 'successful' && Number(d.amount) >= Number(tx.amount || 0)) {
        const gwRef = String(d.id || '');
        if (tx.gateway_reference && tx.gateway_reference === gwRef) {
          return Response.json({ ok: true, paid: true, duplicate: true });
        }
        await base44.asServiceRole.entities.Transaction.update(txId, {
          status: 'paid',
          escrow_status: 'held',
          platform_fee_settled: true,
          settled_to_opay: false,
          gateway_reference: gwRef,
        });
        return Response.json({ ok: true, paid: true });
      }
      return Response.json({ ok: true, paid: false, status: d ? String(d.status) : 'unknown' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('flutterwave-checkout error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}