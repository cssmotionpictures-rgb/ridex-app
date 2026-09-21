import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { createInvoiceFromTransaction } from "../../shared/invoice.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const txId = body.transaction_id;
    if (!txId) return Response.json({ error: 'transaction_id required' }, { status: 400 });
    const tx = await base44.asServiceRole.entities.Transaction.get(txId);
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
    const allowed = user.role === 'admin' || tx.created_by_id === user.id;
    if (!allowed) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const inv = await createInvoiceFromTransaction(base44, {
      tx,
      userId: body.userId || tx.created_by_id || '',
      userName: body.userName || user.full_name || '',
      issuedBy: user.role === 'admin' ? `admin:${user.email}` : 'system:checkout',
    });
    return Response.json({ invoice: inv });
  } catch (error) {
    console.error('create-invoice error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}