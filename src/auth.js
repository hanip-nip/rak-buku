import * as store from './store.js';
import { WORKER_URL } from './config.js';

export class ReloginError extends Error {
  constructor() { super('relogin'); this.name = 'ReloginError'; }
}

// deps bisa diganti di tes (store memakai IndexedDB).
export const deps = { getAuth: store.getAuth, setAuth: store.setAuth };

let cache = null; // {token, exp}
let inflight = null;
let gen = 0; // naik tiap cache dibuang; fetch lama tak boleh mengisi cache lagi
export const _reset = () => { gen++; cache = null; inflight = null; };

export const login = () => { location.href = `${WORKER_URL}/login`; };
export const isLoggedIn = async () => (await deps.getAuth()) != null;
export async function logout() { _reset(); await deps.setAuth(null); }

export async function takeAuthFromHash() {
  const m = /^#(auth|auth-error)=(.*)$/.exec(location.hash);
  if (!m) return { taken: false };
  history.replaceState(null, '', location.pathname + location.search);
  let val;
  try { val = decodeURIComponent(m[2]); } catch { val = null; }
  if (m[1] === 'auth' && val) {
    await deps.setAuth(val);
    _reset();
    return { taken: true };
  }
  return { taken: false, error: val ?? 'data tidak valid' };
}

async function fetchToken(now) {
  const g = gen;
  const blob = await deps.getAuth();
  if (!blob) throw new ReloginError();
  const res = await fetch(`${WORKER_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob }),
  });
  if (res.status === 401) {
    await deps.setAuth(null);
    _reset();
    throw new ReloginError();
  }
  if (!res.ok) throw Object.assign(new Error(`token ${res.status}`), { status: res.status });
  const { access_token, expires_in } = await res.json();
  if (g === gen) cache = { token: access_token, exp: now + expires_in * 1000 };
  return access_token;
}

export function getToken(now = Date.now()) {
  if (cache && cache.exp - now > 60_000) return Promise.resolve(cache.token);
  if (inflight) return inflight;
  const p = fetchToken(now).finally(() => { if (inflight === p) inflight = null; });
  return (inflight = p);
}
