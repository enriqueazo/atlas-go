// Pure rules for the shop and the wallet of hints and discards, as in
// Vocablo. The server owns the balance
// (supabase/migrations/*_wallet_and_shop.sql); the phone keeps a copy and the
// ones used offline, and sends those when it can. Until a Supabase project is
// set up (src/cloud/config.ts) the wallet lives on the phone alone, with the
// same rules, so the shop can be tried out.

export type ProductId = 'hints_10' | 'hints_50' | 'discards_10' | 'discards_50' | 'no_ads';

export type Product = {
  id: ProductId;
  /** Shown until the stores give the real, local price. */
  price: string;
  hints: number;
  discards: number;
  adFree: boolean;
};

// The same contents as private.product() on the server. Names are in i18n.ts.
export const PRODUCTS: Product[] = [
  { id: 'hints_10', price: '0,99 €', hints: 10, discards: 0, adFree: false },
  { id: 'hints_50', price: '3,99 €', hints: 50, discards: 0, adFree: false },
  { id: 'discards_10', price: '0,99 €', hints: 0, discards: 10, adFree: false },
  { id: 'discards_50', price: '3,99 €', hints: 0, discards: 50, adFree: false },
  { id: 'no_ads', price: '3,99 €', hints: 0, discards: 0, adFree: true },
];

/** Same as private.shop_rules() on the server. */
export const GIFT_DISCARDS = 1;
export const AD_HINTS = 1;
export const ADS_PER_DAY = 5;
/** How long the test ad lasts before its reward. */
export const TEST_AD_SECONDS = 5;

export type Boost = 'hint' | 'discard';

/** What the server says (my_wallet and the others). */
export type ServerWallet = {
  hints: number;
  discards: number;
  ad_free: boolean;
  gift_day: string | null;
  ads_left: number;
  test_purchases: boolean;
};

/** The copy on the phone: the server's last word, minus what was used since. */
export type Wallet = {
  hints: number;
  discards: number;
  adFree: boolean;
  giftDay: string | null;
  adsLeft: number;
  testPurchases: boolean;
  /** Used on this phone and not sent to the server yet. */
  unsentHints: number;
  unsentDiscards: number;
  /** The day `adsLeft` counts for, for the wallet that lives on the phone alone. */
  adDay?: string | null;
};

export const EMPTY_WALLET: Wallet = {
  hints: 0,
  discards: 0,
  adFree: false,
  giftDay: null,
  adsLeft: ADS_PER_DAY,
  testPurchases: false,
  unsentHints: 0,
  unsentDiscards: 0,
};

export function canSpend(w: Wallet, boost: Boost): boolean {
  return (boost === 'hint' ? w.hints : w.discards) > 0;
}

/** Uses one from the wallet (on this phone; the server hears about it later). */
export function spend(w: Wallet, boost: Boost): Wallet {
  if (!canSpend(w, boost)) return w;
  return boost === 'hint'
    ? { ...w, hints: w.hints - 1, unsentHints: w.unsentHints + 1 }
    : { ...w, discards: w.discards - 1, unsentDiscards: w.unsentDiscards + 1 };
}

/**
 * The new copy after the server answers. `sent` is what that call reported as
 * used; anything used while it was on its way is still to send, and still
 * comes off the balance.
 */
export function fromServer(s: ServerWallet, current: Wallet, sent = { hints: 0, discards: 0 }): Wallet {
  const unsentHints = Math.max(0, current.unsentHints - sent.hints);
  const unsentDiscards = Math.max(0, current.unsentDiscards - sent.discards);
  return {
    hints: Math.max(0, s.hints - unsentHints),
    discards: Math.max(0, s.discards - unsentDiscards),
    adFree: s.ad_free,
    giftDay: s.gift_day,
    adsLeft: Math.max(0, s.ads_left),
    testPurchases: s.test_purchases,
    unsentHints,
    unsentDiscards,
  };
}

/** The player's local date as YYYY-MM-DD, the day the daily gift goes by. */
export function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function giftClaimedToday(w: Wallet, now = new Date()): boolean {
  return w.giftDay !== null && w.giftDay >= localDay(now);
}

// The wallet on the phone alone, with the server's rules, while there is no
// Supabase project. Nothing is used up "unsent": there is nobody to send to.

/** The wallet on the phone alone, as it is today (the ads come back each day). */
export function localToday(w: Wallet, now = new Date()): Wallet {
  const day = localDay(now);
  const fresh = w.adDay === day ? w : { ...w, adDay: day, adsLeft: ADS_PER_DAY };
  return { ...fresh, testPurchases: true, unsentHints: 0, unsentDiscards: 0 };
}

export type LocalChange = { wallet: Wallet; granted?: boolean } | { error: string };

export function localGift(w: Wallet, now = new Date()): LocalChange {
  const today = localToday(w, now);
  if (giftClaimedToday(today, now)) return { wallet: today, granted: false };
  return { wallet: { ...today, discards: today.discards + GIFT_DISCARDS, giftDay: localDay(now) }, granted: true };
}

export function localAd(w: Wallet, now = new Date()): LocalChange {
  const today = localToday(w, now);
  if (today.adsLeft <= 0) return { error: 'ad_limit' };
  return { wallet: { ...today, hints: today.hints + AD_HINTS, adsLeft: today.adsLeft - 1 } };
}

export function localPurchase(w: Wallet, id: ProductId, now = new Date()): LocalChange {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return { error: 'unknown_product' };
  const today = localToday(w, now);
  return {
    wallet: { ...today, hints: today.hints + p.hints, discards: today.discards + p.discards, adFree: today.adFree || p.adFree },
  };
}

/** Points for a right answer with help: half, as in Vocablo. */
export const helpedPoints = (points: number, helped: boolean) => (helped ? Math.floor(points / 2) : points);
