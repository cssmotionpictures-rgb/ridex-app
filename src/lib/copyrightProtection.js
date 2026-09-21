import { AGENCY } from "@/lib/agency";

export const COPYRIGHT_FEES = {
  publishing_admin: 2500000,
  agency_legal: 500000,
  content_id: 200000,
  total: 3200000,
  currency: "NGN",
};

export const ngn = (n) => "₦" + (Number(n) || 0).toLocaleString("en-US");

export const SPLIT_ROLES = ["Lyrics", "Melody", "Beat", "Producer", "Topline"];
export const PRO_LIST = ["MCSN", "COSON", "BMI", "ASCAP", "PRS", "PMAN", "SAMRO"];

const certId = (r) => `NCC-2026-CR${String(r?.id || "000").slice(-4).toUpperCase()}`;
const splitId = (r) => `NG-SPLIT-2026-${String(r?.id || "000").slice(-4).toUpperCase()}`;
const today = () => new Date().toLocaleDateString();

const feeParts = (r) => ({
  pub: Number(r?.publishing_admin_fee ?? COPYRIGHT_FEES.publishing_admin),
  agency: Number(r?.agency_legal_fee ?? COPYRIGHT_FEES.agency_legal),
  cid: Number(r?.content_id_fee ?? COPYRIGHT_FEES.content_id),
  total: Number(r?.total ?? COPYRIGHT_FEES.total),
});

export const adminInvoiceHtml = (r) => {
  const f = feeParts(r);
  return `<pre style="font:12px/1.55 monospace;white-space:pre-wrap;padding:28px">${AGENCY.name.toUpperCase()} — Lagos, Nigeria
${AGENCY.email} · ${AGENCY.phone}
COMMERCIAL COPYRIGHT ADMINISTRATION INVOICE

Invoice Cleared To:
  Client Name: ${r?.client_name || "—"}
  Attn: ${r?.artist_name || "—"} (Primary Executive Project Manager)
  Project Title: ${r?.song_title || "—"}

Transaction Ledger:
  Invoice Serial: #AG-2026-CR${String(r?.id || "000").slice(-4).toUpperCase()}
  Date of Issuance: ${today()}
  Scope: Global Metadata Registration & Distribution
  Payment Status: ${r?.fee_bypassed ? "Admin Bypass (Fee Waived)" : r?.escrow_status === "released" ? "Settled" : "Pending Escrow"}
  Settlement Term: 100% Upfront Clearance

BILLING MATRIX DATA
  Global Publishing Administration & Metadata Asset Setup
    ISRC/UPC generation, MCSN registration, global streaming upload   1 x ${ngn(f.pub)} = ${ngn(f.pub)}
  Agency Legal Counsel & Split-Sheet Vetting Surcharge (20%)
    Billed to client per gross-up protocol   1 x ${ngn(f.agency)} = ${ngn(f.agency)}
  Digital Content ID Audio-Fingerprinting setup
    YouTube, TikTok, Instagram automated tracking   1 x ${ngn(f.cid)} = ${ngn(f.cid)}
  ---------------------------------------------------------------
  TOTAL OUTSTANDING BALANCED CHARGE DUE ......... ${ngn(f.total)}
  REQUIRED DEPOSIT TO INITIALIZE PROTECTION: ${ngn(f.total)}

AUDITED CLEARANCE CHANNELS
  Corporate Bank Entity: ${AGENCY.banks}
  Corporate Account Name: ${AGENCY.name}
  Forward wire transaction telemetry to ${AGENCY.email}

Authorised by the Chief Legal Counsel & IP Director · ${AGENCY.phone}</pre>`;
};

export const registrationCertificateHtml = (r) => {
  return `<pre style="font:12px/1.55 monospace;white-space:pre-wrap;padding:28px">OFFICIAL CERTIFICATE OF COPYRIGHT REGISTRATION
Issued under the Nigerian Copyright Act 2022

Filing Agency: ${AGENCY.name}
Certificate ID: ${certId(r)}
Date of Registration: ${today()}

WORK REGISTRATION
  Song Title: ${r?.song_title || "—"}
  Recording Artist: ${r?.artist_name || "—"}
  Client / Rights Holder: ${r?.client_name || "—"}
  Primary Studio Location: ${r?.studio_location || "—"}
  ISRC Code: ${r?.isrc_code || "Pending generation"}
  UPC Code: ${r?.upc_code || "Pending generation"}

THREE-STEP DIGITAL PROOF FRAMEWORK
  Step 1 — Cryptographic Vault Timestamp: ${r?.vault_timestamped ? "ARCHIVED " + (r?.vault_date ? new Date(r.vault_date).toLocaleString() : "") : "Pending"}
  Step 2 — ISRC/UPC & Content ID Fingerprinting: ${r?.content_id_setup ? "CONFIGURED" : "Pending"}
  Step 3 — Federal NCC Deposit: ${r?.ncc_deposited ? "DEPOSITED · Ref " + (r?.ncc_certificate_id || certId(r)) : "Awaiting federal deposit"}

LEGAL DECLARATION
  Copyright in this work subsists automatically from the moment of
  fixation in a tangible medium of expression. This certificate
  constitutes court-admissible proof of the timeline of creation and
  ownership, administered by ${AGENCY.name}.

Authorised by the Chief Legal Counsel & IP Director · ${AGENCY.phone}</pre>`;
};

export const splitSheetHtml = (r) => {
  let writers = [];
  try { writers = JSON.parse(r?.writers || "[]"); } catch {}
  const rows = writers.map((w, i) =>
    `  ${i + 1}. ${w.name || "—"} | ${w.role || "—"} | ${w.pro || "—"} | ${(Number(w.split) || 0)}% | Signed ____`
  ).join("\n");
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">OFFICIAL INTELLECTUAL PROPERTY CO-WRITER SPLIT SHEET
Filing Agency: ${AGENCY.name} | Tracking ID: #${splitId(r)}

IMPORTANT NOTICE: This document is a binding legal declaration of music
ownership under the Nigerian Copyright Act 2022. All percentages listed
dictate how mechanical, streaming, and performance royalties are
distributed globally and locally via MCSN.

A. THE WORK METADATA
  Song Title (Working Name): ${r?.song_title || "—"}
  Primary Recording Studio Location: ${r?.studio_location || "—"}
  ISRC Code: ${r?.isrc_code || "Pending"}
  UPC Code: ${r?.upc_code || "Pending"}

B. COPYRIGHT OWNERSHIP & ROYALTY DIVISION MATRIX
  Co-Writer | Role | PRO | Split | Signature
${rows || "  (no co-writers listed)"}
  ---------------------------------------------------------------
  TOTALS ........................................ 100.00%

Indemnity Clause: By signing, all co-writers affirm their contributions
are entirely original and do not infringe upon any existing, uncleared
copyright catalogs or third-party samples.

Filed with MCSN: ${r?.filed_with_mcsn ? "YES" : "Pending"} · Signed: ${r?.signed_date ? new Date(r.signed_date).toLocaleDateString() : "—"}</pre>`;
};

export const ceaseDesistHtml = (r) => {
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">FORMAL NOTICE TO CEASE AND DESIST: COGNIZANT COPYRIGHT INFRINGEMENT
Date of Issuance: ${today()}
From: Legal Enforcement & Intellectual Property Division, ${AGENCY.name}
To: ${r?.infringing_party || "[Infringing Party]"} | ${r?.infringing_company || "[Company]"}
   ${r?.infringing_address || ""}

RE: UNAUTHORIZED COMMERCIAL EXPLOITATION OF INTELLECTUAL PROPERTY — "${r?.track_title || "[Track]"}"

Dear ${r?.infringing_party || "Sir/Madam"},

This correspondence serves as a formal, final administrative notice that ${AGENCY.name}
represents the exclusive administrative and exhibition rights holders of the
musical composition and master sound recording entitled "${r?.track_title || "[Track]"}"
written and performed by ${r?.artist_name || "[Artist]"}.

It has been brought to our attention that your organization is actively executing
unauthorized commercial distribution, public performance, and/or marketing campaigns
using our client's protected structural audio assets at your venue/event titled
"${r?.event_campaign || "[Event/Campaign]"}".

Your unauthorized use constitutes a direct, willful violation of the Nigerian
Copyright Act 2022. Under federal statutory provisions, unauthorized public
reproduction or performance of protected musical works exposes your corporate
entity to substantial statutory damages, event closure injunctions, and direct
personal criminal liabilities.

WE HEREBY DEMAND IMMEDIATE COMPLIANCE:
  1. Cease and Desist: Halt all public broadcasts, online stream synchronizations,
     and event audio marketing of "${r?.track_title || "[Track]"}".
  2. Accounting of Exploitation: Provide an audited data manifest of all ticket
     revenues, sponsorship allocations, and promotional distributions within 48 hours.
  3. Remedial Contractual Regularization: Contact our licensing desk at ${AGENCY.email}
     to clear the synchronization framework and deposit the appropriate penalty escrow.

Failure to comply within the specified window will force our legal desk to pursue
all civil and criminal remedies without further warning.

Govern yourself accordingly,
_____________________________
Chief Legal Counsel & Intellectual Property Director
${AGENCY.name}
${AGENCY.phone}</pre>`;
};