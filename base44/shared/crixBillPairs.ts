// Double-entry ledger pair writers shared by every Sogo-backed money flow
// (bill payments, betting funding, webhook reconciliation). Every debit equals
// its credits; refunds are reversing pairs — never edits of the settled pair.

import { roundMoney } from "./crixCore.ts";

export type PairParams = {
  key: string;
  userId: string;
  amount: number;
  fee: number;
  memo: string;
  creditAccount: string;
};

// Settled pair: user NGN debited (amount + fee), provider account credited the
// amount, platform revenue credited the fee.
export async function writeSettledPair(svc: any, p: PairParams): Promise<string> {
  const pair = p.key + "|P1";
  const total = roundMoney(p.amount + p.fee);
  await svc.entities.CrixLedgerEntry.bulkCreate([
    { entry_key: p.key + "|D1", crix_id: p.key, pair_key: pair, account: "user:" + p.userId + ":NGN", user_id: p.userId, direction: "debit", amount: total, memo: p.memo },
    { entry_key: p.key + "|C1", crix_id: p.key, pair_key: pair, account: p.creditAccount, user_id: "", direction: "credit", amount: p.amount, memo: p.memo },
    ...(p.fee > 0 ? [{ entry_key: p.key + "|C2", crix_id: p.key, pair_key: pair, account: "revenue:fees:NGN", user_id: "", direction: "credit", amount: p.fee, memo: "Bill payment fee" }] : []),
  ]);
  return pair;
}

// Reversing pair: the settled pair runs backwards, the user wallet is credited
// the full debit (amount + fee).
export async function writeRefundPair(svc: any, p: PairParams): Promise<string> {
  const pair = p.key + "|P2";
  const total = roundMoney(p.amount + p.fee);
  await svc.entities.CrixLedgerEntry.bulkCreate([
    { entry_key: p.key + "|R1", crix_id: p.key, pair_key: pair, account: p.creditAccount, user_id: "", direction: "debit", amount: p.amount, memo: p.memo },
    ...(p.fee > 0 ? [{ entry_key: p.key + "|R2", crix_id: p.key, pair_key: pair, account: "revenue:fees:NGN", user_id: "", direction: "debit", amount: p.fee, memo: "Bill payment fee reversal" }] : []),
    { entry_key: p.key + "|R3", crix_id: p.key, pair_key: pair, account: "user:" + p.userId + ":NGN", user_id: p.userId, direction: "credit", amount: total, memo: "Refund — " + p.memo },
  ]);
  return pair;
}

// The credit account for a settled bill — betting top-ups balance through
// their own account, everything else through bills.
export function creditAccountForCategory(category: string): string {
  return String(category || "").toUpperCase() === "BETTING" ? "betting:paid:NGN" : "bills:paid:NGN";
}