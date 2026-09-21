import { secrets } from "base44:runtime";

// PUBLIC AD CONFIG — serves the app's real AdMob AD-UNIT IDs to the client.
// Ad-unit IDs (ca-app-pub-…/…) are public identifiers that ship inside every
// published app, so they are safe to return here — the App ID and API keys
// stay out of it. Real IDs live in the app secrets (Settings → Secrets), so
// they can be rotated without a code edit. Unset or malformed secrets are
// returned as null and the client keeps its safe fallback (test IDs / no ad).
const AD_UNIT_RE = /^ca-app-pub-\d{10,16}\/[0-9A-Za-z]{6,}$/;

export default async function (req) {
  try {
    const pick = (name) => {
      try {
        const v = secrets.get(name);
        return v && AD_UNIT_RE.test(v) ? v : null;
      } catch {
        return null;
      }
    };
    return Response.json({
      adUnits: {
        rewarded: pick("ADMOB_REWARDED_AD_UNIT_ID"),
        banner: pick("ADMOB_BANNER_AD_UNIT_ID"),
        interstitial: pick("ADMOB_INTERSTITIAL_AD_UNIT_ID"),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}