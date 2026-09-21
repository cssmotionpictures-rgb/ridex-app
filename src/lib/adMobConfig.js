// AD MOB CONFIG — the single place every ad-unit ID lives.
//
// YOUR ADMOB APP ID: ca-app-pub-1935728615811609~5782300518
//   It is NOT an ad-unit ID. On this platform it is configured as the
//   ADMOB_APP_ID secret (Settings → Secrets), which the native Android/iOS
//   build reads — there is no AndroidManifest.xml to edit here.
//
// TEST MODE — while Ride X is NOT published on Google Play, always keep this
// true: every ad request then uses Google's OFFICIAL test ad-unit IDs
// (Google labels every test ad "Test Ad" so it is clearly identifiable).
// Never run your production units during development and never click test
// ads — repeated production impressions/clicks from an unpublished app flag
// invalid traffic.
//
// >>> GOING TO PRODUCTION (the ONLY change needed):
//   1. Create Banner / Interstitial / Rewarded ad units in your AdMob
//      dashboard (each looks like ca-app-pub-1935728615811609/XXXXXXXXXX —
//      note the "/" instead of the App ID's "~").
//   2. Paste each real ID into PROD_AD_UNITS below.
//   3. Flip AD_MOB_TEST_MODE to false.
export const AD_MOB_TEST_MODE = false;

// Google's OFFICIAL Android test ad-unit IDs (safe for development).
export const TEST_AD_UNITS = {
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1035307713",
  rewarded: "ca-app-pub-3940256099942544/5224926801483583",
};

// PRODUCTION IDs — served at runtime by the get-ad-config backend function,
// which reads them from the app secrets:
//   · ADMOB_REWARDED_AD_UNIT_ID — your real Rewarded ad-unit ID (SET)
//   · ADMOB_BANNER_AD_UNIT_ID / ADMOB_INTERSTITIAL_AD_UNIT_ID — set these
//     secrets the same way when you create those ad units in AdMob.
// The placeholders below are only a hard-code fallback if that call ever
// fails. Nothing needs editing here: create the ad units in AdMob, save the
// secrets, then flip AD_MOB_TEST_MODE to false once the app is on Google Play.
import { base44 } from "@/api/base44Client";

export const PROD_AD_UNITS = {
  banner: "BANNER_AD_UNIT_ID",
  interstitial: "INTERSTITIAL_AD_UNIT_ID",
  rewarded: "REWARDED_AD_UNIT_ID",
};

// Resolve an ad-unit ID. Test mode short-circuits to Google's official test
// units (no network call, per policy: production units only once published).
// Production mode fetches your real IDs from the get-ad-config function once
// per session and caches them; a failed fetch falls back to the placeholders
// (which fail ID validation in the bridge, so the SDK is never called with
// a bad ID).
let prodAdUnitsCache = null;
export async function adUnitForAsync(type) {
  if (AD_MOB_TEST_MODE) return TEST_AD_UNITS[type];
  if (!prodAdUnitsCache) {
    try {
      const res = await base44.functions.invoke("get-ad-config", {});
      prodAdUnitsCache = res?.data?.adUnits || {};
    } catch {
      prodAdUnitsCache = {};
    }
  }
  return prodAdUnitsCache[type] || PROD_AD_UNITS[type];
}