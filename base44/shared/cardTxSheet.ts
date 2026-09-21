import { secrets } from "base44:runtime";

// Permanent record of every Ride X virtual card transaction — appended as a
// row to the owner's "Ride X Card Activity" Google Sheet (Transactions tab).
// Never throws: a failed log must never break the card action behind it.
//
// Structured columns (A:T) — transaction identity and the complete, separately
// labelled fee breakdown:
//   A timestamp  B holder  C email  D last4  E currency  F type  G amount
//   H balance  I detail  J status  K transaction_id  L fx_applied
//   M provider_fx_fee  N our_fx_markup  O cross_border  P cross_border_fee
//   Q our_cross_border_markup  R provider_fee  S our_platform_fee  T total
//
// Every append is fully traced: a correlation ID (rid) tags the whole
// webhook→sheet journey, and the complete Google Sheets API response is
// logged — a failure is never swallowed silently. Only masked card data
// (last4) is ever written or logged — never PAN, CVV, PIN or any secret.

export const SHEET_TAB = "Transactions";
export const SHEET_RANGE = "Transactions!A:T";

export type SheetLogResult = {
  ok: boolean;
  correlationId: string;
  sheetId: string;
  tab: string;
  range: string;
  httpStatus: number;
  updatedRange: string;
  updatedRows: number;
  error: string;
};

function fail(rid: string, sheetId: string, error: string, httpStatus = 0): SheetLogResult {
  console.error(`[cardTxSheet rid=${rid}] FAILED: ${error}`);
  return { ok: false, correlationId: rid, sheetId, tab: SHEET_TAB, range: SHEET_RANGE, httpStatus, updatedRange: "", updatedRows: 0, error };
}

// Low-level append — writes one row to the Transactions tab and returns the
// full structured result so callers can log/verify it.
export async function appendSheetRow(base44, values, correlationId): Promise<SheetLogResult> {
  const rid = correlationId || crypto.randomUUID();
  const sheetId = (secrets.get("CARD_TX_SHEET_ID") || "").trim();
  if (!sheetId) return fail(rid, "", "CARD_TX_SHEET_ID secret is not set in this environment");
  if (!Array.isArray(values) || !values.length) return fail(rid, sheetId, "No row values to append");

  let accessToken = "";
  try {
    const conn = await base44.asServiceRole.connectors.getConnection("googlesheets");
    accessToken = (conn && conn.accessToken) || "";
  } catch (e: any) {
    return fail(rid, sheetId, `Google Sheets connection unavailable: ${e?.message || e}`);
  }
  if (!accessToken) {
    return fail(rid, sheetId, "Google Sheets connection returned no access token — re-authorize the Sheets connector");
  }

  // NOTE: the backend-function runtime strips the Authorization header on
  // sheets.googleapis.com requests, so the token is passed as Google's
  // officially supported access_token query parameter instead (the header
  // is kept too — whichever path reaches Google first authenticates).
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${SHEET_RANGE}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const msg = bodyText.slice(0, 300).replace(/\s+/g, " ");
      console.error(`[cardTxSheet rid=${rid}] append FAILED — HTTP ${res.status} spreadsheet ${sheetId} tab "${SHEET_TAB}" range ${SHEET_RANGE}: ${msg}`);
      return { ok: false, correlationId: rid, sheetId, tab: SHEET_TAB, range: SHEET_RANGE, httpStatus: res.status, updatedRange: "", updatedRows: 0, error: `Sheets append HTTP ${res.status}: ${msg}` };
    }
    const updates = (JSON.parse(bodyText).updates) || {};
    const out: SheetLogResult = {
      ok: true, correlationId: rid, sheetId, tab: SHEET_TAB, range: SHEET_RANGE,
      httpStatus: res.status, updatedRange: updates.updatedRange || "", updatedRows: updates.updatedRows || 0, error: "",
    };
    console.log(`[cardTxSheet rid=${rid}] append OK — HTTP ${res.status} spreadsheet ${sheetId} tab "${SHEET_TAB}" wrote ${out.updatedRange} (${out.updatedRows} row)`);
    return out;
  } catch (e: any) {
    return fail(rid, sheetId, `Sheets append request failed: ${e?.message || e}`);
  }
}

// One card-transaction row in the master record. `row.fees` (optional) carries
// the separately labelled fee breakdown; older callers without it still work.
export async function logCardTxToSheet(base44, row, correlationId): Promise<SheetLogResult> {
  try {
    if (!row) return fail(correlationId || "n/a", "", "No transaction row supplied");
    const ts = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
    const f = row.fees || null;
    const values = [[
      ts,
      row.holder || "",
      row.email || "",
      row.last4 || "",
      row.currency || "NGN",
      row.type || "",
      row.amount ?? 0,
      row.balance ?? "",
      row.detail || "",
      row.status || "",
      row.transaction_id || "",
      f ? (f.fx_applied ? "Yes" : "No") : "",
      f ? (f.provider_fx_fee ?? 0) : "",
      f ? (f.our_fx_markup ?? 0) : "",
      f ? (f.cross_border ? "Yes" : "No") : "",
      f ? (f.cross_border_fee ?? 0) : "",
      f ? (f.our_cross_border_markup ?? 0) : "",
      f ? (f.provider_fee ?? 0) : "",
      f ? (f.our_platform_fee ?? 0) : "",
      f ? (f.total ?? "") : "",
    ]];
    return await appendSheetRow(base44, values, correlationId);
  } catch (e: any) {
    return fail(correlationId || "n/a", "", `Unexpected logging error: ${e?.message || e}`);
  }
}

// Spreadsheet metadata — proves the ID resolves, the account can open it, and
// which tabs exist. Used by the admin diagnostic trace.
export async function getSheetInfo(base44) {
  const sheetId = (secrets.get("CARD_TX_SHEET_ID") || "").trim();
  if (!sheetId) return { ok: false, httpStatus: 0, title: "", tabs: [], error: "CARD_TX_SHEET_ID secret is not set" };
  try {
    const conn = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const accessToken = (conn && conn.accessToken) || "";
    if (!accessToken) return { ok: false, httpStatus: 0, title: "", tabs: [], error: "No Google Sheets access token" };
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title&access_token=${encodeURIComponent(accessToken)}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, httpStatus: res.status, title: "", tabs: [], error: (j.error && j.error.message) || `HTTP ${res.status}` };
    }
    const tabs = ((j.sheets || []).map((s: any) => s.properties && s.properties.title)).filter(Boolean);
    return { ok: true, httpStatus: res.status, title: (j.properties && j.properties.title) || "", tabs, error: "" };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, title: "", tabs: [], error: e?.message || String(e) };
  }
}