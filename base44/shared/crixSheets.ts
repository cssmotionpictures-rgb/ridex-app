// Google Sheets accounting recorder — every successful CRIXCOIN payment is
// automatically appended as a new row in the connected accounting spreadsheet.
// Recording is NON-BLOCKING: if the sheet or the connection is unavailable,
// the payment itself has already succeeded and nothing fails or retries money
// because of accounting.

export async function recordCrixPayment(svc: any, row: {
  service: string;
  details: string;
  amount: number;
  fee: number;
  status: string;
  reference: string;
  user: string;
}): Promise<void> {
  const sheetId = Deno.env.get("CRIX_ACCOUNTING_SHEET_ID") || "";
  if (!sheetId) return; // accounting sheet not configured — payments still succeed
  const { accessToken } = await svc.connectors.getConnection("googlesheets");
  const amount = Number(row.amount) || 0;
  const fee = Number(row.fee) || 0;
  const values = [[
    new Date().toISOString(),
    String(row.service || ""),
    String(row.details || ""),
    amount,
    fee,
    amount + fee,
    String(row.status || ""),
    String(row.reference || ""),
    String(row.user || ""),
  ]];
  const r = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
    {
      method: "POST",
      headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  if (!r.ok) {
    throw new Error("sheet append failed: HTTP " + r.status);
  }
}