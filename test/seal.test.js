import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from '../worker/seal.js';

const key = Buffer.alloc(32, 7).toString('base64');
const key2 = Buffer.alloc(32, 8).toString('base64');

test('seal lalu unseal mengembalikan teks asli', async () => {
  const b = await seal('1//refresh-abc', key);
  assert.notEqual(b, '1//refresh-abc');
  assert.equal(await unseal(b, key), '1//refresh-abc');
});
test('seal dua kali menghasilkan blob berbeda (iv acak)', async () => {
  assert.notEqual(await seal('x', key), await seal('x', key));
});
test('blob yang diubah satu karakter ditolak', async () => {
  const b = await seal('1//refresh-abc', key);
  const i = b.length - 3;
  const t = b.slice(0, i) + (b[i] === 'A' ? 'B' : 'A') + b.slice(i + 1);
  await assert.rejects(unseal(t, key));
});
test('kunci salah ditolak', async () => {
  const b = await seal('1//refresh-abc', key);
  await assert.rejects(unseal(b, key2));
});
