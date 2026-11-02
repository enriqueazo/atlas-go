// AdMob calls this after each rewarded ad (server-side verification). It
// checks Google's signature and gives the player their hint through
// public.admob_reward() (supabase/migrations/*_admob_rewards.sql).
//
// Deploy:  supabase functions deploy admob-reward --no-verify-jwt
// Then, in AdMob, put the function's URL in the rewarded ad unit's
// "Server-side verification" field:
//   https://<project>.supabase.co/functions/v1/admob-reward

import { KEYS_URL, verifyReward, type VerifierKeys } from './verify.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;

let keys: { value: VerifierKeys; at: number } | null = null;

async function getKeys(refresh = false): Promise<VerifierKeys> {
  if (!keys || refresh || Date.now() - keys.at > KEYS_TTL_MS) {
    const res = await fetch(KEYS_URL);
    if (!res.ok) throw new Error(`keys ${res.status}`);
    keys = { value: await res.json(), at: Date.now() };
  }
  return keys.value;
}

async function grant(userId: string, transactionId: string, nonce: string | null): Promise<string> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers: Record<string, string> = { apikey: secret, 'Content-Type': 'application/json' };
  // A legacy service_role key is a JWT; the newer sb_secret_ keys go in apikey alone.
  if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/admob_reward`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user: userId, p_transaction: transactionId, p_nonce: nonce ?? '' }),
  });
  if (!res.ok) throw new Error(`admob_reward ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  const query = new URL(req.url).search.slice(1);
  try {
    // A key Google added since the last fetch: fetch them again.
    const keyId = Number(new URLSearchParams(query).get('key_id'));
    let known = await getKeys();
    if (!known.keys.some((k) => k.keyId === keyId)) known = await getKeys(true);
    const reward = await verifyReward(query, known);
    if (!reward) return new Response('bad signature', { status: 403 });
    // AdMob's "Verify URL" button sends a signed call with no player in it.
    if (!reward.userId || !UUID.test(reward.userId)) return new Response('ok: no player');
    const status = await grant(reward.userId, reward.transactionId, reward.customData);
    console.log('[admob-reward]', status, reward.transactionId, reward.adUnit);
    return new Response(`ok: ${status}`);
  } catch (e) {
    console.error('[admob-reward]', e);
    // Not 200, so Google tries again later.
    return new Response('error', { status: 500 });
  }
});
