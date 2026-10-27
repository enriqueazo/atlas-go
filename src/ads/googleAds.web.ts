// No AdMob on the web: the test ad stands in.
export type GoogleAds = typeof import('react-native-google-mobile-ads');

export function googleAds(): GoogleAds | null {
  return null;
}
