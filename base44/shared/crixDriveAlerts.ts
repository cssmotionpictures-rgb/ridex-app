// GOOGLE DRIVE PAYMENT ALERTS — every MAJOR completed utility payment is
// recorded as a small alert file in the team's connected Drive, so operations
// sees high-value electricity payments the moment they settle. Non-blocking:
// a Drive failure never affects the payment itself.

const FOLDER_NAME = "CRIXCOIN Utility Alerts";

async function accessTokenFor(svc: any): Promise<string> {
  const { accessToken } = await svc.connectors.getConnection("googledrive");
  return accessToken;
}

// Find the alerts folder (created by this app) or create it once.
async function ensureFolder(token: string): Promise<string> {
  const q = encodeURIComponent("name = '" + FOLDER_NAME + "' and mimeType = 'application/vnd.google-folder' and trashed = false");
  const list = await fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&pageSize=1", {
    headers: { Authorization: "Bearer " + token },
  });
  const listJson: any = await list.json().catch(() => null);
  if (listJson && listJson.files && listJson.files[0]) return String(listJson.files[0].id);
  const created = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-folder" }),
  });
  const createdJson: any = await created.json().catch(() => null);
  if (!createdJson || !createdJson.id) throw new Error("could not create the alerts folder");
  return String(createdJson.id);
}

export async function notifyMajorUtilityPayment(svc: any, p: {
  bill_key: string;
  biller_name: string;
  customer_reference: string;
  amount_ngn: number;
  fee: number;
  provider_ref: string;
}): Promise<void> {
  const token = await accessTokenFor(svc);
  const folderId = await ensureFolder(token);
  const when = new Date().toISOString();
  const text = [
    "MAJOR UTILITY PAYMENT COMPLETED",
    "===============================",
    "Time:        " + when,
    "Biller:       " + p.biller_name,
    "Customer:     " + p.customer_reference,
    "Amount:       NGN " + Number(p.amount_ngn || 0).toLocaleString("en-NG"),
    "Fee:          NGN " + Number(p.fee || 0).toLocaleString("en-NG"),
    "Reference:    " + p.bill_key,
    "Biller ref:   " + (p.provider_ref || "n/a"),
    "Status:       paid",
  ].join("\n");
  const boundary = "crxalert" + Date.now();
  const metadata = JSON.stringify({
    name: "Utility payment " + when.slice(0, 10) + " " + p.bill_key + ".txt",
    parents: [folderId],
  });
  const body =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + metadata +
    "\r\n--" + boundary + "\r\nContent-Type: text/plain\r\n\r\n" + text +
    "\r\n--" + boundary + "--";
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "multipart/related; boundary=" + boundary,
    },
    body,
  });
  if (!up.ok) throw new Error("drive upload failed: HTTP " + up.status);
}