import { Platform } from 'react-native';

// Atlas Go's AdMob ad units. Empty until the AdMob apps exist (docs/ads-setup.md,
// step 1): until then the app shows Google's sample ads, which never call our
// server, so the test shop gives the hint itself (public.reward_ad).
// The app ids (ca-app-pub-...~...) go in app.json, under the
// react-native-google-mobile-ads plugin.
const UNITS = {
  android: { rewarded: '', interstitial: '' },
  ios: { rewarded: '', interstitial: '' },
};

/**
 * Phones that get test ads even from our own units, so testing never counts
 * as real views (AdMob bans accounts for that). Each phone prints its id in
 * the logs the first time it asks for an ad.
 */
export const TEST_DEVICE_IDS: string[] = [];

// Google's sample units: always test ads.
const SAMPLES = {
  android: {
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
};

const platform = Platform.OS === 'ios' ? 'ios' : 'android';
const own = UNITS[platform];

/** True once our own units are in: then Google tells our server about each rewarded ad. */
export const OWN_AD_UNITS = own.rewarded !== '';

export const AD_UNITS = {
  rewarded: own.rewarded || SAMPLES[platform].rewarded,
  interstitial: own.interstitial || SAMPLES[platform].interstitial,
};
