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

test('/callback redirect ke APP_URL#auth=<blob yang bisa di-unseal>&state=<nonce>', async () => {
  stub(200, { access_token: 'AT', refresh_token: '1//newrefresh' });
  const res = await worker.fetch(new Request(W + '/callback?code=abc&state=Ab-_9'), env);
  assert.equal(res.status, 302);
  const m = /^#auth=([^&]+)&state=Ab-_9$/.exec(res.headers.get('location').slice(APP_URL.length));
  assert.ok(m);
  assert.equal(await unseal(m[1], SEAL_KEY), '1//newrefresh');
});

test('/callback gagal redirect ke #auth-error dengan state', async () => {
  stub(400, { error: 'invalid_grant' });
  const res = await worker.fetch(new Request(W + '/callback?code=abc&state=N1'), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), APP_URL + '#auth-error=invalid_grant&state=N1');
});

test('state yang tidak valid tidak diteruskan', async () => {
  stub(200, { access_token: 'AT', refresh_token: 'r' });
  for (const bad of ['a%26auth%3Dx', 'x'.repeat(65), 'a.b']) {
    const res = await worker.fetch(new Request(W + `/callback?code=abc&state=${bad}`), env);
    assert.ok(!res.headers.get('location').includes('state='), bad);
    const login = await worker.fetch(new Request(W + `/login?state=${bad}`), env);
    assert.equal(new URL(login.headers.get('location')).searchParams.get('state'), null, bad);
  }
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
  const s = await worker.fetch(new Request(W + '/login?state=N1'), env);
  assert.equal(new URL(s.headers.get('location')).searchParams.get('state'), 'N1');
});

test('OPTIONS dari origin lain tidak mendapat header CORS', async () => {
  const res = await worker.fetch(new Request(W + '/token', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const ok = await worker.fetch(new Request(W + '/token', { method: 'OPTIONS', headers: { origin: 'https://user.github.io' } }), env);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://user.github.io');
});
