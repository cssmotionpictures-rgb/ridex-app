import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { findOfficialEmailCached, sendDirectEmail, esc } from "../../shared/officialEmailSearch.ts";

// AUTOMATIC LENDER DELIVERY — every loan application is matched to a real
// funding source (by the applicant's chosen source or the amount), the
// lender's official application email is looked up by LIVE WEB SEARCH
// (shared officialEmailSearch module — results cached so each source is
// searched once), and the full proposal is emailed through the app's own
// Brevo/Resend channel. Delivery status is stored on the application record.

const SOURCES = [
  {
    name: "Microfinance Banks (LAPO, Accion, Finca, Addosser)",
    keywords: ["lapo", "accion", "finca", "addosser", "microfinance", "mfb"],
    min: 50000,
    max: 2000000,
    search: "LAPO Microfinance Bank Nigeria loan application official contact email address",
  },
  {
    name: "Bank of Industry (BOI) — SME / NYIF",
    keywords: ["boi", "bank of industry", "nyif"],
    min: 500000,
    max: 10000000,
    search: "Bank of Industry Nigeria MSME loan application official contact email address",
  },
  {
    name: "CBN AGSMEIS / NIRSAL Microfinance Bank",
    keywords: ["agsmeis", "nirsal", "cbn", "edc"],
    min: 500000,
    max: 10000000,
    search: "NIRSAL Microfinance Bank Nigeria AGSMEIS loan application official contact email address",
  },
  {
    name: "Commercial Bank SME Loans (Access, GTB, Zenith, Sterling SME)",
    keywords: ["access", "gtb", "zenith", "sterling", "commercial", "wema", "uba", "fidelity"],
    min: 1000000,
    max: 50000000,
    search: "Access Bank Nigeria SME loan application official contact email address",
  },
];

function naira(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}

function matchSource(fundingSource, amount) {
  const fs = String(fundingSource || "").toLowerCase();
  if (fs) {
    for (const s of SOURCES) {
      if (s.keywords.some((k) => fs.includes(k))) return s;
    }
  }
  return SOURCES.find((s) => amount >= s.min && amount <= s.max) || null;
}

function buildEmailHtml(app, source) {
  const planHtml = esc(app.business_plan_summary || "").replace(/\n/g, "<br>");
  const row = (label, value) =>
    `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;white-space:nowrap">${esc(label)}</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${esc(value)}</td></tr>`;
  const date = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:0 auto">
    <div style="background:#0d0d12;padding:18px 22px;border-radius:12px 12px 0 0">
      <p style="margin:0;color:#f7c948;font-weight:bold;font-size:16px">RIDE X WEALTH LAB</p>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Business funding application — submitted ${esc(date)} via the Ride X platform</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:18px 22px">
      <p style="font-size:15px;margin:0 0 4px">Dear ${esc(source.name.split("(")[0].trim())} team,</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">Please find below a completed funding application submitted through the Ride X Wealth Lab platform. The applicant is seeking <strong>${esc(naira(app.amount_requested))}</strong> and has consented to this submission. Kindly review and reach the applicant directly using the contact details below.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:14px">
        ${row("Business / venture", app.business_name || "")}
        ${row("Business type", app.business_type || "")}
        ${row("Capital tier", app.tier || "")}
        ${row("Amount requested", naira(app.amount_requested))}
        ${row("Matched funding source", source.name)}
        ${row("Applicant", app.applicant_name || "")}
        ${row("Email", app.email || "")}
        ${row("Phone", app.phone || "")}
        ${row("BVN", app.bvn || "Not provided")}
        ${row("CAC registered", app.has_cac ? "Yes" : "No")}
      </table>
      <p style="font-size:13px;font-weight:bold;margin:0 0 6px">Business plan / use of funds</p>
      <div style="font-size:13px;line-height:1.65;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fafafa">${planHtml || "<em>Not provided</em>"}</div>
      <p style="font-size:12px;color:#6b7280;margin:16px 0 0">This application was submitted by ${esc(app.applicant_name || "the applicant")} through the Ride X Wealth Lab business-funding service. Replies and offers should be directed to the applicant's contact details above.</p>
    </div>
  </body></html>`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body.action !== "send" || !body.id) {
      return Response.json({ error: "action 'send' and application id are required" }, { status: 400 });
    }

    const rec = await base44.asServiceRole.entities.LoanApplication.get(body.id);
    const app = rec?.data || rec;
    if (!app || !app.id) return Response.json({ error: "Application not found" }, { status: 404 });

    // One delivery per application unless explicitly retried
    if (app.delivery_status === "sent" && !body.force) {
      return Response.json({ ok: true, already: true, email: app.delivery_email });
    }

    const source = matchSource(app.funding_source, Number(app.amount_requested) || 0);
    if (!source) {
      return Response.json({ ok: false, error: "No matching institutional lender for this application" });
    }

    const found = await findOfficialEmailCached(
      base44,
      `lender:${source.name}`,
      `the official loan application contact email address for ${source.search}`
    );

    // MANUAL LENDER DIRECTORY FALLBACK — when the live web search finds
    // nothing, the admin-curated directory (LenderDirectory entity, managed
    // on the Business Blueprints page) supplies the email instead: matched by
    // the applicant's funding-source keywords first, then by amount range.
    let to = found?.email || "";
    let via = found ? "web-search" : "";
    if (!to) {
      const dir = await base44.asServiceRole.entities.LenderDirectory.filter({ active: true }).catch(() => []);
      const fs = String(app.funding_source || "").toLowerCase();
      const amount = Number(app.amount_requested) || 0;
      const kws = (d: any) => String(d.keywords || "").toLowerCase().split(",").map((k: string) => k.trim()).filter(Boolean);
      const entry = (dir || []).find((d: any) => kws(d).some((k: string) => fs.includes(k)))
        || (dir || []).find((d: any) => amount >= (Number(d.min_amount) || 0) && (!d.max_amount || amount <= Number(d.max_amount)));
      if (entry?.email) { to = entry.email; via = "manual-directory"; }
    }

    if (!to) {
      const errMsg = "No lender email could be found by web search or the manual lender directory for " + source.name;
      await base44.asServiceRole.entities.LoanApplication.update(app.id, {
        delivery_status: "failed",
        delivery_email: "",
        delivery_error: errMsg,
      });
      return Response.json({ ok: false, error: errMsg });
    }

    const subject = `Loan Application — ${app.business_name || "New business"} — ${naira(app.amount_requested)} (Ride X Wealth Lab)`;
    const html = buildEmailHtml(app, source);

    const result = await sendDirectEmail({ to, subject, body: html, from_name: "RIDE X Wealth Lab" });

    const now = new Date().toISOString();
    if (result.ok) {
      await base44.asServiceRole.entities.LoanApplication.update(app.id, {
        delivery_status: "sent",
        delivery_email: to,
        delivery_error: "",
        delivered_at: now,
      });
      return Response.json({ ok: true, email: to, source: source.name, provider: result.bypassed, via });
    }
    await base44.asServiceRole.entities.LoanApplication.update(app.id, {
      delivery_status: "failed",
      delivery_email: to,
      delivery_error: result.error || "Email provider failed",
    });
    return Response.json({ ok: false, error: result.error || "Email provider failed" });
  } catch (error) {
    console.error("[loan-email]", error?.message);
    return Response.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}