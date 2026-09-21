import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

// CRIX ADMIN LEDGER — the read-only admin window over ALL Crix money movement:
// internal-ledger transactions (including real NGN deposits) and both on-chain
// CRXS transfer rails (Base Sepolia testnet + Base Mainnet sponsored).
// Admin-authenticated. It never mutates money state — money only moves through
// the settlement engine, never through a view.

const tx = (t) => ({
  id: t.id,
  crix_id: t.crix_id,
  type: t.type,
  status: t.status,
  risk_state: t.risk_state,
  sender_id: t.sender_id,
  sender_email: t.sender_email,
  recipient_email: t.recipient_email,
  currency: t.currency,
  amount: t.amount,
  fee_total: t.fee_total,
  provider: t.provider,
  provider_ref: t.provider_ref,
  ledger_pair: t.ledger_pair,
  note: t.note,
  created_date: t.created_date,
});

const ledger = (l) => ({
  entry_key: l.entry_key,
  crix_id: l.crix_id,
  pair_key: l.pair_key,
  account: l.account,
  direction: l.direction,
  amount: l.amount,
  memo: l.memo,
  created_date: l.created_date,
});

const onchain = (r) => ({
  id: r.id,
  transfer_key: r.transfer_key,
  from_user_id: r.from_user_id,
  to_address: r.to_address,
  amount_raw: r.amount_raw,
  state: r.state || r.status,
  provider: r.provider,
  gas_mode: r.gas_mode,
  tx_hash: r.tx_hash,
  created_date: r.created_date,
});

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admins only" }, { status: 403 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "overview");
    if (action !== "overview") return Response.json({ error: "Unknown action" }, { status: 400 });

    // Bounded read-only windows — summaries are labelled "recent window" in the
    // UI so no all-time total is ever implied from a bounded list.
    const [deposits, transactions, ledgerEntries, sepolia, sponsored] = await Promise.all([
      svc.entities.CrixTransaction.filter({ type: "wallet_funding" }, "-created_date", 200),
      svc.entities.CrixTransaction.list("-created_date", 200),
      svc.entities.CrixLedgerEntry.list("-created_date", 100),
      svc.entities.CrxsSepoliaTransfer.list("-created_date", 50),
      svc.entities.CrxsSponsoredTransfer.list("-created_date", 50),
    ]);

    return Response.json({
      deposits: (deposits || []).map(tx),
      transactions: (transactions || []).map(tx),
      ledger_entries: (ledgerEntries || []).map(ledger),
      onchain_sepolia: (sepolia || []).map(onchain),
      onchain_sponsored: (sponsored || []).map(onchain),
      window_note: "Shows the most recent 200 transactions, 100 ledger entries and 50 transfers per on-chain rail.",
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}