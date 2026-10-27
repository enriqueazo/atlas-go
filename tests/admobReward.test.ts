import assert from 'node:assert/strict';
import { test } from 'node:test';

import { derToRaw, verifyReward, type VerifierKeys } from '../supabase/functions/admob-reward/verify.ts';

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** r and s side by side -> DER, as Google sends it. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if (v[0] & 0x80) v = Uint8Array.from([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}

async function signer() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const keys: VerifierKeys = { keys: [{ keyId: 42, base64: Buffer.from(spki).toString('base64') }] };
  const sign = async (content: string, keyId = 42) => {
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(content)),
    );
    return `${content}&signature=${b64url(rawToDer(raw))}&key_id=${keyId}`;
  };
  return { keys, sign };
}

const CONTENT =
  'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=nonce-1&reward_amount=1&reward_item=pista' +
  '&timestamp=1761500000000&transaction_id=abc123&user_id=11111111-1111-1111-1111-111111111111';

test('a callback signed by Google gives the reward', async () => {
  const { keys, sign } = await signer();
  const reward = await verifyReward(await sign(CONTENT), keys);
  assert.deepEqual(reward, {
    transactionId: 'abc123',
    userId: '11111111-1111-1111-1111-111111111111',
    customData: 'nonce-1',
    adUnit: '1234567890',
  });
});

test('a changed callback, an unknown key or no signature gives nothing', async () => {
  const { keys, sign } = await signer();
  const signed = await sign(CONTENT);
  assert.equal(await verifyReward(signed.replace('user_id=1111', 'user_id=2222'), keys), null);
  assert.equal(await verifyReward(await sign(CONTENT, 7), keys), null);
  assert.equal(await verifyReward(CONTENT, keys), null);
  const other = await signer();
  assert.equal(await verifyReward(signed, other.keys), null);
});

test('DER signatures with short or padded numbers convert to 64 bytes', () => {
  const raw = new Uint8Array(64);
  raw[31] = 5; // r = 5 (one byte in DER)
  raw[32] = 0x90; // s starts with a high bit (padded with a 0 in DER)
  assert.deepEqual(derToRaw(rawToDer(raw)), raw);
});
