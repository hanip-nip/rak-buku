import { newDeviceState } from './state.js';

const STORES = ['kv', 'blobs', 'outbox', 'meta'];
let dbp;
const db = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open('rak-buku', 1);
  r.onupgradeneeded = () => {
    for (const s of STORES) r.result.createObjectStore(s, s === 'outbox' ? { keyPath: 'id' } : undefined);
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => { dbp = undefined; rej(r.error); };
}));

// Resolve only after the transaction commits, so a write is durable once the promise resolves.
async function run(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    let req;
    try { req = fn(tx.objectStore(store)); } catch (e) { rej(e); return; }
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error ?? req?.error);
    tx.onabort = () => rej(tx.error ?? new Error('transaksi dibatalkan'));
  });
}
const get = (s, k) => run(s, 'readonly', (o) => o.get(k));
const put = (s, v, k) => run(s, 'readwrite', (o) => o.put(v, k));
const del = (s, k) => run(s, 'readwrite', (o) => o.delete(k));

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'PC';
};

export async function deviceId() {
  let id = await get('kv', 'deviceId');
  if (!id) { id = crypto.randomUUID(); await put('kv', id, 'deviceId'); }
  return id;
}

export async function getOwn() {
  return (await get('kv', 'own')) ?? newDeviceState(await deviceId(), deviceName());
}
export const saveOwn = (s) => put('kv', s, 'own');
export const getMerged = () => get('kv', 'merged');
export const saveMerged = (m) => put('kv', m, 'merged');
export const getRemote = async () => (await get('kv', 'remote')) ?? {};
export const saveRemote = (map) => put('kv', map, 'remote');
export const getAuth = async () => (await get('kv', 'auth')) ?? null;
export const setAuth = (blob) => (blob == null ? del('kv', 'auth') : put('kv', blob, 'auth'));

export const putBlob = (id, blob) => put('blobs', blob, id);
export const getBlob = (id) => get('blobs', id);
export const deleteBlob = (id) => del('blobs', id);
export const hasBlob = async (id) => (await run('blobs', 'readonly', (o) => o.count(id))) > 0;

export async function blobBytes() {
  const d = await db();
  return new Promise((res, rej) => {
    let total = 0;
    const tx = d.transaction('blobs', 'readonly');
    const c = tx.objectStore('blobs').openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) { total += cur.value.size; cur.continue(); } else res(total);
    };
    c.onerror = () => rej(c.error);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('transaksi dibatalkan'));
  });
}

export const getMeta = (id) => get('meta', id);
export const putMeta = (id, m) => put('meta', m, id);

export const outboxAll = () => run('outbox', 'readonly', (o) => o.getAll());
export const outboxPut = (job) => put('outbox', job);
export const outboxDelete = (id) => del('outbox', id);
