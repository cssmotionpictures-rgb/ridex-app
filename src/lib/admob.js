import { AD_MOB_TEST_MODE, adUnitForAsync } from "@/lib/adMobConfig";

// RIDE X AD SYSTEM — native AdMob bridge.
//
// Architecture: this is a Base44 web app. The same code runs in the browser
// AND inside the platform's native Android/iOS wrapper. Real AdMob (Google
// Mobile Ads) only exists inside the native wrapper — the browser has NO
// AdMob SDK and this module NEVER pretends otherwise: in the browser every
// helper resolves false and the app keeps its real web-ad system (house
// banner + real video creatives + paid sponsor ads + AdEvent ledger).
//
// The AdMob APP ID (ca-app-pub-1935728615811609~5782300518) is NOT an ad-unit
// ID — it is configured in the platform secrets as ADMOB_APP_ID and injected
// into the native build. This code only ever handles AD-UNIT IDs
// (ca-app-pub-…/XXXXXXXXXX format), all resolved from src/lib/adMobConfig.js.
//
// Safety rules enforced here:
//   · The native SDK is NEVER called with a missing/placeholder ad-unit ID.
//   · Rewards are granted ONLY on the SDK's confirmed reward callback.
//   · Duplicate rewarded requests / callbacks can never double-fire.
//   · Interstitials have a cooldown so they can never spam the user.
//   · Every failure is logged (no PII) and falls back gracefully — no crash.
// While AD_MOB_TEST_MODE is true all requests use Google's OFFICIAL test IDs.

const log = (...args) => console.debug("[AdMob]", ...args);

// Valid ad-unit ID shape: "ca-app-pub-XXXXXXXXXXXXXXX/XXXXXXXXXX" — anything
// else (empty, placeholder, or the App ID's "~" format) blocks the SDK call.
const AD_UNIT_RE = /^ca-app-pub-\d{10,16}\/[0-9A-Za-z]{6,}$/;

export const isNativeAdEnvironment = () =>
  !!(window.Capacitor?.Plugins?.AdMob || window.AdMob || window.cordova);

// Back-compat alias (existing callers import this name).
export const isNativeAdMobAvailable = isNativeAdEnvironment;

const plugin = () => window.Capacitor?.Plugins?.AdMob || null;

// Resolve + verify an ad-unit ID. Returns null (and logs a safe error) when
// the ID is missing or is still a placeholder — the caller then falls back
// to the web-ad system instead of calling the native SDK with a bad ID.
const resolveAdUnitId = async (type) => {
  const id = await adUnitForAsync(type);
  if (!id || !AD_UNIT_RE.test(id)) {
    log(`ad-unit ID for "${type}" is missing or still a placeholder — native ad request BLOCKED (never called with an empty ID). Configure the real ID in src/lib/adMobConfig.js or keep AD_MOB_TEST_MODE=true.`);
    return null;
  }
  return id;
};

// Idempotent SDK initialization — safe to call repeatedly from any helper;
// never crashes when the bridge is absent (browser).
let initialized = false;
export async function initializeAds() {
  const AdMob = plugin();
  if (!AdMob || initialized) return false;
  initialized = true; // set first: never double-init, even if init fails
  try {
    if (typeof AdMob.initialize === "function") {
      await AdMob.initialize({ initializeForTesting: AD_MOB_TEST_MODE });
    }
    log("initialized · environment: NATIVE wrapper · test mode:", AD_MOB_TEST_MODE);
    return true;
  } catch (e) {
    log("initialize failed — ads stay off, the app continues normally:", e?.message || e);
    return false;
  }
}

// ---- REWARDED (movie-unlock flow) ----
// Returns true ONLY when the SDK itself confirmed the reward event. A
// dismissed ad, a failed ad or a missing ID returns false and the caller
// falls back to the real web video creative — the reward is never granted
// just because the ad was requested.
let rewardInFlight = false;
export async function showAdMobRewarded() {
  if (rewardInFlight) {
    log("rewarded request ignored — another rewarded ad is already in flight");
    return false;
  }
  const adUnitID = await resolveAdUnitId("rewarded");
  if (!adUnitID) return false;
  rewardInFlight = true;
  try {
    await initializeAds();
    log("rewarded request:", AD_MOB_TEST_MODE ? "TEST unit" : "production unit");

    // 1) Capacitor @capacitor-community/admob (Base44 native build)
    try {
      const AdMob = plugin();
      if (AdMob && typeof AdMob.prepareRewardVideoAd === "function") {
        await AdMob.prepareRewardVideoAd({ adUnitID }).catch((e) =>
          log("rewarded prepare failed:", e?.message || e)
        );
        const res = await AdMob.showRewardVideoAd().catch((e) => {
          log("rewarded show failed:", e?.message || e);
          return null;
        });
        if (res && (res.rewardAmount || res.type === "rewarded" || res.earnedRewarded)) {
          log("reward CONFIRMED by the SDK");
          return true;
        }
        log("rewarded dismissed or failed — NO reward granted");
        return false;
      }
    } catch (e) {
      log("rewarded error:", e?.message || e);
    }

    // 2) Cordova AdMob Plus / legacy plugin
    try {
      if (window.AdMob && typeof window.AdMob.showRewarded === "function") {
        return await new Promise((resolve) =>
          window.AdMob.showRewarded(
            () => { log("reward CONFIRMED (cordova bridge)"); resolve(true); },
            () => { log("rewarded dismissed (cordova) — no reward"); resolve(false); }
          )
        );
      }
    } catch (e) {
      log("cordova rewarded error:", e?.message || e);
    }

    return false;
  } finally {
    rewardInFlight = false;
  }
}

// ---- INTERSTITIAL (helper — intentionally NOT wired into any screen: Ride X
// has no confirmed safe natural break yet. Per policy it must NEVER show at
// launch, during booking/pickup/drop-off, an active ride, navigation,
// payment or safety actions. Frequency guard: one interstitial per 3 minutes
// maximum, so it can never spam even once wired.) ----
const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000;
let lastInterstitialAt = 0;

export async function showAdMobInterstitialIfAvailable() {
  if (Date.now() - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) {
    log("interstitial skipped — cooldown active");
    return false;
  }
  const AdMob = plugin();
  const adUnitID = await resolveAdUnitId("interstitial");
  if (!AdMob || typeof AdMob.prepareInterstitial !== "function" || !adUnitID) return false;
  lastInterstitialAt = Date.now();
  try {
    await initializeAds();
    await AdMob.prepareInterstitial({ adUnitID }).catch((e) =>
      log("interstitial prepare failed:", e?.message || e)
    );
    await AdMob.showInterstitial().catch((e) => log("interstitial show failed:", e?.message || e));
    log("interstitial shown:", AD_MOB_TEST_MODE ? "TEST unit" : "production unit");
    return true;
  } catch (e) {
    log("interstitial failed:", e?.message || e);
    return false;
  }
}

// ---- BANNER (native overlay — returns false in the browser so the in-flow
// house banner keeps its place; an overlay banner's exact position must be
// confirmed on a real device before wiring it to a screen so it never covers
// booking fields, maps, driver or safety controls) ----
export async function showAdMobBannerIfAvailable(position = "BOTTOM_CENTER") {
  const AdMob = plugin();
  const adUnitID = await resolveAdUnitId("banner");
  if (!AdMob || typeof AdMob.showBanner !== "function" || !adUnitID) return false;
  try {
    await initializeAds();
    await AdMob.showBanner({ adUnitID, position, margin: 0 });
    log("banner shown:", AD_MOB_TEST_MODE ? "TEST unit" : "production unit");
    return true;
  } catch (e) {
    log("banner failed:", e?.message || e);
    return false;
  }
}

export async function hideAdMobBanner() {
  try {
    await plugin()?.hideBanner?.();
    log("banner hidden");
  } catch {}
}

export async function destroyBanner() {
  try {
    const AdMob = plugin();
    await (AdMob?.removeBanner?.() || AdMob?.destroyBanner?.());
    log("banner destroyed");
  } catch {}
}