import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import {
  EMPTY_WALLET,
  fromServer,
  giftClaimedToday,
  localAd,
  localDay,
  localGift,
  localPurchase,
  localToday,
  spend,
  type Boost,
  type LocalChange,
  type ProductId,
  type ServerWallet,
  type Wallet,
} from '@/game/shop';

import { showRewardedAd } from '@/ads/ads';
import { OWN_AD_UNITS } from '@/ads/config';

import { ensureAccount } from './account';
import { CLOUD_READY } from './config';
import { call, failed, type Result } from './ranked';

// The wallet of hints and discards, as in Vocablo. The server owns it; the
// phone keeps a copy (so solo games can use it offline) and the ones used
// since, and sends them on the next sync. Every screen reads the same copy
// through useWallet. Without a Supabase project it lives on the phone alone.

const KEY = 'atlas-go/wallet/v1';

let wallet: Wallet = EMPTY_WALLET;
let loaded: Promise<void> | null = null;
let syncing: Promise<Result<Wallet>> | null = null;
const listeners = new Set<(w: Wallet) => void>();

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) wallet = { ...EMPTY_WALLET, ...JSON.parse(raw) };
      if (!CLOUD_READY) wallet = localToday(wallet);
    })
    .catch(() => {});
  return loaded;
}

function set(next: Wallet) {
  wallet = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((l) => l(next));
}

/** The wallet as last known on this phone. */
export async function getWallet(): Promise<Wallet> {
  await load();
  return wallet;
}

/** The wallet, kept up to date while the screen is open. */
export function useWallet(): Wallet {
  const [w, setW] = useState(wallet);
  useEffect(() => {
    listeners.add(setW);
    load().then(() => setW(wallet));
    return () => {
      listeners.delete(setW);
    };
  }, []);
  return w;
}

/** Uses one hint or discard from the wallet. False when there are none. */
export async function spendFromWallet(boost: Boost): Promise<boolean> {
  await load();
  const next = spend(wallet, boost);
  if (next === wallet) return false;
  set(CLOUD_READY ? next : { ...next, unsentHints: 0, unsentDiscards: 0 });
  if (CLOUD_READY) syncWallet();
  return true;
}

/** Sends what was used and reads the balance back. Never runs twice at once. */
export function syncWallet(): Promise<Result<Wallet>> {
  syncing ??= (async () => {
    try {
      await load();
      if (!CLOUD_READY) {
        set(localToday(wallet));
        return wallet;
      }
      const sent = { hints: wallet.unsentHints, discards: wallet.unsentDiscards };
      const r =
        sent.hints || sent.discards
          ? await call<ServerWallet>('spend_boosts', { p_hints: sent.hints, p_discards: sent.discards })
          : await call<ServerWallet>('my_wallet');
      if (failed(r)) return r;
      set(fromServer(r, wallet, sent));
      return wallet;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

type Changed = Result<Wallet & { granted?: boolean }>;

/** Runs a server change (gift, ad, purchase) after sending what was used; on the phone alone, `local`. */
async function change(fn: string, args: Record<string, unknown> | undefined, local: (w: Wallet) => LocalChange): Promise<Changed> {
  if (!CLOUD_READY) {
    await load();
    const r = local(wallet);
    if ('error' in r) return r;
    set(r.wallet);
    return { ...wallet, granted: r.granted };
  }
  const synced = await syncWallet();
  if (failed(synced)) return synced;
  const r = await call<ServerWallet & { granted?: boolean }>(fn, args);
  if (failed(r)) return r;
  set(fromServer(r, wallet));
  return { ...wallet, granted: r.granted };
}

/** Today's gift, if it isn't claimed yet. `granted` says whether it was given now. */
export function claimDailyGift() {
  return change('claim_daily_gift', { p_day: localDay() }, localGift);
}

/** Claims today's gift unless this phone already knows it was claimed. True when given now. */
export async function claimGiftIfDue(): Promise<boolean> {
  if (giftClaimedToday(await getWallet())) return false;
  const r = await claimDailyGift();
  return !failed(r) && r.granted === true;
}

/** The reward for a watched test ad (the test shop only: the app vouches for the ad), or No ads' daily hints. */
export function rewardAd() {
  return change('reward_ad', undefined, localAd);
}

/** How long to wait for Google to tell the server about a watched ad. */
const REWARD_WAIT_MS = 20_000;
const REWARD_POLL_MS = 1_500;

/**
 * Shows a real rewarded ad and returns the wallet with its hint, as in
 * Vocablo. With our own ad units Google tells the server, and this waits
 * until the hint is there; with Google's sample units (no call to our server)
 * the test shop gives it, and without a Supabase project the phone does.
 * Errors: 'offline', 'no_ad' (none to show), 'ad_closed' (closed early),
 * 'ad_pending' (watched, but the hint hasn't arrived yet).
 */
export async function watchAdForHint(): Promise<Changed> {
  const userId = CLOUD_READY ? await ensureAccount() : 'local';
  if (!userId) return { error: 'offline' };
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const outcome = await showRewardedAd(userId, nonce);
  if (outcome === 'no_ad') return { error: 'no_ad' };
  if (outcome === 'closed') return { error: 'ad_closed' };
  if (!CLOUD_READY || !OWN_AD_UNITS) return rewardAd();
  const until = Date.now() + REWARD_WAIT_MS;
  while (Date.now() < until) {
    const r = await call<ServerWallet & { found: boolean }>('ad_reward_status', { p_nonce: nonce });
    if (!failed(r) && r.found) {
      set(fromServer(r, wallet));
      return wallet;
    }
    await new Promise((resolve) => setTimeout(resolve, REWARD_POLL_MS));
  }
  syncWallet();
  return { error: 'ad_pending' };
}

/** A purchase with no store and no payment, while the shop is in test mode. */
export function testPurchase(product: ProductId) {
  return change('test_purchase', { p_product: product }, (w) => localPurchase(w, product));
}

/** After deleting the account: the wallet went with it. */
export async function forgetWallet(): Promise<void> {
  await load();
  set(CLOUD_READY ? EMPTY_WALLET : localToday(EMPTY_WALLET));
}
