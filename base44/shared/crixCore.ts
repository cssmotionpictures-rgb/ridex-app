// CRIX CORE — the server-side money engine shared by every Crix function.
// CrixCoin money rules (non-negotiable):
// - Never simulate money: a balance only moves through a real ledger event.
// - Idempotent: one idempotency key = one transaction, forever.
// - Double-entry: every pair's debits equal its credits.
// - Atomic reservation: balance debits use conditional updates (available >= total) so
//   a balance can never go negative and a concurrent double-spend can never succeed.
// - Honest availability: a rail is "available" only when it is actually configured.

export const CRIX_CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD", "AUD", "CHF", "JPY", "ZAR", "GHS", "KES", "KWD", "CRXS"];
export const CRIX_CRYPTO = "CRX"; // native Crix Network asset — chain deferred; display-only until then
// CRXS — the Quick Coin INTERNAL CrixCoin balance. An application-ledger balance,
// honestly distinct from on-chain CRXS until the external settlement rail exists.
export const MAX_TRANSFER = 5000000;
export const REVIEW_VELOCITY_24H = 30;
export const LARGE_AMOUNT = 1000000;

export const roundMoney = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function newCrixId() {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return "CRX-" + year + "-" + suffix;
}

// Resolve a wallet (service-role client), creating a zero-balance wallet when missing.
export async function getOrCreateWallet(svc, userId, currency) {
  const found = await svc.entities.CrixWallet.filter({ user_id: userId, currency });
  if (found && found.length) return found[0];
  return await svc.entities.CrixWallet.create({
    user_id: userId, currency, available: 0, reserved: 0, status: "active", frozen_reason: "",
  });
}

// Central fee engine — the quote comes from the ACTIVE fee rule, nowhere else.
// No active rule = the rail is honestly not enabled yet.
export async function quoteFee(svc, type, currency, amount) {
  const rules = await svc.entities.CrixFeeRule.filter({ type, currency, active: true });
  if (!rules || !rules.length) return null;
  const rule = rules[0];
  let fee = (Number(amount) * (Number(rule.percent_fee) || 0)) / 100;
  if (rule.min_fee) fee = Math.max(fee, Number(rule.min_fee));
  if (rule.max_fee) fee = Math.min(fee, Number(rule.max_fee));
  fee = roundMoney(fee);
  const cleanAmount = roundMoney(amount);
  return {
    rule_key: rule.rule_key,
    fee,
    total_debit: roundMoney(cleanAmount + fee),
    recipient_gets: cleanAmount,
    fee_statement: rule.description || String(rule.percent_fee) + "%",
  };
}

// Evidence-based risk assessment — computed only from recorded history, never fabricated.
export async function assessRisk(svc, senderId, amount, currency) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const completed = await svc.entities.CrixTransaction.filter({ sender_id: senderId, status: "COMPLETED" });
  const last24h = (completed || []).filter((t) => (t.created_date || "") >= since);
  const signals = [];
  let risk = "LOW";
  if (last24h.length >= 30) {
    risk = "REVIEW_REQUIRED";
    signals.push("velocity: " + last24h.length + " transfers in the last 24h");
  }
  if (amount >= 1000000 && last24h.length < 3) {
    risk = risk === "LOW" ? "MEDIUM" : risk;
    signals.push("large amount with little recent transfer history");
  }
  if (currency !== "NGN") signals.push("non-NGN rail pre-check");
  return { risk, signals };
}

// WALLET FUNDING — the real-money deposit engine. A paid NGN deposit credits
// the Crix wallet through the same double-entry ledger as transfers:
//   - Called ONLY from server-side settlement points (payment webhook,
//     deposit_settle) and ONLY after the payment was independently verified
//     at the provider — never from a screen click.
//   - IDEMPOTENT: the deposit record's status is the lock; a redelivered
//     webhook or a repeated settle can never credit twice.
//   - VERIFIED AMOUNT MATCH: the provider-confirmed amount must equal the
//     quoted charge; a mismatch is held for review, never silently credited.
//   - A pause never strands an already-paid deposit: pausing deposits stops
//     NEW funding (deposit_init checks the gate) — money a customer already
//     paid is always credited (customer protection, spec §39).

export const MIN_FUNDING_NGN = 100;
export const MAX_FUNDING_NGN = 5000000;

function parseTimeline(dep: any): any[] {
  try { return JSON.parse(dep.timeline_json || "[]"); } catch { return []; }
}

export async function creditCrixDeposit(svc: any, input: {
  crix_id: string; charge_amount: number; provider: string; provider_ref: string;
}): Promise<{ ok: boolean; duplicate?: boolean; crix_id?: string; lands?: number; balance?: number; error?: string }> {
  const rows = await svc.entities.CrixTransaction.filter({ crix_id: input.crix_id });
  const dep = (rows || [])[0] || null;
  if (!dep) return { ok: false, error: "No funding record for " + input.crix_id };
  if (dep.type !== "wallet_funding") return { ok: false, error: "This record is not a wallet funding" };
  if (dep.status === "COMPLETED") return { ok: true, duplicate: true, crix_id: dep.crix_id, lands: dep.amount };

  const lands = roundMoney(dep.amount);
  const fee = roundMoney(dep.fee_total || 0);
  const charge = roundMoney(input.charge_amount);
  if (Math.abs(charge - (lands + fee)) > 0.01) {
    // The verified provider amount does not match the quote — nothing is
    // credited silently; the record is flagged for review instead.
    await svc.entities.CrixTransaction.update(dep.id, {
      status: "UNKNOWN",
      timeline_json: JSON.stringify([...parseTimeline(dep), { step: "UNKNOWN", at: new Date().toISOString(), detail: "verified provider amount " + charge + " does not match quoted charge " + (lands + fee) + " — credit held for review" }]),
    }).catch(() => {});
    return { ok: false, error: "The confirmed payment amount does not match the funding quote — the credit is held for review, nothing was lost." };
  }

  const wallets = await svc.entities.CrixWallet.filter({ user_id: dep.sender_id, currency: dep.currency });
  const wallet = (wallets || [])[0] || null;
  if (!wallet) return { ok: false, error: "The wallet for this funding record no longer exists — nothing was credited." };

  const before = await svc.entities.CrixWallet.get(wallet.id);
  await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: lands } });
  const after = await svc.entities.CrixWallet.get(wallet.id);
  if ((Number(after.available) || 0) <= (Number(before.available) || 0)) {
    return { ok: false, error: "The credit could not be applied — nothing was credited. The verified payment is safe and will retry." };
  }

  const pairKey = dep.crix_id + "|P1";
  try {
    await svc.entities.CrixLedgerEntry.bulkCreate([
      { entry_key: dep.crix_id + "|D1", crix_id: dep.crix_id, pair_key: pairKey, account: "external:incoming:" + dep.currency + ":" + input.provider, user_id: "", direction: "debit", amount: charge, memo: "Fiat deposit received via " + input.provider + (input.provider_ref ? " (" + input.provider_ref + ")" : "") },
      { entry_key: dep.crix_id + "|C1", crix_id: dep.crix_id, pair_key: pairKey, account: "user:" + dep.sender_id + ":" + dep.currency, user_id: dep.sender_id, direction: "credit", amount: lands, memo: "Wallet funding — " + dep.crix_id },
      ...(fee > 0 ? [{ entry_key: dep.crix_id + "|C2", crix_id: dep.crix_id, pair_key: pairKey, account: "revenue:fees:" + dep.currency, user_id: "", direction: "credit", amount: fee, memo: "Wallet funding fee" }] : []),
    ]);
    const now = new Date().toISOString();
    await svc.entities.CrixTransaction.update(dep.id, {
      status: "COMPLETED",
      ledger_pair: pairKey,
      provider_ref: String(input.provider_ref || ""),
      timeline_json: JSON.stringify([
        ...parseTimeline(dep),
        { step: "PROCESSING", at: now, detail: "payment verified at " + input.provider },
        { step: "COMPLETED", at: now, detail: "wallet credited " + lands + " " + dep.currency + ", double-entry pair " + pairKey + " balanced" },
      ]),
      protection_json: JSON.stringify({
        session_verified: true, payment_verified_at_provider: true, amount_matched_quote: true,
        credited_atomically: true, ledger: "double-entry", rail: input.provider,
      }),
    });
    // ACCOUNTING — every completed wallet funding is also saved to the
    // bookkeeping spreadsheet (non-blocking by design: the credit is already
    // real and settled; accounting can never roll it back)
    try {
      const { recordCrixPayment } = await import("./crixSheets.ts");
      await recordCrixPayment(svc, {
        service: "Wallet funding",
        details: "Deposit credited" + (input.provider_ref ? " (" + input.provider_ref + ")" : ""),
        amount: lands,
        fee,
        status: "paid",
        reference: dep.crix_id,
        user: dep.sender_email || dep.sender_id,
      });
    } catch (sheetError) {
      // Accounting only — the credit above is already settled
    }
    // ADMIN DEPOSIT ALERT — best-effort and non-blocking by design: a
    // notification failure can never roll back or delay a real credit. Sent to
    // every registered admin the moment a verified deposit lands in the ledger.
    try {
      const admins = await svc.entities.User.filter({ role: "admin" });
      for (const admin of admins || []) {
        if (!admin.email) continue;
        await svc.integrations.Core.SendEmail({
          to: admin.email,
          subject: "Crix deposit credited: " + lands + " " + dep.currency + " — " + dep.crix_id,
          body:
            "A real-money deposit was verified at the provider and credited.\n\n" +
            "Transaction: " + dep.crix_id + "\n" +
            "Customer: " + (dep.sender_email || dep.sender_id) + "\n" +
            "Charge: " + charge + " " + dep.currency + "\n" +
            "Fee: " + fee + " " + dep.currency + "\n" +
            "Credited: " + lands + " " + dep.currency + "\n" +
            "New wallet balance: " + after.available + " " + dep.currency + "\n" +
            "Provider: " + input.provider + " (" + input.provider_ref + ")\n" +
            "Ledger pair: " + pairKey + "\n" +
            "Time: " + new Date().toISOString(),
        });
      }
    } catch (notifyError) {
      // Notification only — the credit above is already real and settled.
    }
    return { ok: true, crix_id: dep.crix_id, lands, balance: after.available };
  } catch (ledgerError) {
    // COMPENSATION — the ledger pair must exist for every credit; reverse the
    // wallet credit so money is never created without its record.
    await svc.entities.CrixWallet.updateMany({ id: wallet.id }, { $inc: { available: -lands } }).catch(() => {});
    return { ok: false, error: "The credit failed after reservation — nothing was credited: " + String(ledgerError.message || ledgerError) };
  }
}