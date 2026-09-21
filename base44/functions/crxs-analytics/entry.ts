import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// CRXS INTERNAL-LEDGER ANALYTICS — admin-only aggregation over the REAL internal
// Crix ledger (CrixWallet / CrixTransaction / CrixLedgerEntry).
// Every figure returned is internal-ledger data. This function NEVER claims
// blockchain data: CRXS is PRE-LAUNCH and no blockchain exists.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [wallets, txs, entries] = await Promise.all([
      base44.asServiceRole.entities.CrixWallet.list('-created_date', 1000),
      base44.asServiceRole.entities.CrixTransaction.list('-created_date', 500),
      base44.asServiceRole.entities.CrixLedgerEntry.list('-created_date', 500),
    ]);

    // Wallet balances per currency (available + reserved), distinct users.
    const byCurrency: any = {};
    const walletUsers = new Set();
    for (const w of wallets as any[]) {
      walletUsers.add(w.user_id);
      const c = (byCurrency[w.currency] = byCurrency[w.currency] || { currency: w.currency, available: 0, reserved: 0, wallets: 0 });
      c.available += Number(w.available || 0);
      c.reserved += Number(w.reserved || 0);
      c.wallets++;
    }

    // Transfer stats + daily completed series + today's completed volume per currency.
    const ACTIVE = ['REQUESTED', 'VALIDATED', 'RESERVED', 'PROCESSING', 'UNKNOWN'];
    const statusCounts: any = {};
    let active = 0, completed = 0;
    const daily: any = {};
    const today = new Date().toISOString().slice(0, 10);
    const volumeToday: any = {};
    for (const t of txs as any[]) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      if (ACTIVE.includes(t.status)) active++;
      if (t.status === 'COMPLETED') {
        completed++;
        const day = String(t.created_date || '').slice(0, 10);
        daily[day] = (daily[day] || 0) + 1;
        if (day === today) volumeToday[t.currency] = (volumeToday[t.currency] || 0) + Number(t.amount || 0);
      }
    }

    // Double-entry credits/debits (audit trail size).
    let credits = 0, debits = 0;
    for (const e of entries as any[]) {
      if (e.direction === 'credit') credits++; else debits++;
    }

    // Last 14 days series.
    const dailySeries: any[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailySeries.push({ day: d.slice(5), completed: daily[d] || 0 });
    }

    return Response.json({
      note: 'INTERNAL LEDGER DATA - NOT BLOCKCHAIN DATA. CRXS is PRE-LAUNCH: no blockchain, contract or market exists.',
      generated_at: new Date().toISOString(),
      totals: {
        wallets: (wallets as any[]).length,
        walletUsers: walletUsers.size,
        transactions: (txs as any[]).length,
        activeTransfers: active,
        completedTransfers: completed,
        ledgerEntries: (entries as any[]).length,
        credits,
        debits,
        truncatedTransactions: (txs as any[]).length === 500,
        truncatedEntries: (entries as any[]).length === 500,
      },
      balances: Object.values(byCurrency).sort((a: any, b: any) => b.wallets - a.wallets),
      statusCounts,
      volumeToday,
      dailySeries,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}