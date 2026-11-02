import { TurboModuleRegistry } from 'react-native';

// The AdMob library, or null in a build without its native code (Expo Go, or
// an app built before it was added). Importing the library there throws as
// soon as it loads, and the development red screen shows that error even
// when it's caught, so check for the native module first.
export type GoogleAds = typeof import('react-native-google-mobile-ads');

let lib: GoogleAds | null | undefined;

export function googleAds(): GoogleAds | null {
  if (lib === undefined) {
    if (TurboModuleRegistry.get('RNGoogleMobileAdsModule') == null) {
      console.log('[ads] no AdMob in this build (Expo Go or an older build): using the test ad');
      lib = null;
    } else {
      try {
        lib = require('react-native-google-mobile-ads');
      } catch (e) {
        console.warn('[ads] could not load react-native-google-mobile-ads', e);
        lib = null;
      }
    }
  }
  return lib ?? null;
}
