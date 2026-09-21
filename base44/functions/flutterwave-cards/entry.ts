import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { secrets } from "base44:runtime";
import { sendCardTxAlert } from "../../shared/cardTxNotify.ts";
import { logCardTxToSheet, getSheetInfo } from "../../shared/cardTxSheet.ts";
import { flwCardsRequest } from "../../shared/flwCardApi.ts";
import { getCardFeeConfig, issuanceQuote, fundingFeeFor, getUsdNgnRate, usdToNgn, roundFor } from "../../shared/cardFees.ts";
import { processCardPurchase } from "../../shared/cardPurchaseProcessor.ts";
import { findOwnerWallet } from "../../shared/cardWallet.ts";

// Flutterwave Card Issuing — cardholders, virtual cards, wallet funding,
// freeze/unfreeze and card transaction history. Every action is scoped to the
// logged-in user's own VirtualCard / RideXCard (wallet) records.

// User-facing messages stay fully Ride X branded — the payment processor behind
// the card service is never exposed to end users. Setup details live in the
// admin-only diagnose action, which returns the raw provider responses.
const NOT_ENABLED =
  "Ride X Cards are almost ready — the card service is finishing setup. Please check back soon.";

// Card Issuing lives on the classic v3 API authenticated with the account's
// Secret Key — shared with the webhook handler (see shared/flwCardApi.ts).
const cardsRequest = flwCardsRequest;

const flwErr = (json) => {
  const m = json && (json.message || (json.error && (json.error.message || json.error)));
  return typeof m === 'string' && m ? m : 'Card service error — please try again';
};

const isNotFound = (r) =>
  r.status === 404 ||
  !r.ok && r.json && (r.json.code === '10404' || /resource not found/i.test(String(r.json.message || '')));

const isAuthErr = (r) =>
  r.status === 401 || /invalid authorization key/i.test(String((r.json && r.json.message) || ''));

const INVALID_KEY =
  "Ride X Card service is undergoing quick maintenance. Please try again shortly.";

// The card service only accepts requests from whitelisted server IPs.
const IP_WHITELIST =
  "Ride X Card service is completing its security setup. Card actions will be available shortly — " +
  "please try again in a little while.";

const isIpBlocked = (r) => /ip whitelisting/i.test(String((r.json && r.json.message) || ''));

const fail = (r, what) =>
  Response.json(
    {
      error:
        isIpBlocked(r) ? IP_WHITELIST :
        isNotFound(r) ? NOT_ENABLED :
        isAuthErr(r) ? INVALID_KEY :
        `${what}: ${flwErr(r.json)}`,
    },
    { status: 502 }
  );

const bad = (msg, status = 502) => Response.json({ error: msg }, { status });

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Login required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = body.action || '';

    // Admin diagnostic — probes which card-issuing endpoints this Flutterwave
    // account can actually reach (returns statuses only, never card data).
    if (action === 'diagnose') {
      const probes = [
        // Controls — known-good endpoints (auth + base URL sanity).
        ['GET', '/transactions?page=1', null],
        ['GET', '/balances', null],
        // The failing card-issuing endpoint, plus query variants.
        ['GET', '/virtual-cards', null],
        ['GET', '/virtual-cards?page=1', null],
        ['GET', '/virtual-cards?index=0&size=10', null],
        // Empty-body create probe: a live endpoint answers with field
        // validation errors; a non-routed/disabled one answers 400-empty.
        ['POST', '/virtual-cards', {}],
        // Card detail probe on a synthetic id — distinguishes
        // "endpoint family exists" (JSON 404) from "not routed" (400-empty).
        ['GET', '/virtual-cards/00000000-0000-0000-0000-000000000000', null],
        ['GET', '/cardholders', null],
      ];
      const results = [];
      for (const [method, path, probeBody] of probes) {
        try {
          const r = await cardsRequest(method, path, probeBody);
          results.push({
            method,
            path,
            status: r.status,
            ok: r.ok,
            message: String((r.json && (r.json.message || r.json.code)) || '').slice(0, 140),
            body: JSON.stringify(r.json).slice(0, 300),
          });
        } catch (e) {
          results.push({ method, path, status: 0, ok: false, message: String(e.message).slice(0, 140) });
        }
      }
      // Staged create-field probe — the provider's own validation chain
      // reveals the exact required request fields for card creation. The
      // impossible amount guarantees this probe can never create a real card
      // (no balance could ever cover it), so it stays a pure diagnostic.
      const validationChain = [];
      const STAGES = [
        { currency: 'NGN' },
        { currency: 'NGN', amount: 999999999999 },
        { currency: 'NGN', amount: 999999999999, debit_currency: 'NGN', billing_name: 'Ride X Diagnostics' },
        { currency: 'NGN', amount: 999999999999, debit_currency: 'NGN', billing_name: 'Ride X Diagnostics', billing_address: 'Ride X Diagnostics', billing_country: 'NG', first_name: 'Ride', last_name: 'X', email: user.email, phone_number: '08000000000' },
      ];
      for (const stage of STAGES) {
        const r = await cardsRequest('POST', '/virtual-cards', stage, { base44, correlation_id: 'diagnose-validation-probe', transaction_type: 'validation-probe' });
        validationChain.push({
          sent_keys: Object.keys(stage),
          status: r.status,
          message: String((r.json && r.json.message) || '').slice(0, 140),
        });
      }
      // Report the server's egress IP so the merchant can whitelist it in the
      // Flutterwave dashboard (required by the virtual card service).
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipJson = await ipRes.json().catch(() => ({}));
        return Response.json({ ok: true, egress_ip: ipJson.ip || 'unknown', results, validationChain });
      } catch {
        return Response.json({ ok: true, results, validationChain });
      }
    }

    // Admin-only end-to-end trace of the webhook → Google Sheet logging flow.
    // Runs the exact production append path once with a clearly labelled
    // diagnostic row and returns a PASS/FAIL checklist. Card data is never
    // touched — only masked identifiers, never PAN/CVV or any secret.
    if (action === 'diagnose_sheet') {
      if (user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
      const rid = crypto.randomUUID();
      const checks = [];
      const push = (step, pass, detail) => checks.push({ step, result: pass ? 'PASS' : 'FAIL', detail });

      const sheetId = (secrets.get('CARD_TX_SHEET_ID') || '').trim();
      push('Sheet ID configured', !!sheetId, sheetId ? `CARD_TX_SHEET_ID = ${sheetId}` : 'CARD_TX_SHEET_ID secret is not set');

      let token = '';
      try {
        const conn = await base44.asServiceRole.connectors.getConnection('googlesheets');
        token = (conn && conn.accessToken) || '';
        push('Google authentication', !!token, token ? `Google Sheets access token issued (${token.length} chars)` : 'Connection returned no access token');
      } catch (e) {
        push('Google authentication', false, `getConnection failed: ${e.message}`);
      }

      // Token self-check — Google's tokeninfo reports whether THIS runtime's
      // token is actually valid and which scopes it carries.
      if (token) {
        try {
          const ti = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
          const tij = await ti.json().catch(() => ({}));
          const scopes = String(tij.scope || '').split(' ');
          const hasSheets = scopes.some((s) => s.includes('spreadsheets'));
          push('Token valid for Sheets', ti.ok && hasSheets,
            ti.ok
              ? `Token verified — scopes: ${scopes.join(', ') || '(none)'}`
              : `Tokeninfo HTTP ${ti.status}: ${tij.error || tij.error_description || 'invalid token'}`);
        } catch (e) {
          push('Token valid for Sheets', false, `Tokeninfo request failed: ${e.message}`);
        }
      }

      const info = token
        ? await getSheetInfo(base44)
        : { ok: false, httpStatus: 0, title: '', tabs: [], error: 'Skipped — no access token' };
      push('Google Sheet access', !!info.ok, info.ok
        ? `Opened "${info.title}" (HTTP ${info.httpStatus})`
        : `Could not open spreadsheet (HTTP ${info.httpStatus || 'n/a'}): ${info.error || 'unknown'}`);
      push('Sheet/tab found', info.tabs.includes('Transactions'), `Tabs: ${info.tabs.join(', ') || '(none)'}`);

      if (info.tabs.includes('Transactions')) {
        const append = await logCardTxToSheet(base44, {
          holder: 'Ride X diagnostics', email: user.email, last4: '••••', currency: 'NGN',
          type: 'Diagnostic test', amount: 0, balance: '',
          detail: `Logging diagnostic ${rid}`,
        }, rid);
        push('Sheet append', !!append.ok, append.ok
          ? `Appended ${append.updatedRange} (${append.updatedRows} row, HTTP ${append.httpStatus})`
          : `HTTP ${append.httpStatus || 'n/a'}: ${append.error}`);
      } else {
        push('Sheet append', false, 'Skipped — Transactions tab not found');
      }

      const firstFail = checks.find((c) => c.result === 'FAIL');
      return Response.json({
        ok: !firstFail,
        correlation_id: rid,
        checks,
        final_error: firstFail ? `${firstFail.step}: ${firstFail.detail}` : '',
      });
    }

    // The active platform fee schedule (public, non-sensitive numbers only) —
    // powers the customer-facing fee breakdowns shown BEFORE confirmation.
    if (action === 'fee_config') {
      const cfg = await getCardFeeConfig(base44);
      let rate = Number(cfg.usd_ngn_rate) || 1600;
      let rateSource = 'admin_config';
      try {
        const r = await getUsdNgnRate(cfg);
        rate = r.rate; rateSource = r.source;
      } catch { /* keep the configured rate */ }
      return Response.json({
        ok: true,
        fees: { NGN: issuanceQuote(cfg, 'NGN'), USD: issuanceQuote(cfg, 'USD') },
        maintenance_enabled: cfg.maintenance_enabled !== false,
        usd_ngn_rate: rate,
        rate_source: rateSource,
      });
    }

    // Admin-only end-to-end purchase simulation — runs the EXACT production
    // processing path (idempotency, fee engine, ledger, wallet fee, Google
    // Sheet log) against a labelled diagnostic transaction and returns the
    // full PASS/FAIL report. Never touches PAN/CVV or any secret.
    if (action === 'diagnose_purchase') {
      if (user.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
      const cardRec = await base44.entities.VirtualCard.get(body.card_id).catch(() => null);
      if (!cardRec || !cardRec.flw_card_id) {
        return Response.json({ error: 'Card not found or not a provider-issued card' }, { status: 404 });
      }
      const providerTxId = String(body.provider_transaction_id || `diag-${crypto.randomUUID()}`);
      const amount = Math.abs(Number(body.amount) || 0);
      const report = await processCardPurchase(base44, {
        id: providerTxId,
        reference: `diag-${providerTxId}`,
        card_id: cardRec.flw_card_id,
        type: body.type || 'debit',
        amount,
        currency: body.transaction_currency || cardRec.currency,
        merchant: body.merchant || 'Ride X diagnostics',
        merchant_country: body.merchant_country || '',
        fee: body.provider_fee,
        fx_fee: body.provider_fx_fee,
        cross_border: body.cross_border === true,
        cross_border_fee: body.provider_cross_border_fee,
        new_balance: Number(body.new_balance ?? ((cardRec.balance || 0) - amount)),
      }, crypto.randomUUID());
      return Response.json({ ok: true, provider_transaction_id: providerTxId, report });
    }

    if (action === 'issue') {
      const cardholder_name = (body.cardholder_name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const phone_number = (body.phone_number || '').trim();
      const address = (body.address || '').trim();
      if (!cardholder_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !phone_number || !address) {
        return Response.json({ error: 'Name, a valid email, phone number and address are required' }, { status: 400 });
      }
      // One Naira card and one Dollar card per user.
      const currency = body.currency === 'USD' ? 'USD' : 'NGN';
      const existing = await base44.entities.VirtualCard.filter({ created_by_id: user.id });
      if (existing && existing.some((c) => (c.currency || 'NGN') === currency)) {
        return Response.json({ error: `You already have a ${currency === 'USD' ? 'Dollar' : 'Naira'} card`, card: existing[0] }, { status: 400 });
      }

      // Platform fees come from the admin-configured CardFeeConfig schedule:
      // issuance (+activation), and — when the customer tops the new card up
      // at issue — the funding fee. Dollar figures are converted at the live
      // provider rate (fallback: the admin-configured rate) for the naira
      // wallet debit. The customer sees this full breakdown before confirming.
      const cfg = await getCardFeeConfig(base44);
      const q = issuanceQuote(cfg, currency);
      const issuanceFeeCard = roundFor(currency, q.issuance_fee + q.activation_fee);
      const fundingAmt = Math.max(0, roundFor(currency, Number(body.funding_amount) || 0));
      const fundFee = fundingAmt > 0 ? fundingFeeFor(cfg, currency, fundingAmt) : { funding_fee: 0, fx_markup: 0 };
      let rate = 0, rateSource = 'n/a';
      let walletDebit = 0;
      if (currency === 'USD') {
        const r = await getUsdNgnRate(cfg);
        rate = r.rate; rateSource = r.source;
        walletDebit = usdToNgn(issuanceFeeCard + fundingAmt + fundFee.funding_fee + fundFee.fx_markup, rate);
      } else {
        walletDebit = issuanceFeeCard + fundingAmt + fundFee.funding_fee;
      }
      // Ownership — the AUTHENTICATED user id is the primary wallet key.
      // A wallet that belongs to a different account is never charged.
      const { wallet, match, conflict } = await findOwnerWallet(base44, user.id, user.email);
      if (!wallet) {
        return Response.json({ error: conflict
          ? 'This email has a Ride X wallet under a different account. Create a wallet in this account first (Card page).'
          : 'No Ride X wallet found — create one on the Card page first' }, { status: 400 });
      }
      if ((wallet.balance || 0) < walletDebit) {
        const sym = currency === 'USD' ? '$' : '₦';
        return Response.json({ error: `Insufficient wallet balance — this card needs ₦${walletDebit.toLocaleString()} from your wallet (issuance fee ${sym}${issuanceFeeCard}${fundingAmt > 0 ? `, initial top-up ${sym}${fundingAmt}, funding fee ${sym}${roundFor(currency, fundFee.funding_fee + fundFee.fx_markup)}` : ''}). Top up your wallet first.` }, { status: 400 });
      }

      // Flutterwave's real Card Issuing API: one call creates the virtual card
      // directly (no separate cardholder step). See developer.flutterwave.com
      // v3 virtual-cards reference. Dollar cards are funded from the naira
      // wallet — the card service converts at its live rate.
      const [first_name = '', ...rest] = cardholder_name.split(' ');
      const last_name = rest.join(' ');
      const created = await cardsRequest('POST', '/virtual-cards', {
        currency,
        amount: fundingAmt, // optional initial top-up from the wallet (0 = start empty)
        debit_currency: 'NGN',
        billing_name: cardholder_name,
        billing_address: address,
        billing_country: 'NG',
        first_name,
        last_name,
        email,
        phone_number,
      }, { base44, currency, amount: fundingAmt, transaction_type: 'issue' });
      // UNKNOWN outcome — the provider may or may not have created the card.
      // Never blind-retry, never charge the wallet: park it as pending so
      // support reconciles with the card service first.
      if (created.ambiguous) {
        await logCardTxToSheet(base44, {
          holder: cardholder_name, email, last4: '••••', currency,
          type: 'Card issue pending', amount: fundingAmt, balance: '',
          detail: 'Card request outcome could not be confirmed yet — the wallet was NOT charged. Ride X support will confirm before any retry.',
        }, crypto.randomUUID());
        return bad('Your card request is still being confirmed with the card service. Your wallet was NOT charged — please check back shortly or contact Ride X support before trying again.');
      }
      const d = (created.json && created.json.data) || {};
      if (!created.ok || !created.json || created.json.status === 'error' || !d.id) {
        // Account not yet enabled for card creation at the provider — surface
        // the clean branded message, never the raw technical error.
        if (/not enabled to create cards/i.test(flwErr(created.json))) return bad(NOT_ENABLED);
        return fail(created, 'Card issuing failed');
      }
      const pan = String(d.card_pan || d.pan || d.card_number || '');
      const cvv = String(d.cvv || '');
      const [ey, em] = String(d.expiration || '').split('-'); // "2025-09"
      const card = await base44.entities.VirtualCard.create({
        flw_card_id: String(d.id),
        cardholder_name, email, phone_number, address,
        card_number: pan,
        card_last4: pan.slice(-4) || String(d.masked_pan || '').slice(-4),
        cvv,
        expiry_month: Number(em) || 0,
        expiry_year: Number(ey) || 0,
        card_type: d.card_type || 'virtual',
        currency: d.currency || 'NGN',
        balance: Number(d.amount) || 0,
        status: d.is_active === false ? 'frozen' : 'active',
        issuer: 'flutterwave',
      });
      // Card issued — collect the total wallet debit (issuance fee + optional
      // initial top-up + funding fee) and record every charge separately.
      const issuanceFeeNGN = currency === 'USD' ? usdToNgn(issuanceFeeCard, rate) : issuanceFeeCard;
      const chargedWallet = await base44.entities.RideXCard.update(wallet.id, {
        balance: (wallet.balance || 0) - walletDebit,
        total_spent: (wallet.total_spent || 0) + walletDebit,
      });
      await base44.entities.Transaction.create({
        amount: issuanceFeeNGN, commission: issuanceFeeNGN, currency: 'NGN', service: 'card',
        description: `Ride X Card issuance fee (${currency === 'USD' ? '$' + issuanceFeeCard : '₦' + issuanceFeeCard})`, reference_id: card.id,
        method: 'ridex_card', status: 'paid',
      });
      if (fundingAmt > 0) {
        const fundingNGN = currency === 'USD' ? usdToNgn(fundingAmt, rate) : fundingAmt;
        const feeNGN = currency === 'USD' ? usdToNgn(fundFee.funding_fee + fundFee.fx_markup, rate) : fundFee.funding_fee;
        await base44.entities.Transaction.create({
          amount: fundingNGN, commission: 0, currency: 'NGN', service: 'card',
          description: 'Virtual card funding from Ride X wallet', reference_id: card.id,
          method: 'ridex_card', status: 'paid',
        });
        if (feeNGN > 0) {
          await base44.entities.Transaction.create({
            amount: feeNGN, commission: feeNGN, currency: 'NGN', service: 'card',
            description: `Ride X Card funding fee (${q.funding_percentage}%${currency === 'USD' ? ' + 1.5% FX markup' : ''})`, reference_id: card.id,
            method: 'ridex_card', status: 'paid',
          });
        }
      }
      // Permanent Google Sheet records — card, issuance fee, optional top-up.
      await logCardTxToSheet(base44, {
        holder: cardholder_name, email, last4: card.card_last4, currency: card.currency,
        type: 'Card issued', amount: fundingAmt, balance: card.balance,
        detail: `New ${currency} card issued${fundingAmt > 0 ? ` with ${currency === 'USD' ? '$' : '₦'}${fundingAmt} initial top-up` : ''}`,
      });
      await logCardTxToSheet(base44, {
        holder: cardholder_name, email, last4: card.card_last4, currency: 'NGN',
        type: 'Issuance fee', amount: issuanceFeeNGN, balance: chargedWallet.balance,
        detail: `One-time ${currency === 'USD' ? 'dollar' : 'naira'} card issuance fee`,
      });
      if (fundingAmt > 0) {
        await logCardTxToSheet(base44, {
          holder: cardholder_name, email, last4: card.card_last4, currency: 'NGN',
          type: 'Funding fee', amount: currency === 'USD' ? usdToNgn(fundFee.funding_fee + fundFee.fx_markup, rate) : fundFee.funding_fee,
          balance: chargedWallet.balance,
          detail: `${q.funding_percentage}% funding fee${currency === 'USD' ? ' + 1.5% FX markup' : ''} on the initial top-up`,
        });
      }
      await sendCardTxAlert({
        to: card.email || user.email,
        name: cardholder_name,
        title: "Your Ride X Card is ready",
        description: `Your new ${currency === 'USD' ? 'dollar' : 'naira'} Ride X Card ending ${(card.card_last4 || '').padStart(4, '•')} is ready. Charged from your Ride X wallet: issuance fee ${currency === 'USD' ? '$' + issuanceFeeCard + ` (₦${issuanceFeeNGN.toLocaleString()})` : `₦${issuanceFeeNGN.toLocaleString()}`}${fundingAmt > 0 ? `, initial top-up ${currency === 'USD' ? '$' : '₦'}${fundingAmt}` : ''} — ₦${walletDebit.toLocaleString()} in total.`,
        amount: issuanceFeeNGN,
        balance: chargedWallet.balance,
        currency: 'NGN',
      });
      return Response.json({ ok: true, card, wallet: chargedWallet, fees: { issuance_fee: issuanceFeeCard, funding_amount: fundingAmt, funding_fee: fundFee.funding_fee, fx_markup: fundFee.fx_markup, rate, rate_source: rateSource, wallet_debit: walletDebit } });
    }

    const myCards = await base44.entities.VirtualCard.filter({ created_by_id: user.id });

    // Emergency freeze — one tap blocks every active card of this user.
    // A card only counts as frozen when the provider confirms the freeze.
    if (action === 'freeze_all') {
      const active = (myCards || []).filter((c) => c.status !== 'frozen');
      if (!active.length) return Response.json({ ok: true, frozen: 0 });
      let frozen = 0;
      for (const c of active) {
        const r = await cardsRequest('PUT', `/virtual-cards/${c.flw_card_id}/status/freeze`, null, { base44, card_id: c.id, transaction_type: 'freeze' });
        if (r.ok && r.json && r.json.status !== 'error') {
          await base44.entities.VirtualCard.update(c.id, { status: 'frozen' });
          frozen++;
        }
      }
      if (!frozen) return bad('Could not freeze your cards right now — please try again');
      return Response.json({ ok: true, frozen, failed: active.length - frozen });
    }

    // Monthly spending trend per card — real debit history from the provider,
    // aggregated into the last 6 calendar months, split by spending category
    // for the dashboard chart.
    if (action === 'spending') {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      // Same category keywords the activity list uses, so the chart groups
      // spending exactly the way the filtered history does.
      const CATS = [
        ['Food & drinks', ['food', 'restaurant', 'kfc', 'mcdonald', 'chicken', 'chowdeck', 'cafe', 'coffee', 'starbucks', 'eat', 'uber eats', 'jumia food']],
        ['Transport', ['uber', 'bolt', 'taxi', 'transport', 'fuel', 'petrol', 'nnpc', 'oando', 'gas station']],
        ['Shopping', ['amazon', 'aliexpress', 'jumia', 'konga', 'shein', 'temu', 'ebay', 'store', 'shop']],
        ['Entertainment', ['tiktok', 'netflix', 'youtube', 'spotify', 'audiomack', 'boomplay', 'apple', 'game', 'steam', 'playstation', 'xbox', 'cinema', 'showmax', 'dstv']],
        ['Bills & airtime', ['airtime', 'mtn', 'glo', 'airtel', '9mobile', 'bill', 'electricity', 'ikedc', 'ekedc', 'data']],
      ];
      const catOf = (t) => {
        const name = String(t.merchant || t.merchant_name || t.narration || t.description || '').toLowerCase();
        for (const [label, words] of CATS) if (words.some((w) => name.includes(w))) return label;
        return 'Other';
      };
      const cardsOut = [];
      for (const c of myCards) {
        const r = await cardsRequest('GET', `/virtual-cards/${c.flw_card_id}/transactions?from=${from}&to=${to}&index=0&size=100`, null, { base44, card_id: c.id, transaction_type: 'spending' });
        if (!r.ok || !r.json || r.json.status === 'error') continue;
        const txs = Array.isArray(r.json.data) ? r.json.data : [];
        const totals = {};
        const categories = {};
        for (const t of txs) {
          const type = String(t.type || '').toLowerCase();
          if (type === 'credit' || type === 'refund') continue;
          const raw = t.created_at || t.created || t.date_created || t.transaction_date || t.date;
          const d = raw ? new Date(raw) : null;
          if (!d || isNaN(d.getTime())) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const amt = Math.abs(Number(t.amount || 0));
          totals[key] = (totals[key] || 0) + amt;
          const label = catOf(t);
          if (!categories[label]) categories[label] = {};
          categories[label][key] = (categories[label][key] || 0) + amt;
        }
        cardsOut.push({ id: c.id, last4: c.card_last4 || '', currency: c.currency || 'NGN', totals, categories });
      }
      return Response.json({ ok: true, months, cards: cardsOut });
    }

    const card = myCards.find((c) => c.id === body.card_id) || myCards[0];
    if (!card) return Response.json({ error: 'No virtual card found' }, { status: 404 });

    // Owner-set monthly spending cap (0 removes the limit). Enforcement
    // (auto-freeze on breach) happens on card transaction events.
    if (action === 'set_limit') {
      const limit = Math.round(Number(body.monthly_limit));
      if (!Number.isFinite(limit) || limit < 0) {
        return Response.json({ error: 'Invalid limit' }, { status: 400 });
      }
      const updated = await base44.entities.VirtualCard.update(card.id, { monthly_limit: limit });
      return Response.json({ ok: true, card: updated });
    }

    // Owner-set low-balance alert level (0 turns the alert off). The email is
    // sent automatically by the card transaction webhook when the card's
    // balance crosses below this level.
    if (action === 'set_threshold') {
      const threshold = Math.round(Number(body.low_balance_threshold));
      if (!Number.isFinite(threshold) || threshold < 0) {
        return Response.json({ error: 'Invalid alert level' }, { status: 400 });
      }
      const updated = await base44.entities.VirtualCard.update(card.id, { low_balance_threshold: threshold });
      return Response.json({ ok: true, card: updated });
    }

    if (action === 'fund') {
      const amount = Math.round(Number(body.amount));
      if (!amount || amount <= 0) return Response.json({ error: 'Invalid amount' }, { status: 400 });
      if (card.status !== 'active') return Response.json({ error: 'The card is frozen — unfreeze it first' }, { status: 400 });
      // Ownership — same strict user-id resolution as issuance.
      const { wallet, conflict } = await findOwnerWallet(base44, user.id, user.email);
      if (!wallet) return Response.json({ error: conflict
        ? 'This email has a Ride X wallet under a different account. Create a wallet in this account first (Card page).'
        : 'No Ride X wallet found — create one on the Card page first' }, { status: 400 });
      // Platform funding fee from the admin-configured CardFeeConfig schedule.
      // `amount` is the CARD-currency top-up (₦ for naira cards, $ for dollar
      // cards); the wallet is debited the naira equivalent at the live provider
      // rate plus our funding fee (and FX markup on dollar top-ups).
      const cfg = await getCardFeeConfig(base44);
      const q = issuanceQuote(cfg, card.currency);
      const fundFee = fundingFeeFor(cfg, card.currency, amount);
      let rate = 0, rateSource = 'n/a';
      let providerDebit = amount;
      let feeNGN = fundFee.funding_fee;
      if (card.currency === 'USD') {
        const r = await getUsdNgnRate(cfg);
        rate = r.rate; rateSource = r.source;
        providerDebit = usdToNgn(amount, rate);
        feeNGN = usdToNgn(fundFee.funding_fee + fundFee.fx_markup, rate);
      }
      const totalDebit = providerDebit + feeNGN;
      if ((wallet.balance || 0) < totalDebit) {
        return Response.json({ error: `Insufficient wallet balance — this top-up needs ₦${totalDebit.toLocaleString()} from your wallet${feeNGN ? ` (includes a ₦${feeNGN.toLocaleString()} platform funding fee)` : ''}.` }, { status: 400 });
      }

      const funded = await cardsRequest('POST', `/virtual-cards/${card.flw_card_id}/fund`, { amount, debit_currency: 'NGN' }, { base44, card_id: card.id, amount, currency: card.currency, transaction_type: 'fund' });
      // UNKNOWN outcome (timeout / network failure) — the provider may or
      // may not have applied the top-up. NEVER blind-retry and NEVER move
      // wallet money until the outcome is confirmed: check the card at the
      // provider first, then decide.
      let outcomeConfirmed = false;
      if (funded.ambiguous) {
        const check = await cardsRequest('GET', `/virtual-cards/${card.flw_card_id}`, null, { base44, card_id: card.id, amount, currency: card.currency, transaction_type: 'status-check' });
        const pd = check.ok && check.json && check.json.data ? check.json.data : null;
        const providerBal = pd ? Number(pd.amount) : null;
        if (providerBal != null && providerBal >= (card.balance || 0) + amount) {
          outcomeConfirmed = true; // provider DID apply the top-up — complete the flow
        } else if (providerBal != null) {
          // provider did NOT fund the card — nothing was charged, safe to report
          return bad('The top-up did not go through — your wallet was NOT charged. Please try again.');
        } else {
          // Still unknown — park as pending, no wallet debit, no retry.
          await logCardTxToSheet(base44, {
            holder: card.cardholder_name, email: card.email, last4: card.card_last4,
            currency: card.currency, type: 'Top-up pending', amount, balance: card.balance,
            detail: 'Outcome could not be confirmed with the card service yet — the wallet was NOT charged. Ride X support will confirm before any retry.',
          }, crypto.randomUUID());
          return bad('Your top-up is still being confirmed with the card service. Your wallet was NOT charged — please check back shortly or contact Ride X support before retrying.');
        }
      }
      if (!outcomeConfirmed && (!funded.ok || !funded.json || funded.json.status === 'error')) {
        return fail(funded, 'Funding failed');
      }
      const updatedWallet = await base44.entities.RideXCard.update(wallet.id, {
        balance: (wallet.balance || 0) - totalDebit,
        total_spent: (wallet.total_spent || 0) + totalDebit,
      });
      const newBal = Number(funded.json && funded.json.data && funded.json.data.balance) || (card.balance || 0) + amount;
      const updatedCard = await base44.entities.VirtualCard.update(card.id, { balance: newBal });
      const tx = await base44.entities.Transaction.create({
        amount: providerDebit, commission: 0, currency: 'NGN', service: 'card',
        description: 'Virtual card funding from Ride X wallet',
        reference_id: card.id, method: 'ridex_card', status: 'paid',
      });
      if (feeNGN > 0) {
        await base44.entities.Transaction.create({
          amount: feeNGN, commission: feeNGN, currency: 'NGN', service: 'card',
          description: `Ride X Card funding fee (${q.funding_percentage}%${card.currency === 'USD' ? ' + 1.5% FX markup' : ''})`,
          reference_id: card.id, method: 'ridex_card', status: 'paid',
        });
      }
      // Permanent structured Google Sheet records of the wallet→card transfer.
      const feeTotalCardCur = roundFor(card.currency, fundFee.funding_fee + fundFee.fx_markup);
      await logCardTxToSheet(base44, {
        holder: updatedCard.cardholder_name, email: updatedCard.email, last4: updatedCard.card_last4,
        currency: updatedCard.currency, type: 'Wallet top-up', amount, balance: updatedCard.balance,
        detail: `Transfer from Ride X wallet — platform fee ${card.currency === 'USD' ? '$' : '₦'}${feeTotalCardCur}, wallet debit ₦${totalDebit.toLocaleString()}`,
        status: 'completed',
        fees: { fx_applied: card.currency === 'USD', provider_fx_fee: 0, our_fx_markup: fundFee.fx_markup, cross_border: false, cross_border_fee: 0, our_cross_border_markup: 0, provider_fee: 0, our_platform_fee: feeTotalCardCur, total },
      });
      if (feeNGN > 0) {
        await logCardTxToSheet(base44, {
          holder: updatedCard.cardholder_name, email: updatedCard.email, last4: updatedCard.card_last4,
          currency: 'NGN', type: 'Funding fee', amount: feeNGN, balance: updatedWallet.balance,
          detail: `${q.funding_percentage}% funding fee${card.currency === 'USD' ? ' + 1.5% FX markup' : ''} on the wallet transfer`,
        });
      }

      // Automatic Ride X Card alert — the owner is emailed with the full
      // transparent breakdown for every card transaction.
      await sendCardTxAlert({
        to: updatedCard.email || user.email,
        name: updatedCard.cardholder_name,
        title: "Wallet transfer completed",
        description: `${updatedCard.currency === 'USD' ? '$' : '₦'}${amount.toLocaleString()} was transferred from your Ride X wallet to your Ride X Card ending ${(updatedCard.card_last4 || card.card_last4 || "").padStart(4, "•")}.` + (feeNGN ? ` A ₦${feeNGN.toLocaleString()} platform funding fee${card.currency === 'USD' ? ' (1.5% + 1.5% FX markup)' : ' (1%)'} applied.` : ''),
        amount,
        balance: updatedCard.balance,
        currency: updatedCard.currency,
      });
      return Response.json({ ok: true, card: updatedCard, wallet: updatedWallet, transaction: tx, fees: { funding_fee: fundFee.funding_fee, fx_markup: fundFee.fx_markup, rate, rate_source: rateSource, wallet_debit: totalDebit } });
    }

    if (action === 'status') {
      const status = body.status === 'freeze' ? 'freeze' : 'unfreeze';
      const res = await cardsRequest('PUT', `/virtual-cards/${card.flw_card_id}/status/${status}`, null, { base44, card_id: card.id, transaction_type: status });
      if (!res.ok || !res.json || res.json.status === 'error') {
        return fail(res, `Could not ${status} the card`);
      }
      const updated = await base44.entities.VirtualCard.update(card.id, {
        status: status === 'freeze' ? 'frozen' : 'active',
      });
      return Response.json({ ok: true, card: updated });
    }

    if (action === 'history') {
      const to = new Date().toISOString().slice(0, 10);
      const created = card.created_date ? new Date(card.created_date) : new Date(Date.now() - 365 * 864e5);
      const from = created.toISOString().slice(0, 10);
      const res = await cardsRequest('GET', `/virtual-cards/${card.flw_card_id}/transactions?from=${from}&to=${to}&index=0&size=50`, null, { base44, card_id: card.id, transaction_type: 'history' });
      if (!res.ok || !res.json || res.json.status === 'error') {
        return fail(res, 'Could not load card activity');
      }
      const txs = Array.isArray(res.json.data) ? res.json.data : [];
      return Response.json({ ok: true, transactions: txs.slice(0, 50) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('flutterwave-cards error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}