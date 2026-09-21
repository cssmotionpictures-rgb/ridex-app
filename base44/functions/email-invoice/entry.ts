import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { emailInvoice } from "../../shared/invoice.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const id = body.invoice_id;
    if (!id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    const inv = await base44.asServiceRole.entities.Invoice.get(id);
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    const owner = user.role === 'admin' || inv.customer_id === user.id || (inv.customer_email && inv.customer_email === user.email);
    if (!owner) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const res = await emailInvoice(base44, id);
    return Response.json(res);
  } catch (error) {
    console.error('email-invoice error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}