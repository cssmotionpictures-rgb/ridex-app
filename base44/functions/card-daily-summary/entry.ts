import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { flwCardsRequest } from "../../shared/flwCardApi.ts";
import { appendSheetRow, logCardTxToSheet } from "../../shared/cardTxSheet.ts";
import { getCardFeeConfig, issuanceQuote, getUsdNgnRate, usdToNgn } from "../../shared/cardFees.ts";
import { sendCardTxAlert } from "../../shared/cardTxNotify.ts";
import { findOwnerWallet } from "../../shared/cardWallet.ts";

// Daily Ride X Card transaction summary — every night at 23:50 Lagos the
// day's real card transactions are aggregated per card and appended as a
// "Daily summary" row to the master "Ride X Card Activity" Google Sheet, so
// the full history can be tracked in one record. Runs on the scheduled cron
// (daily_card_summary_1150pm_lagos); a one-card test run can be triggered
// with { "test_card_id": "<id>" }.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const lagosToday = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

    const cards = body.test_card_id
      ? await base44.asServiceRole.entities.VirtualCard.filter({ id: body.test_card_id })
      : await base44.asServiceRole.entities.VirtualCard.list("-created_date", 200);

    let written = 0, skipped = 0, failed = 0, maintenanceCharged = 0;
    const monthKey = lagosToday.slice(0, 7); // YYYY-MM the fees below apply to
    const details = [];
    // Admin-configured fee schedule (CardFeeConfig) + one live rate per run.
    const feeConfig = await getCardFeeConfig(base44);
    let usdRateCache = 0;
    const usdRate = async () => {
      if (!usdRateCache) usdRateCache = (await getUsdNgnRate(feeConfig)).rate;
      return usdRateCache;
    };
    for (const c of cards || []) {
      const label = `...${c.card_last4 || ""}`;
      if (!c.flw_card_id) { skipped++; continue; }

      // Monthly maintenance fee — charged once per calendar month per card,
      // from the owner's Ride X wallet. The issue month itself is free. Runs
      // BEFORE the provider summary so a provider outage never blocks it; if
      // the wallet can't cover the fee it simply retries on the next run.
      const maintMonth = c.maintenance_month || '';
      const issuedMonth = String(c.created_date || '').slice(0, 7);
      const maintenanceDue = maintMonth !== monthKey && !(maintMonth === '' && issuedMonth === monthKey);
      if (maintenanceDue && feeConfig.maintenance_enabled !== false) {
        try {
          // Admin-configured monthly maintenance (₦200 naira / $1 dollar at
          // the default pricing) — dollar fees convert at the live rate.
          const feeCard = issuanceQuote(feeConfig, c.currency).maintenance_fee;
          const fee = feeCard > 0 ? (c.currency === 'USD' ? usdToNgn(feeCard, await usdRate()) : feeCard) : 0;
          // Ownership — the card owner's id is the primary wallet key; a
          // wallet belonging to a different user is never charged.
          const { wallet: w, conflict } = await findOwnerWallet(base44.asServiceRole, c.created_by_id, c.email);
          if (fee > 0 && w && (w.balance || 0) >= fee) {
            const newWalletBal = (w.balance || 0) - fee;
            await base44.asServiceRole.entities.RideXCard.update(w.id, {
              balance: newWalletBal,
              total_spent: (w.total_spent || 0) + fee,
            });
            await base44.asServiceRole.entities.Transaction.create({
              amount: fee, commission: fee, currency: 'NGN', service: 'card',
              description: 'Ride X Card monthly maintenance fee', reference_id: c.id,
              method: 'ridex_card', status: 'paid',
            });
            await base44.asServiceRole.entities.VirtualCard.update(c.id, { maintenance_month: monthKey });
            await logCardTxToSheet(base44, {
              holder: c.cardholder_name || '', email: c.email || '', last4: c.card_last4 || '',
              currency: c.currency || 'NGN', type: 'Maintenance fee', amount: fee, balance: newWalletBal,
              detail: `Monthly maintenance for ${monthKey}`,
            });
            await sendCardTxAlert({
              to: c.email || '',
              name: c.cardholder_name || 'Ride X member',
              title: "Monthly card maintenance fee",
              description: `Your ₦${fee.toLocaleString()} monthly maintenance fee for the Ride X Card ending ${(c.card_last4 || '').padStart(4, '•')} was charged from your Ride X wallet.`,
              amount: fee,
              balance: newWalletBal,
              currency: 'NGN',
            });
            maintenanceCharged++;
          }
        } catch (e) {
          // Maintenance is never allowed to break the summary run.
          console.log(`maintenance fee failed for ${label}: ${e.message}`);
        }
      }

      try {
        const r = await flwCardsRequest('GET', `/virtual-cards/${c.flw_card_id}/transactions?from=${lagosToday}&to=${lagosToday}&index=0&size=100`, null, { base44: base44.asServiceRole, card_id: c.id, transaction_type: 'daily-summary' });
        if (!r.ok || !r.json || r.json.status === 'error') {
          failed++;
          details.push({ card: label, ok: false, error: `Provider history unavailable (HTTP ${r.status})` });
          continue;
        }
        const txs = Array.isArray(r.json.data) ? r.json.data : [];
        if (!txs.length) { skipped++; continue; } // nothing happened today — nothing to summarize

        let debitCount = 0, debitTotal = 0, creditCount = 0, creditTotal = 0, ending = c.balance || 0;
        for (const t of txs) {
          const type = String(t.type || '').toLowerCase();
          const amt = Math.abs(Number(t.amount || 0));
          if (type.includes('debit')) { debitCount++; debitTotal += amt; }
          else if (type === 'credit' || type === 'refund') { creditCount++; creditTotal += amt; }
          const nb = Number(t.new_balance ?? t.balance);
          if (Number.isFinite(nb)) ending = nb;
        }
        const ts = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });
        const log = await appendSheetRow(base44, [[
          ts,
          c.cardholder_name || '',
          c.email || '',
          c.card_last4 || '',
          c.currency || 'NGN',
          'Daily summary',
          debitTotal,
          ending,
          `${lagosToday} — ${debitCount} debit(s), ${creditCount} credit(s)`,
        ]]);
        if (log.ok) {
          written++;
          details.push({ card: label, ok: true, range: log.updatedRange, correlationId: log.correlationId });
        } else {
          failed++;
          details.push({ card: label, ok: false, error: log.error });
        }
      } catch (e) {
        failed++;
        details.push({ card: label, ok: false, error: e.message });
      }
    }
    console.log(`card-daily-summary ${lagosToday}: wrote ${written} summary row(s), skipped ${skipped}, failed ${failed}, maintenance fees charged ${maintenanceCharged}`);
    return Response.json({ ok: true, day: lagosToday, written, skipped, failed, maintenanceCharged, details });
  } catch (error) {
    console.error('card-daily-summary error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}