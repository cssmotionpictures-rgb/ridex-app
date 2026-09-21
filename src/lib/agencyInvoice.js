import { splitTalentPrice } from "@/lib/talentPricing";
import { AGENCY } from "@/lib/agency";
import { money } from "@/lib/pricing";

export const LOGISTICS_FEE = 500000;

export function invoiceData(booking) {
  const gross = Number(booking?.price) || 0;
  const { artist: net, platform: agency } = splitTalentPrice(gross);
  const logistics = LOGISTICS_FEE;
  const total = gross + logistics;
  return {
    serial: `AG-2026-${String(booking?.id || "0000").slice(-4).toUpperCase()}`,
    artist: booking?.artist_name || "—",
    promoter: booking?.promoter_company || "Promoter / Event Host",
    project: booking?.project_details || booking?.title || "—",
    date: booking?.event_date || "—",
    net, agency, logistics, total,
    deposit: Math.round(total / 2),
  };
}

export function invoiceHtml(d) {
  return `<pre style="font:12px/1.55 monospace;white-space:pre-wrap;padding:28px">RIDE X LIVE ROUTING DESK — Lagos, Nigeria
${AGENCY.email} · ${AGENCY.phone}
COMMERCIAL PERFORMANCE ESCROW INVOICE

Invoice To:
  Company: ${d.promoter}
  Event Project: ${d.project}
  Performance Date: ${d.date}

Ledger:  Serial ${d.serial} · Issued ${new Date().toLocaleDateString()} · Status: Pending Escrow · Due Upon Receipt

BILLING MATRIX
  Talent Performance Engagement — ${d.artist} ......... 1 x ${money(d.net)} = ${money(d.net)}
  Agency Booking Surcharge (20%) .................... 1 x ${money(d.agency)} = ${money(d.agency)}
  Logistics Coordination & Advancement Fee ........... 1 x ${money(d.logistics)} = ${money(d.logistics)}
  ---------------------------------------------------------------
  SUBTOTAL ................................................. ${money(d.total)}
  VAT / Withholding (7.5%) .......... absorbed by Promoter
  TOTAL BALANCE DUE ......................................... ${money(d.total)}

MANDATORY 50% ESCROW DEPOSIT: ${money(d.deposit)}

AUDITED CLEARANCE CHANNELS
  Bank: ${AGENCY.banks}
  Account Name: ${AGENCY.name}
  Escrow Route (NGN / USD Dom): on request
  Forward wire telemetry to ${AGENCY.email} to lock the calendar date.

Authorised by The Lead Routing Desk · ${AGENCY.phone}</pre>`;
}