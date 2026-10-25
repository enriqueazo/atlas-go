import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

// The player's account. Everyone gets one automatically (an anonymous
// Supabase account) the first time they go online, so there is no sign-in
// screen. Signing in with Google, Apple or email can come later and keep this
// same account. Without a Supabase project (src/cloud/config.ts) everything
// here answers as if offline.

/** What other players see in leagues, rankings and duels. `country` is an ISO code from the game's map, or ZZ. */
export type Profile = { nickname: string; country: string };

export const NICKNAME = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]{3,20}$/;

const PROFILE_KEY = 'atlas-go/profile/v1';

let pending: Promise<string | null> | null = null;
let lastError: string | null = null;

/** The last error from Supabase, to show testers what went wrong. */
export function lastCloudError(): string | null {
  return lastError;
}

function fail(where: string, e: unknown): null {
  const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const code = e && typeof e === 'object' && 'code' in e ? ` [${(e as { code: unknown }).code}]` : '';
  lastError = `${where}: ${message}${code}`;
  console.warn('[cloud]', lastError);
  return null;
}

/** The player's account id, creating the account on first use. Null when offline. */
export function ensureAccount(): Promise<string | null> {
  const client = supabase;
  if (!client) return Promise.resolve(null);
  pending ??= (async () => {
    try {
      const { data } = await client.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: created, error } = await client.auth.signInAnonymously();
      if (error) return fail('Sign in', error);
      return created.user?.id ?? fail('Sign in', 'no user');
    } catch (e) {
      return fail('Sign in', e);
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** The profile saved on this phone, shown even without a connection. */
export async function getCachedProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

/** The profile from the cloud (and refreshes the copy on the phone). Null if there is none yet. */
export async function fetchProfile(): Promise<Profile | null> {
  const id = await ensureAccount();
  if (!id || !supabase) return getCachedProfile();
  const { data, error } = await supabase.from('profiles').select('nickname, country').eq('id', id).maybeSingle();
  if (error) {
    fail('Read profile', error);
    return getCachedProfile();
  }
  if (data) await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  else await AsyncStorage.removeItem(PROFILE_KEY);
  return data;
}

export type SaveResult = 'saved' | 'taken' | 'invalid' | 'offline';

export async function saveProfile(p: Profile): Promise<SaveResult> {
  lastError = null;
  const id = await ensureAccount();
  if (!id || !supabase) return 'offline';
  const { error } = await supabase.from('profiles').upsert({ id, ...p });
  if (error) {
    if (error.code === '23505') return 'taken'; // unique nickname
    if (error.code === '23514') return 'invalid'; // check constraint
    fail('Save profile', error);
    return 'offline';
  }
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  return 'saved';
}

/** Whether nobody else uses this nickname. Null when it can't be checked. */
export async function isNicknameAvailable(nickname: string): Promise<boolean | null> {
  if (!(await ensureAccount()) || !supabase) return null;
  const { data, error } = await supabase.rpc('nickname_available', { name: nickname });
  return error ? fail('Check name', error) : Boolean(data);
}

/** Deletes the account with its profile and everything online. Progress on this phone stays. */
export async function deleteAccount(): Promise<boolean> {
  if (!(await ensureAccount()) || !supabase) return false;
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    fail('Delete account', error);
    return false;
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  await AsyncStorage.removeItem(PROFILE_KEY);
  return true;
}
