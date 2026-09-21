import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { secrets } from 'base44:runtime';
import { safeEmail } from "../../shared/safeIntegration.ts";

const CARD_FRONT_URL = 'https://media.base44.com/images/public/6a7364eea84550708f16a360/d6640f847_generated_image.png';
const CARD_BACK_URL = 'https://media.base44.com/images/public/6a7364eea84550708f16a360/f586a1877_generated_image.png';
const OPAY = '8061197339';

const pad = (n, len) => String(n).padStart(len, '0');

function genCardNumber() {
  let base = '5399';
  while (base.length < 15) base += Math.floor(Math.random() * 10).toString();
  let sum = 0, alt = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let d = parseInt(base[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

function genExpiry() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() + 3 };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = body.action || '';

    if (action === 'register') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Login required' }, { status: 401 });
      const cardholder_name = (body.cardholder_name || '').trim();
      const email = (body.email || '').trim();
      const phone = (body.phone || '').trim();
      if (!cardholder_name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return Response.json({ error: 'Cardholder name and a valid email are required' }, { status: 400 });
      }
      const existing = (await base44.entities.RideXCard.filter({ user_id: user.id }));
      const existingAll = (existing && existing.length) ? existing : await base44.entities.RideXCard.filter({ created_by_id: user.id });
      if (existingAll && existingAll.length) {
        return Response.json({ error: 'You already have a Ride X Card', card: existingAll[0] }, { status: 400 });
      }
      const number = genCardNumber();
      const last4 = number.slice(-4);
      const { month, year } = genExpiry();
      const cvv = pad(Math.floor(Math.random() * 900 + 100), 3);
      const card = await base44.entities.RideXCard.create({
        user_id: user.id, // PRIMARY ownership key — wallet.user_id = authenticated user id
        cardholder_name, email, phone,
        card_number: number, card_last4: last4,
        expiry_month: month, expiry_year: year, cvv,
        balance: 0, total_loaded: 0, total_spent: 0, status: 'active',
      });

      const masked = `5399 **** **** ${last4}`;
      const exp = `${pad(month, 2)}/${String(year).slice(-2)}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0b12;font-family:Manrope,Arial,sans-serif;color:#f5f3ec">
        <div style="max-width:560px;margin:0 auto;padding:32px 20px">
          <div style="text-align:center;font-size:22px;font-weight:800;letter-spacing:.5px">RIDE <span style="color:#f7c948">X</span></div>
          <h1 style="font-size:20px;text-align:center;margin:24px 0 8px">Your Ride X Card is ready</h1>
          <p style="text-align:center;color:#b7b3a8;font-size:14px">Keep this card safe. Use it to pay for rides, deliveries and more across Ride X.</p>
          <table style="width:100%;margin:24px 0;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#b7b3a8;font-size:13px">Cardholder</td><td style="text-align:right;font-weight:600">${cardholder_name}</td></tr>
            <tr><td style="padding:8px 0;color:#b7b3a8;font-size:13px;border-top:1px solid #1f1f2a">Card number</td><td style="text-align:right;font-weight:600;border-top:1px solid #1f1f2a">${masked}</td></tr>
            <tr><td style="padding:8px 0;color:#b7b3a8;font-size:13px;border-top:1px solid #1f1f2a">Expiry</td><td style="text-align:right;font-weight:600;border-top:1px solid #1f1f2a">${exp}</td></tr>
            <tr><td style="padding:8px 0;color:#b7b3a8;font-size:13px;border-top:1px solid #1f1f2a">CVV</td><td style="text-align:right;font-weight:600;border-top:1px solid #1f1f2a">${cvv}</td></tr>
          </table>
          <p style="text-align:center;font-size:12px;color:#8e8b82;margin:0 0 20px">Your card front and back:</p>
          <table style="width:100%"><tr>
            <td style="text-align:center;padding:6px"><img src="${CARD_FRONT_URL}" alt="Ride X Card front" style="width:100%;max-width:260px;border-radius:16px"/></td>
            <td style="text-align:center;padding:6px"><img src="${CARD_BACK_URL}" alt="Ride X Card back" style="width:100%;max-width:260px;border-radius:16px"/></td>
          </tr></table>
          <p style="text-align:center;margin-top:28px"><a href="https://app.base44.app" style="background:#f7c948;color:#0b0b12;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px">Open Ride X</a></p>
          <p style="text-align:center;font-size:11px;color:#6f6c64;margin-top:24px">© Ride X · www.cssmotionpictures.com</p>
        </div></body></html>`;

      try {
        const _e = await safeEmail(base44, { to: email, subject: 'Your Ride X Card is ready', body: html });
        if (!_e.ok) throw new Error(_e.error || 'email failed');
      } catch (e) {
        console.error('ride-x-card email failed:', e.message);
      }
      return Response.json({ ok: true, card });
    }

    if (action === 'pay') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return Response.json({ error: 'Invalid amount' }, { status: 400 });
      const service = body.service || 'ride';
      const referenceId = (body.reference_id || body.ride_id || '').toString();
      const cards = await base44.entities.RideXCard.filter({ created_by_id: user.id, status: 'active' });
      const card = cards[0];
      if (!card) return Response.json({ error: 'No active Ride X Card' }, { status: 400 });
      if ((card.balance || 0) < amount) return Response.json({ error: 'Insufficient balance' }, { status: 400 });
      const newBalance = (card.balance || 0) - amount;
      await base44.entities.RideXCard.update(card.id, {
        balance: newBalance,
        total_spent: (card.total_spent || 0) + amount,
      });
      const tx = await base44.entities.Transaction.create({
        amount, commission: 0, currency: 'NGN', service,
        description: `Ride X Card payment · ${referenceId.slice(-6)}`,
        reference_id: referenceId, method: 'ridex_card',
        status: 'paid', settled_to_opay: true, opay_account: OPAY,
      });
      return Response.json({ ok: true, balance: newBalance, transaction: tx });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('ride-x-card error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}