import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { roundMoney, getOrCreateWallet } from "../../shared/crixCore.ts";
import { assertNotPaused, appendAudit } from "../../shared/crixGuards.ts";
import { recordCrixPayment } from "../../shared/crixSheets.ts";

// SYMBIOTIC RESTORATION REWARDS — the loyalty engine that automatically
// grants Naira bonuses from the user's REAL recorded activity (bill
// payments, betting top-ups, dollar cards, crix-to-crix sends).
//
// Money rules (none skippable):
//   1. HONEST BASIS — a bonus is computed ONLY from settled records
//      (paid bills, issued cards, COMPLETED transfers). Nothing is ever
//      estimated or promised from thin air.
//   2. NO MINTING — rewards are Naira wallet credits funded from platform
//      fee revenue through the double-entry ledger. No token is ever
//      minted or created for rewards (CRXS supply stays fixed at 500B).
//   3. IDEMPOTENCY — reward_key = symbio|<user>|<YYYY-MM>: one grant per
//      user per month, forever. A retry returns the original row.
//   4. DOUBLE-ENTRY — every grant balances: platform rewards account
//      debited, user wallet credited, same amount, same pair.
//   5. COMPENSATION — if the ledger pair fails after the wallet credit,
//      the credit is reversed so money is never created without its record.
//
// Actions:
//   me   — settles any unclaimed previous-month bonus automatically, then
//          returns the user's current-month progress and reward history
//   run  — admin/scheduled batch settle for every NGN wallet holder (idempotent)

const TIERS = [
  { id: "symbiosis", label: "Symbiosis", min: 2000000, pct: 1 },
  { id: "canopy", label: "Canopy", min: 500000, pct: 0.75 },
  { id: "branch", label: "Branch", min: 100000, pct: 0.5 },
  { id: "root", label: "Root", min: 10000, pct: 0.25 },
];
const MAX_BONUS_NGN = 5000; // monthly cap — honest and funded from fee revenue
const MIN_BONUS_NGN = 50;
const REWARDS_ACCOUNT = "symbiotic:rewards:NGN"; // platform-funded expense account

// Lagos is UTC+1 — shift the clock so period boundaries follow local months.
function lagosMonthStart(offset: number): string {
  const now = new Date(Date.now() + 3600000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 10);
}
function monthKey(offset: number): string {
  return lagosMonthStart(offset).slice(0, 7);
}

// The honest activity basis for one calendar month, from settled records only.
async function periodStats(svc: any, userId: string, offset: number) {
  const start = lagosMonthStart(offset);
  const end = lagosMonthStart(offset - 1);
  const inPeriod = (d: any) => { const s = String(d || ""); return s >= start && s < end; };

  let volume = 0;
  let count = 0;
  const days = new Set<string>();
  const sources: any[] = [];

  const bills = await svc.entities.CrixBillPayment.filter({ user_id: userId });
  for (const b of bills || []) {
    if (b.status !== "paid" || !inPeriod(b.created_date)) continue;
    const v = Number(b.amount_ngn || 0) + Number(b.fee_total || 0);
    volume += v; count++;
    days.add(String(b.created_date || "").slice(0, 10));
    sources.push({ source: "bill_payment", amount: v });
  }

  const cards = await svc.entities.CrixDollarCard.filter({ user_id: userId });
  for (const c of cards || []) {
    if (!["issued", "active"].includes(c.status) || !inPeriod(c.created_date)) continue;
    const v = Number(c.total_debit_ngn || 0);
    volume += v; count++;
    days.add(String(c.created_date || "").slice(0, 10));
    sources.push({ source: "dollar_card", amount: v });
  }

  const txs = await svc.entities.CrixTransaction.filter({ sender_id: userId });
  for (const t of txs || []) {
    if (t.status !== "COMPLETED" || t.type !== "crix_to_crix" || !inPeriod(t.created_date)) continue;
    const v = Number(t.amount || 0) + Number(t.fee_total || 0);
    volume += v; count++;
    days.add(String(t.created_date || "").slice(0, 10));
    sources.push({ source: "crix_transfer", amount: v });
  }

  volume = roundMoney(volume);
  const tier = TIERS.find((t) => volume >= t.min) || null;
  let bonus = 0;
  if (tier) {
    bonus = Math.min(MAX_BONUS_NGN, Math.max(MIN_BONUS_NGN, roundMoney((volume * tier.pct) / 100)));
  }
  return {
    period: monthKey(offset),
    start,
    end,
    volume_ngn: volume,
    activity_days: days.size,
    tx_count: count,
    tier: tier ? tier.id : "none",
    tier_label: tier ? tier.label : "Seed",
    tier_pct: tier ? tier.pct : 0,
    bonus_ngn: bonus,
    sources: sources.slice(0, 50),
  };
}

// Grant one reward — idempotent, double-entry, compensated on ledger failure.
async function grantReward(svc: any, userId: string, stats: any) {
  if (!stats || stats.bonus_ngn <= 0) return { granted: false, reason: "not eligible this period" };

  const rewardKey = "symbio|" + userId + "|" + stats.period;
  const prior = await svc.entities.SymbioticReward.filter({ reward_key: rewardKey });
  if (prior && prior.length) return { granted: false, duplicate: true, reward: prior[0] };

  const pause = await assertNotPaused(svc, "reward_grant");
  if (pause.blocked) return { granted: false, reason: pause.reason };

  const wallet = await getOrCreateWallet(svc, userId, "NGN");
  const before = Number(wallet.available || 0);
  await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: stats.bonus_ngn } });
  const after = await svc.entities.CrixWallet.get(wallet.id);
  if ((Number(after.available) || 0) <= before) {
    return { granted: false, reason: "the credit could not be applied — nothing was granted" };
  }

  try {
    const pairKey = rewardKey + "|P1";
    await svc.entities.CrixLedgerEntry.bulkCreate([
      { entry_key: rewardKey + "|D1", crix_id: rewardKey, pair_key: pairKey, account: REWARDS_ACCOUNT, user_id: "", direction: "debit", amount: stats.bonus_ngn, memo: "Symbiotic loyalty bonus — " + stats.period + " (" + stats.tier_label + ")" },
      { entry_key: rewardKey + "|C1", crix_id: rewardKey, pair_key: pairKey, account: "user:" + userId + ":NGN", user_id: userId, direction: "credit", amount: stats.bonus_ngn, memo: "Symbiotic loyalty bonus — " + stats.period },
    ]);
    const rec = await svc.entities.SymbioticReward.create({
      reward_key: rewardKey, user_id: userId, period: stats.period, tier: stats.tier,
      volume_ngn: stats.volume_ngn, activity_days: stats.activity_days, tx_count: stats.tx_count,
      bonus_ngn: stats.bonus_ngn, status: "granted", ledger_pair: pairKey, failure_reason: "",
      evidence_json: JSON.stringify({ period: stats.period, window: stats.start + " to " + stats.end, volume_sources: stats.sources, tier: stats.tier_label, tier_pct: stats.tier_pct, funded_from: "platform fee revenue — no tokens minted" }),
    });
    await appendAudit(svc, {
      operation: "symbiotic_reward", user_id: userId, transaction_id: rewardKey, idempotency_key: rewardKey,
      old_state: "ELIGIBLE", new_state: "GRANTED", asset: "NGN", amount: stats.bonus_ngn,
      actor: "symbiotic-rewards", reason: "loyalty bonus — " + stats.tier_label + " tier on " + stats.volume_ngn + " activity for " + stats.period,
    }).catch(() => {});
    return { granted: true, reward: rec };
  } catch (ledgerError: any) {
    // COMPENSATION — never leave a credit without its ledger record
    await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: -stats.bonus_ngn } }).catch(() => {});
    await svc.entities.SymbioticReward.create({
      reward_key: rewardKey, user_id: userId, period: stats.period, tier: stats.tier,
      volume_ngn: stats.volume_ngn, activity_days: stats.activity_days, tx_count: stats.tx_count,
      bonus_ngn: stats.bonus_ngn, status: "failed", ledger_pair: "",
      failure_reason: String((ledgerError && ledgerError.message) || ledgerError).slice(0, 200),
      evidence_json: JSON.stringify({ note: "wallet credit was reversed — no money was created without its record" }),
    }).catch(() => {});
    return { granted: false, reason: "the ledger pair failed — the credit was reversed, nothing was lost" };
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "me");

    // ---- ME — automatic settle + live progress ----
    if (action === "me") {
      const prev = await periodStats(svc, user.id, 1);
      const settle = await grantReward(svc, user.id, prev);
      const current = await periodStats(svc, user.id, 0);
      const history = await svc.entities.SymbioticReward.filter({ user_id: user.id }, "-created_date", 10);
      const wallet = await getOrCreateWallet(svc, user.id, "NGN");
      return Response.json({
        current,
        previous: prev,
        settled_now: settle.granted ? { period: prev.period, tier: prev.tier, bonus_ngn: prev.bonus_ngn } : null,
        balance_ngn: Number(wallet.available || 0),
        rewards: (history || []).map((r) => ({
          period: r.period, tier: r.tier, volume_ngn: r.volume_ngn, activity_days: r.activity_days,
          bonus_ngn: r.bonus_ngn, status: r.status, granted_at: r.created_date,
        })),
      });
    }

    // ---- RUN — admin/scheduled batch settle for the previous month ----
    if (action === "run") {
      if (user.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
      const limit = Math.min(Number(body.limit) || 200, 300);
      const wallets = await svc.entities.CrixWallet.filter({ currency: "NGN" }, "-created_date", limit);
      const seen = new Set<string>();
      let checked = 0;
      let granted = 0;
      for (const w of wallets || []) {
        if (!w.user_id || seen.has(w.user_id)) continue;
        seen.add(w.user_id);
        checked++;
        try {
          const stats = await periodStats(svc, w.user_id, 1);
          const res = await grantReward(svc, w.user_id, stats);
          if (res.granted) granted++;
        } catch { /* one user's failure never stops the batch */ }
      }
      return Response.json({ period: monthKey(1), checked, granted, distinct_users: seen.size });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}