import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
import { seal, unseal } from '../worker/seal.js';

const SEAL_KEY = Buffer.alloc(32, 7).toString('base64');
const APP_URL = 'https://user.github.io/rak-buku/';
const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', SEAL_KEY, APP_URL };
const W = 'https://w.example.workers.dev';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const stub = (status, body, calls = []) => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body) });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
};

test('/token mengembalikan access_token dari refresh token di dalam blob', async () => {
  const calls = stub(200, { access_token: 'AT', expires_in: 3599 });
  const blob = await seal('1//r', SEAL_KEY);
  const res = await worker.fetch(new Request(W + '/token', {
    method: 'POST', headers: { origin: 'https://user.github.io' }, body: JSON.stringify({ blob }),
  }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { access_token: 'AT', expires_in: 3599 });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://user.github.io');
  const p = new URLSearchParams(calls[0].body);
  assert.equal(p.get('grant_type'), 'refresh_token');
  assert.equal(p.get('refresh_token'), '1//r');
});

test('/token mengembalikan 401 relogin saat Google membalas invalid_grant', async () => {
  stub(400, { error: 'invalid_grant' });
  const blob = await seal('1//r', SEAL_KEY);
  const res = await worker.fetch(new Request(W + '/token', { method: 'POST', body: JSON.stringify({ blob }) }), env);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'relogin' });
});

test('/callback redirect ke APP_URL#auth=<blob yang bisa di-unseal>', async () => {
  stub(200, { access_token: 'AT', refresh_token: '1//newrefresh' });
  const res = await worker.fetch(new Request(W + '/callback?code=abc'), env);
  assert.equal(res.status, 302);
  const loc = res.headers.get('location');
  assert.ok(loc.startsWith(APP_URL + '#auth='));
  assert.equal(await unseal(loc.slice((APP_URL + '#auth=').length), SEAL_KEY), '1//newrefresh');
});

test('/callback gagal redirect ke #auth-error', async () => {
  stub(400, { error: 'invalid_grant' });
  const res = await worker.fetch(new Request(W + '/callback?code=abc'), env);
  assert.equal(res.status, 302);
  assert.ok(res.headers.get('location').startsWith(APP_URL + '#auth-error='));
});

test('/login redirect ke Google dengan access_type=offline dan scope drive.file', async () => {
  const res = await worker.fetch(new Request(W + '/login'), env);
  assert.equal(res.status, 302);
  const u = new URL(res.headers.get('location'));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(u.searchParams.get('redirect_uri'), W + '/callback');
});

test('OPTIONS dari origin lain tidak mendapat header CORS', async () => {
  const res = await worker.fetch(new Request(W + '/token', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const ok = await worker.fetch(new Request(W + '/token', { method: 'OPTIONS', headers: { origin: 'https://user.github.io' } }), env);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://user.github.io');
});
