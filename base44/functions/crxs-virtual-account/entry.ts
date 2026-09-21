import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { flwV3Request } from "../../shared/flutterwaveV3.ts";

// CRIXCOIN deposit account (Flutterwave virtual account number) — one per
// user, for NGN deposits. Issued ONLY by a real Flutterwave API response —
// never fabricated. The BVN required by Nigerian regulation is passed to
// Flutterwave and NEVER stored in this app. Idempotent: a user who already
// has a deposit account gets it back, never a second one.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch (e) { payload = {}; }
    const bvn = typeof payload.bvn === "string" ? payload.bvn.trim() : "";
    const phonenumber = typeof payload.phonenumber === "string" ? payload.phonenumber.trim() : "";
    const firstname = typeof payload.firstname === "string" && payload.firstname.trim() ? payload.firstname.trim() : String(user.full_name || "").split(" ")[0] || "CRIX";
    const lastname = typeof payload.lastname === "string" && payload.lastname.trim() ? payload.lastname.trim() : String(user.full_name || "").split(" ").slice(1).join(" ") || "User";

    const service = base44.asServiceRole;
    const rows = await service.entities.CrxsSmartAccount.filter({ user_id: user.id });
    const account = (rows || [])[0] || null;
    if (!account || account.status !== "CREATED" || !account.account_address) {
      return Response.json({ error: "NO_CRIXCOIN_ADDRESS — create your CRIXCOIN address first" }, { status: 409 });
    }
    if (account.flutterwave_virtual_account) {
      return Response.json({
        ok: true,
        created: false,
        account_number: account.flutterwave_virtual_account,
        bank_name: account.flutterwave_bank_name,
        note: "Existing deposit account returned — one permanent deposit account per user",
      });
    }
    if (!/^\d{11}$/.test(bvn)) {
      return Response.json({ error: "BVN_REQUIRED — an 11-digit Bank Verification Number is required to issue a deposit account. It is passed to the provider and never stored here." }, { status: 400 });
    }
    if (!phonenumber) return Response.json({ error: "PHONE_REQUIRED — a phone number is required to issue a deposit account" }, { status: 400 });
    if (!user.email) return Response.json({ error: "EMAIL_REQUIRED — your account needs an email address before a deposit account can be issued" }, { status: 400 });

    const txRef = "crxs-deposit-" + user.id + "-" + Date.now();
    const response = await flwV3Request("POST", "/v3/virtual-account-numbers", {
      email: user.email,
      is_permanent: true,
      bvn,
      tx_ref: txRef,
      phonenumber,
      firstname,
      lastname,
    });
    const data = response.json && response.json.data ? response.json.data : null;
    if (!response.ok || !data || !data.account_number) {
      return Response.json({
        error: "PROVIDER_REFUSED — " + String((response.json && response.json.message) || "no account number was returned"),
        provider_status: response.status,
        note: "Nothing was recorded — a deposit account exists only after the provider actually issued it",
      }, { status: 502 });
    }

    await service.entities.CrxsSmartAccount.update(account.id, {
      flutterwave_virtual_account: String(data.account_number),
      flutterwave_bank_name: String(data.bank_name || ""),
      flutterwave_account_reference: txRef,
    });

    return Response.json({
      ok: true,
      created: true,
      account_number: String(data.account_number),
      bank_name: String(data.bank_name || ""),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}