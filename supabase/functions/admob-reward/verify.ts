// Checks the signature on an AdMob rewarded-ad callback (server-side
// verification). Google signs everything in the query string before
// "&signature=" with one of the keys published at KEYS_URL (ECDSA P-256,
// SHA-256). Plain Web Crypto, so the same code runs in the Edge Function and
// in the tests.

export const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

/** Google's published keys: `base64` is the public key (SPKI, DER). */
export type VerifierKeys = { keys: { keyId: number; pem?: string; base64: string }[] };

/** The callback's fields we use. */
export type Reward = {
  transactionId: string;
  userId: string | null;
  customData: string | null;
  adUnit: string | null;
};

function fromBase64(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Web Crypto wants the signature as r and s side by side; Google sends it DER-encoded. */
export function derToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('bad_signature');
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const out = new Uint8Array(64);
  for (const at of [0, 32]) {
    if (der[i] !== 0x02) throw new Error('bad_signature');
    let len = der[i + 1];
    let start = i + 2;
    i = start + len;
    while (len > 32 && der[start] === 0) {
      start++;
      len--;
    }
    if (len > 32) throw new Error('bad_signature');
    out.set(der.subarray(start, start + len), at + 32 - len);
  }
  return out;
}

/**
 * The reward in `query` (the URL's query string, without the "?") when its
 * signature checks out with one of `keys`; null otherwise.
 */
export async function verifyReward(query: string, keys: VerifierKeys): Promise<Reward | null> {
  const cut = query.indexOf('&signature=');
  if (cut < 0) return null;
  const params = new URLSearchParams(query);
  const signature = params.get('signature');
  const keyId = Number(params.get('key_id'));
  const key = keys.keys.find((k) => k.keyId === keyId);
  if (!signature || !key) return null;
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      fromBase64(key.base64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      derToRaw(fromBase64(signature)),
      new TextEncoder().encode(query.slice(0, cut)),
    );
    if (!ok) return null;
  } catch {
    return null;
  }
  const transactionId = params.get('transaction_id');
  if (!transactionId) return null;
  return {
    transactionId,
    userId: params.get('user_id'),
    customData: params.get('custom_data'),
    adUnit: params.get('ad_unit'),
  };
}
