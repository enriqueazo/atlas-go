import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { countAnswer, EMPTY_PLAN, isDue, markShown, postpone, startVisit, type AdMode, type AdPlan } from '@/game/adSchedule';
import { localDay } from '@/game/shop';

import { AD_UNITS, TEST_DEVICE_IDS } from './config';
import { googleAds, type GoogleAds } from './googleAds';

// Google AdMob, as in Vocablo: the consent screen, rewarded ads (a hint each) and the
// full-screen ads between questions in solo games, on the schedule in
// game/adSchedule.ts. Where the library isn't in the build (web, Expo Go)
// the shop uses its test ad, and the ads between questions show a test
// stand-in on the same schedule (TestInterstitialHost).

const KEY = 'atlas-go/ads/v1';
/** How long to wait for an ad to load before giving up. */
const LOAD_TIMEOUT_MS = 15_000;
const RETRY_MS = 60_000;

type Interstitial = ReturnType<GoogleAds['InterstitialAd']['createForAdRequest']>;

let plan: AdPlan = EMPTY_PLAN;
let planLoaded: Promise<void> | null = null;
let started: Promise<boolean> | null = null;
let interstitial: Interstitial | null = null;
let interstitialReady = false;
let privacyRequired = false;

function loadPlan(): Promise<void> {
  planLoaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) {
        const { day, firstShown } = JSON.parse(raw);
        plan = { ...plan, day: day ?? '', firstShown: Array.isArray(firstShown) ? firstShown : [] };
      }
    })
    .catch(() => {});
  return planLoaded;
}

function savePlan(next: AdPlan) {
  const saved = plan.day !== next.day || plan.firstShown !== next.firstShown;
  plan = next;
  // Only the day's first ads are kept; visits start again when the app does.
  if (saved) AsyncStorage.setItem(KEY, JSON.stringify({ day: next.day, firstShown: next.firstShown })).catch(() => {});
}

/** True when this build can show real (Google) ads. */
export function hasRealAds(): boolean {
  return googleAds() !== null;
}

/**
 * Asks for consent where the law wants it (Google's form, in the EU and UK),
 * then Apple's tracking prompt on iPhone, then starts AdMob. Call once when
 * the app opens. Resolves to whether ads can be shown.
 */
export function startAds(): Promise<boolean> {
  started ??= (async () => {
    await loadPlan();
    const g = googleAds();
    if (!g) return false;
    try {
      const consent = await g.AdsConsent.gatherConsent();
      privacyRequired = consent.privacyOptionsRequirementStatus === g.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
      if (Platform.OS === 'ios') await askToTrack();
      if (!consent.canRequestAds) return false;
      await g.default().setRequestConfiguration({
        maxAdContentRating: g.MaxAdContentRating.T,
        testDeviceIdentifiers: TEST_DEVICE_IDS,
      });
      await g.default().initialize();
      loadInterstitial();
      return true;
    } catch (e) {
      console.warn('[ads] could not start', e);
      return false;
    }
  })();
  return started;
}

/** Apple's "allow tracking?" prompt. Saying no still shows ads, just not personalised. */
async function askToTrack() {
  try {
    const att: typeof import('expo-tracking-transparency') = require('expo-tracking-transparency');
    await att.requestTrackingPermissionsAsync();
  } catch (e) {
    console.warn('[ads] no tracking prompt in this build', e);
  }
}

/** Whether Settings should offer the consent form again (only where the law asks for it). */
export async function adPrivacyRequired(): Promise<boolean> {
  await startAds();
  return privacyRequired;
}

/** Google's form to change the ad consent. */
export async function openAdPrivacy(): Promise<void> {
  const g = googleAds();
  if (!g) return;
  try {
    await g.AdsConsent.showPrivacyOptionsForm();
  } catch (e) {
    console.warn('[ads] privacy form', e);
  }
}

function loadInterstitial() {
  const g = googleAds();
  if (!g || interstitial) return;
  const ad = g.InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
  interstitial = ad;
  interstitialReady = false;
  const unsubscribe = ad.addAdEventsListener(({ type }) => {
    if (type === g.AdEventType.LOADED) interstitialReady = true;
    if (type === g.AdEventType.ERROR || type === g.AdEventType.CLOSED) {
      unsubscribe();
      interstitial = null;
      interstitialReady = false;
      setTimeout(loadInterstitial, type === g.AdEventType.ERROR ? RETRY_MS : 0);
    }
  });
  ad.load();
}

let showTestInterstitial: (() => Promise<void>) | null = null;

/** Lets the root layout show the stand-in full-screen ad in builds without AdMob. */
export function setTestInterstitial(show: (() => Promise<void>) | null) {
  showTestInterstitial = show;
}

/** The player opened `mode`'s game screen: its ad count starts again. */
export async function startAdVisit(mode: AdMode): Promise<void> {
  await loadPlan();
  savePlan(startVisit(plan, mode, localDay()));
}

/** One more question answered in `mode`, for the full-screen ad schedule. */
export async function countAdQuestion(mode: AdMode): Promise<void> {
  await loadPlan();
  savePlan(countAnswer(plan, mode, localDay()));
}

/**
 * Shows the full-screen ad if `mode` has one due and it's loaded; resolves
 * when it's closed (at once if there is none). Never for No ads.
 * Without AdMob in the build it shows the test stand-in instead.
 */
export async function showAdIfDue(mode: AdMode, adFree: boolean): Promise<void> {
  await loadPlan();
  const g = googleAds();
  if (adFree || !isDue(plan, mode, localDay())) return;
  if (!g) {
    if (!showTestInterstitial) return;
    savePlan(markShown(plan, mode, localDay()));
    await showTestInterstitial();
    return;
  }
  const ad = interstitial;
  if (!ad || !interstitialReady) return;
  savePlan(markShown(plan, mode, localDay()));
  await new Promise<void>((resolve) => {
    const unsubscribe = ad.addAdEventsListener(({ type }) => {
      if (type === g.AdEventType.CLOSED || type === g.AdEventType.ERROR) {
        unsubscribe();
        resolve();
      }
    });
    ad.show().catch(() => {
      unsubscribe();
      resolve();
    });
  });
}

export type RewardedOutcome = 'earned' | 'closed' | 'no_ad';

/**
 * Loads and shows a rewarded ad. `userId` and `nonce` go to Google, which
 * passes them to our server (supabase/functions/admob-reward) when the ad
 * has been watched.
 */
export async function showRewardedAd(userId: string, nonce: string): Promise<RewardedOutcome> {
  const g = googleAds();
  if (!g || !(await startAds())) return 'no_ad';
  const ad = g.RewardedAd.createForAdRequest(AD_UNITS.rewarded, {
    serverSideVerificationOptions: { userId, customData: nonce },
  });
  const outcome = await new Promise<RewardedOutcome>((resolve) => {
    let earned = false;
    let shown = false;
    const timer = setTimeout(() => {
      if (!shown) finish('no_ad');
    }, LOAD_TIMEOUT_MS);
    const finish = (o: RewardedOutcome) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(o);
    };
    const unsubscribe = ad.addAdEventsListener(({ type }) => {
      if (type === g.RewardedAdEventType.LOADED) {
        shown = true;
        ad.show().catch(() => finish('no_ad'));
      } else if (type === g.RewardedAdEventType.EARNED_REWARD) {
        earned = true;
      } else if (type === g.AdEventType.CLOSED) {
        finish(earned ? 'earned' : 'closed');
      } else if (type === g.AdEventType.ERROR) {
        finish('no_ad');
      }
    });
    ad.load();
  });
  if (outcome === 'earned') {
    await loadPlan();
    savePlan(postpone(plan, localDay()));
  }
  return outcome;
}
