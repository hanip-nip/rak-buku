import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, setActiveSeries, syncOnChange } from '../src/sync.js';

class ReloginError extends Error { constructor() { super('relogin'); this.name = 'ReloginError'; } }
const err = (status) => Object.assign(new Error(`drive ${status}`), { status });
const ME = 'A';
const stateOf = (id, series = [], progress = {}) => ({ device: { id, name: id }, series, progress, bookmarks: [] });
const file = (id, extra = {}) => ({ id, driveId: null, name: `${id}.pdf`, size: 20, pages: 1, order: 0, updatedAt: 1, deleted: false, ...extra });

let log, st, drv, au, deps;
const clone = (o) => structuredClone(o);

beforeEach(() => {
  setActiveSeries(null);
  log = [];
  st = {
    own: stateOf(ME, [{ id: 's1', title: 'S', category: 'komik', cover: '', files: [file('f1')], updatedAt: 1, deleted: false }]),
    remote: {}, kv: {}, outbox: new Map(), blobs: new Map([['f1', new Blob(['x'.repeat(20)])]]), meta: new Map(), merged: null,
  };
  const store = {
    deviceId: async () => ME,
    getOwn: async () => clone(st.own),
    updateOwn: async (fn) => { log.push('updateOwn'); st.own = fn(clone(st.own)); return st.own; },
    getRemote: async () => clone(st.remote),
    saveRemote: async (m) => { st.remote = clone(m); },
    saveMerged: async (m) => { st.merged = m; },
    getKv: async (k) => st.kv[k],
    setKv: async (k, v) => { st.kv[k] = v; },
    getBlob: async (id) => st.blobs.get(id),
    hasBlob: async (id) => st.blobs.has(id),
    putBlob: async (id, b) => { st.blobs.set(id, b); },
    putMeta: async (id, m) => { st.meta.set(id, m); },
    outboxAll: async () => [...st.outbox.values()].map(clone),
    outboxPut: async (j) => { log.push('outboxPut'); st.outbox.set(j.id, clone(j)); },
    outboxDelete: async (id) => { log.push('outboxDelete'); st.outbox.delete(id); },
  };
  drv = {
    ensureFolder: async () => 'F',
    forgetFolder: async () => {},
    listStatus: async () => [],
    readJson: async (t, id) => { log.push(`readJson:${id}`); throw new Error('unexpected'); },
    writeJson: async (t, folder, name) => { log.push(`writeJson:${name}`); return 'OWN'; },
    startUpload: async () => { log.push('startUpload'); return 'U-new'; },
    uploadOffset: async () => { throw new Error('unexpected'); },
    uploadChunk: async (url, blob, start) => { log.push(`uploadChunk:${url}:${start}`); return { done: true, driveId: 'D1' }; },
    trash: async (t, id) => { log.push(`trash:${id}`); },
    downloadRange: async () => { throw new Error('unexpected'); },
  };
  au = { isLoggedIn: async () => true, getToken: async () => 'T', _reset: () => { log.push('reset'); } };
  deps = { drive: drv, store, auth: au, now: () => 1000, online: () => true };
});

test('upload yang terputus dilanjutkan dari sessionUrl dan offset tersimpan', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1', sessionUrl: 'U', size: 20 });
  drv.uploadOffset = async (url, size) => { log.push(`uploadOffset:${url}:${size}`); return { done: false, next: 10 }; };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(log.includes('uploadOffset:U:20'));
  assert.ok(log.includes('uploadChunk:U:10'));
  assert.ok(!log.includes('startUpload'));
  assert.equal(st.own.series[0].files[0].driveId, 'D1');
  assert.equal(st.outbox.size, 0);
});

test('relogin: outbox dan status lokal tidak berubah', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  const own = clone(st.own), box = clone([...st.outbox.values()]);
  au.getToken = async () => { throw new ReloginError(); };
  assert.equal(await createSync(deps).run(), 'relogin');
  assert.deepEqual(st.own, own);
  assert.deepEqual([...st.outbox.values()], box);
  assert.ok(!log.includes('updateOwn') && !log.includes('outboxPut') && !log.includes('outboxDelete'));
});

test('status perangkat lain yang tidak berubah tidak di-download ulang', async () => {
  st.remote = { B: { modifiedTime: 't1', state: stateOf('B'), fileId: 'xb' } };
  drv.listStatus = async () => [{ id: 'xb', name: 'status-B.json', modifiedTime: 't1' }];
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(!log.some((l) => l.startsWith('readJson')));
  assert.ok(st.remote.B);
});

test('setelah sync, seri dari perangkat B muncul di merged', async () => {
  const b = stateOf('B', [{ id: 's9', title: 'Dari B', category: 'novel', cover: '', files: [file('g1', { driveId: 'D9' })], updatedAt: 5, deleted: false }]);
  drv.listStatus = async () => [{ id: 'xb', name: 'status-B.json', modifiedTime: 't2' }, { id: 'OWN', name: `status-${ME}.json`, modifiedTime: 't0' }];
  drv.readJson = async (t, id) => { log.push(`readJson:${id}`); return b; };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.deepEqual(log.filter((l) => l.startsWith('readJson')), ['readJson:xb']);
  assert.ok(st.merged.series.some((s) => s.id === 's9'));
  assert.equal(st.remote.B.modifiedTime, 't2');
  assert.ok(log.includes(`writeJson:status-${ME}.json`));
});

test('run kedua saat run pertama berjalan → busy', async () => {
  let release;
  drv.ensureFolder = () => new Promise((r) => { release = () => r('F'); });
  const sync = createSync(deps);
  const first = sync.run();
  assert.equal(await sync.run(), 'busy');
  await new Promise((r) => setImmediate(r));
  release();
  assert.equal(await first, 'ok');
  sync.stop(); // batalkan run ulangan yang dijadwalkan karena 'busy'
});

test('Drive 401 sekali → token diperbarui dan langkah diulang', async () => {
  let n = 0;
  drv.listStatus = async () => { if (n++ === 0) throw err(401); return []; };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.equal(n, 2);
  assert.ok(log.includes('reset'));
});

test('Drive 401 dua kali → relogin', async () => {
  drv.listStatus = async () => { throw err(401); };
  assert.equal(await createSync(deps).run(), 'relogin');
});

test('trash 404 dianggap selesai, job dihapus', async () => {
  st.outbox.set('j2', { id: 'j2', type: 'trash', seriesId: 's1', driveIds: ['X1', 'X2'] });
  drv.trash = async (t, id) => { log.push(`trash:${id}`); if (id === 'X1') throw err(404); };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(log.includes('trash:X2'));
  assert.equal(st.outbox.size, 0);
});

test('status sendiri ditulis sebelum upload panjang dimulai, dan lagi setelahnya', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  assert.equal(await createSync(deps).run(), 'ok');
  const w = log.indexOf(`writeJson:status-${ME}.json`);
  const u = log.findIndex((l) => l.startsWith('uploadChunk'));
  assert.ok(w >= 0 && w < u);
  assert.ok(log.lastIndexOf(`writeJson:status-${ME}.json`) > u);
  assert.ok(log.indexOf('outboxPut') < u, 'sessionUrl disimpan sebelum chunk pertama');
});

test('blob lokal hilang → job upload dibuang', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  st.blobs.clear();
  assert.equal(await createSync(deps).run(), 'ok');
  assert.equal(st.outbox.size, 0);
  assert.ok(!log.includes('startUpload'));
});

test('sesi upload kedaluwarsa (410) → mulai ulang', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1', sessionUrl: 'U', size: 20 });
  drv.uploadOffset = async () => { throw err(410); };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(log.includes('startUpload') && log.includes('uploadChunk:U-new:0'));
});

test('offline di tengah upload → berhenti, job tetap', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  let on = true;
  deps.online = () => on;
  drv.uploadChunk = async (u, b, start) => { log.push(`uploadChunk:${start}`); on = false; return { done: false, next: 10 }; };
  assert.equal(await createSync(deps).run(), 'offline');
  assert.equal(st.outbox.size, 1);
  assert.equal(log.filter((l) => l.startsWith('uploadChunk')).length, 1);
});

test('prefetch seri aktif per rentang 8 MiB lalu simpan meta, blob, dan rak:file-ready', async () => {
  const M = 8 * 1024 * 1024;
  st.own.series[0].files = [file('f1', { driveId: 'D1', size: M + 5 })];
  st.blobs.clear();
  setActiveSeries('s1');
  const ranges = [];
  drv.downloadRange = async (t, id, a, b) => { ranges.push([id, a, b]); return new Blob([new Uint8Array(b - a + 1)]); };
  let destroyed = false;
  const pdf = {
    openPdf: async (blob) => ({ blob, destroy: () => { destroyed = true; } }),
    pageSizes: async () => [{ w: 1, h: 2 }],
    outlinePages: async () => [],
  };
  const events = [];
  globalThis.dispatchEvent = (e) => { events.push(e); return true; };
  try {
    assert.equal(await createSync({ ...deps, pdf }).run(), 'ok');
  } finally { delete globalThis.dispatchEvent; }
  assert.deepEqual(ranges, [['D1', 0, M - 1], ['D1', M, M + 4]]);
  assert.equal(st.blobs.get('f1').size, M + 5);
  assert.equal(st.blobs.get('f1').type, 'application/pdf');
  assert.deepEqual(st.meta.get('f1'), { sizes: [{ w: 1, h: 2 }], outline: [] });
  assert.ok(destroyed);
  assert.ok(events.some((e) => e.type === 'rak:file-ready' && e.detail.fileId === 'f1'));
});

const pdfOk = { openPdf: async () => ({ destroy() {} }), pageSizes: async () => [{ w: 1, h: 1 }], outlinePages: async () => [] };

test('downloadRange 200 berisi seluruh file → dianggap lengkap', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1', size: 9 * 1024 * 1024 })];
  st.blobs.clear();
  setActiveSeries('s1');
  let n = 0;
  drv.downloadRange = async () => { n++; return new Blob([new Uint8Array(9 * 1024 * 1024)]); };
  assert.equal(await createSync({ ...deps, pdf: pdfOk }).run(), 'ok');
  assert.equal(n, 1);
  assert.ok(st.blobs.has('f1'));
});

test('prefetch gagal → run tetap ok, file dilewati 30 menit', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1' })];
  st.blobs.clear();
  setActiveSeries('s1');
  let n = 0, t = 1000;
  drv.downloadRange = async () => { n++; return new Blob([new Uint8Array(20)]); };
  const pdf = { ...pdfOk, openPdf: async () => { throw new Error('PDF rusak'); } };
  const sync = createSync({ ...deps, pdf, now: () => t });
  const err0 = console.error; console.error = () => {};
  try {
    assert.equal(await sync.run(), 'ok');
    assert.equal(st.kv['prefetchFail:f1'], 1000);
    assert.equal(st.kv.lastSync, 1000);
    t += 29 * 60_000;
    assert.equal(await sync.run(), 'ok');
    assert.equal(n, 1, 'tidak di-download ulang dalam 30 menit');
    t += 2 * 60_000;
    await sync.run();
    assert.equal(n, 2);
  } finally { console.error = err0; }
});

test('seri dihapus selama upload → file baru di Drive di-trash', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  drv.uploadChunk = async (u, b, start) => { log.push(`uploadChunk:${u}:${start}`); st.own.series[0].deleted = true; return { done: true, driveId: 'DNEW' }; };
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(log.includes('trash:DNEW'));
  assert.equal(st.outbox.size, 0);
});

test('upload tidak dihapus → tidak di-trash', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  assert.equal(await createSync(deps).run(), 'ok');
  assert.ok(!log.some((l) => l.startsWith('trash')));
});

test('status sendiri ditulis ulang di tengah upload panjang setelah ≥ 30 detik', async () => {
  st.outbox.set('j1', { id: 'j1', type: 'upload', seriesId: 's1', fileId: 'f1' });
  let t = 0, k = 0;
  drv.uploadChunk = async (u, b, start) => {
    log.push(`uploadChunk:${start}`); t += 20_000; k++;
    return k < 3 ? { done: false, next: k } : { done: true, driveId: 'D1' };
  };
  assert.equal(await createSync({ ...deps, now: () => t }).run(), 'ok');
  const W = `writeJson:status-${ME}.json`;
  const seq = log.filter((l) => l === W || l.startsWith('uploadChunk'));
  // tulis awal, chunk 0 (t=20 dtk), chunk 1 (t=40 dtk), tulis ulang, chunk 2, tulis setelah selesai
  assert.deepEqual(seq, [W, 'uploadChunk:0', 'uploadChunk:1', W, 'uploadChunk:2', W]);
});

test("rak:changed saat seri terbuka di pembaca tidak menjadwalkan sync", () => {
  setActiveSeries(null);
  assert.equal(syncOnChange(), true);
  setActiveSeries('s1');
  assert.equal(syncOnChange(), false);
});

test('R18: tanpa seri aktif, seri progres terbaru tanpa file lokal tidak di-prefetch', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1' })];
  st.own.progress = { s1: { fileId: 'f1', page: 1, offset: 0, updatedAt: 5 } };
  st.blobs.clear();
  let n = 0;
  drv.downloadRange = async () => { n++; return new Blob([new Uint8Array(20)]); };
  assert.equal(await createSync({ ...deps, pdf: pdfOk }).run(), 'ok');
  assert.equal(n, 0);
  assert.ok(!st.blobs.has('f1'));
});

test('R18: tanpa seri aktif, seri progres terbaru yang sudah punya file lokal di-prefetch', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1' }), file('f2', { driveId: 'D2' })];
  st.own.progress = { s1: { fileId: 'f1', page: 1, offset: 0, updatedAt: 5 } };
  st.blobs = new Map([['f1', new Blob(['x'])]]);
  drv.downloadRange = async () => new Blob([new Uint8Array(20)]);
  assert.equal(await createSync({ ...deps, pdf: pdfOk }).run(), 'ok');
  assert.ok(st.blobs.has('f2'));
});

test('prefetch: offline di tengah download → run offline, lastSync tidak maju, tidak ditandai gagal', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1', size: 20 * 1024 * 1024 })];
  st.blobs.clear();
  setActiveSeries('s1');
  let on = true;
  drv.downloadRange = async () => { on = false; return new Blob([new Uint8Array(8 * 1024 * 1024)]); };
  assert.equal(await createSync({ ...deps, pdf: pdfOk, online: () => on }).run(), 'offline');
  assert.equal(st.kv.lastSync, undefined);
  assert.equal(st.kv['prefetchFail:f1'], undefined);
});

test('prefetch: relogin di tengah download → run relogin', async () => {
  st.own.series[0].files = [file('f1', { driveId: 'D1' })];
  st.blobs.clear();
  setActiveSeries('s1');
  drv.downloadRange = async () => { throw err(401); };
  assert.equal(await createSync({ ...deps, pdf: pdfOk }).run(), 'relogin');
  assert.equal(st.kv.lastSync, undefined);
});

test('prefetch memancarkan progres download di rak:sync', async () => {
  const M = 8 * 1024 * 1024;
  st.own.series[0].files = [file('f1', { driveId: 'D1', size: M + 5 })];
  st.blobs.clear();
  setActiveSeries('s1');
  drv.downloadRange = async (t, id, a, b) => new Blob([new Uint8Array(b - a + 1)]);
  const events = [];
  globalThis.dispatchEvent = (e) => { events.push(e); return true; };
  try {
    assert.equal(await createSync({ ...deps, pdf: pdfOk }).run(), 'ok');
  } finally { delete globalThis.dispatchEvent; }
  const prog = events.filter((e) => e.type === 'rak:sync' && e.detail.detail.fileId).map((e) => e.detail.detail);
  assert.deepEqual(prog, [{ fileId: 'f1', got: 0, size: M + 5 }, { fileId: 'f1', got: M, size: M + 5 }]);
});
