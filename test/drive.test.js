import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../src/auth.js';
import * as drive from '../src/drive.js';

const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers });
let calls, blob, kv;
const stub = (fn) => { globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return fn(String(url), init); }; };

beforeEach(() => {
  calls = []; blob = 'sealed'; kv = {};
  auth._reset();
  auth.deps.getAuth = async () => blob;
  auth.deps.setAuth = async (b) => { blob = b; };
  drive.deps.getKv = async (k) => kv[k];
  drive.deps.setKv = async (k, v) => { kv[k] = v; };
});

test('getToken memakai cache sampai 60 detik sebelum habis', async () => {
  stub(() => json({ access_token: 'T1', expires_in: 3600 }));
  assert.equal(await auth.getToken(0), 'T1');
  assert.equal(await auth.getToken(3_500_000), 'T1');
  assert.equal(calls.length, 1);
  await auth.getToken(3_541_000); // sisa < 60 dtk
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { blob: 'sealed' });
});

test('getToken: Worker 401 → setAuth(null) dan melempar ReloginError', async () => {
  stub(() => json({ error: 'relogin' }, 401));
  await assert.rejects(auth.getToken(0), auth.ReloginError);
  assert.equal(blob, null);
});

test('getToken tanpa blob melempar ReloginError', async () => {
  blob = null; stub(() => assert.fail('tak boleh fetch'));
  await assert.rejects(auth.getToken(0), auth.ReloginError);
});

test('getToken: gagal jaringan tidak menghapus auth dan bukan ReloginError', async () => {
  const boom = new TypeError('offline');
  stub(() => { throw boom; });
  await assert.rejects(auth.getToken(0), (e) => e === boom);
  assert.equal(blob, 'sealed');
});

test('getToken bersamaan hanya satu fetch', async () => {
  stub(() => json({ access_token: 'T', expires_in: 3600 }));
  const r = await Promise.all([auth.getToken(0), auth.getToken(0), auth.getToken(0)]);
  assert.deepEqual(r, ['T', 'T', 'T']);
  assert.equal(calls.length, 1);
});

test('takeAuthFromHash mengambil auth dan membersihkan hash', async () => {
  globalThis.location = { hash: '#auth=a%2Bb', pathname: '/x', search: '' };
  let replaced; globalThis.history = { replaceState: (...a) => { replaced = a; } };
  assert.deepEqual(await auth.takeAuthFromHash(), { taken: true });
  assert.equal(blob, 'a+b');
  assert.equal(replaced[2], '/x');
  globalThis.location.hash = '#auth-error=nope';
  assert.deepEqual(await auth.takeAuthFromHash(), { taken: false, error: 'nope' });
  globalThis.location.hash = '#/baca/1';
  assert.deepEqual(await auth.takeAuthFromHash(), { taken: false });
});

test('listStatus mengirim q dengan folder dan trashed=false', async () => {
  stub(() => json({ files: [{ id: 'a', name: 'status-1.json', modifiedTime: 't' }] }));
  const r = await drive.listStatus('TK', 'F1');
  assert.equal(r[0].id, 'a');
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('q'), "'F1' in parents and name contains 'status-' and trashed=false");
  assert.equal(u.searchParams.get('pageSize'), '100');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer TK');
});

test('ensureFolder mencari, membuat bila belum ada, dan men-cache', async () => {
  stub((url, init) => (init.method === 'POST' ? json({ id: 'NEW' }) : json({ files: [] })));
  assert.equal(await drive.ensureFolder('TK'), 'NEW');
  assert.equal(kv.driveFolder, 'NEW');
  calls = [];
  assert.equal(await drive.ensureFolder('TK'), 'NEW');
  assert.equal(calls.length, 0);
  await drive.forgetFolder();
  assert.equal(kv.driveFolder, null);
});

test('ensureFolder memakai folder yang sudah ada', async () => {
  stub(() => json({ files: [{ id: 'OLD' }] }));
  assert.equal(await drive.ensureFolder('TK'), 'OLD');
  assert.equal(calls.length, 1);
});

test('writeJson: PATCH bila existingId, multipart create bila tidak', async () => {
  stub(() => json({ id: 'X' }));
  assert.equal(await drive.writeJson('TK', 'F', 'status-1.json', { a: 1 }, 'X'), 'X');
  assert.equal(calls[0].init.method, 'PATCH');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\/X\?uploadType=media/);
  await drive.writeJson('TK', 'F', 'status-1.json', { a: 1 });
  assert.equal(calls[1].init.method, 'POST');
  assert.match(calls[1].url, /uploadType=multipart/);
  assert.match(calls[1].init.headers['Content-Type'], /multipart\/related/);
  assert.match(calls[1].init.body, /"parents":\["F"\]/);
});

test('readJson, download, trash', async () => {
  stub((url, init) => (init.method === 'PATCH' ? json({}) : new Response('{"k":2}')));
  assert.deepEqual(await drive.readJson('TK', 'I'), { k: 2 });
  assert.equal(await (await drive.download('TK', 'I')).text(), '{"k":2}');
  await drive.trash('TK', 'I');
  assert.deepEqual(JSON.parse(calls[2].init.body), { trashed: true });
});

test('non-OK melempar Error dengan status', async () => {
  stub(() => json({}, 403));
  await assert.rejects(drive.readJson('TK', 'I'), (e) => e.status === 403);
});

test('startUpload mengembalikan Location, melempar bila tidak ada', async () => {
  stub(() => new Response('', { status: 200, headers: { Location: 'https://up/s1' } }));
  assert.equal(await drive.startUpload('TK', 'F', 'a.pdf', 100), 'https://up/s1');
  assert.equal(calls[0].init.headers['X-Upload-Content-Length'], '100');
  assert.equal(calls[0].init.headers['X-Upload-Content-Type'], 'application/pdf');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=resumable/);
  stub(() => new Response('', { status: 200 }));
  await assert.rejects(drive.startUpload('TK', 'F', 'a.pdf', 100));
});

const CH = 8 * 1024 * 1024;
test('uploadChunk membaca header Range 308 untuk offset berikutnya', async () => {
  stub(() => new Response(null, { status: 308, headers: { Range: `bytes=0-${CH - 1}` } }));
  const r = await drive.uploadChunk('https://up/s', new Blob([new Uint8Array(CH + 10)]), 0);
  assert.deepEqual(r, { done: false, next: CH });
  assert.equal(calls[0].init.headers['Content-Range'], `bytes 0-${CH - 1}/${CH + 10}`);
});

test('uploadChunk 308 tanpa Range → next 0', async () => {
  stub(() => new Response(null, { status: 308 }));
  assert.equal((await drive.uploadChunk('u', new Blob(['abc']), 0)).next, 0);
});

test('uploadChunk terakhir (200) mengembalikan driveId', async () => {
  stub(() => json({ id: 'D9' }));
  const r = await drive.uploadChunk('u', new Blob(['abcdef']), 0);
  assert.deepEqual(r, { done: true, driveId: 'D9' });
  assert.equal(calls[0].init.headers['Content-Range'], 'bytes 0-5/6');
});

test('uploadChunk status lain melempar dengan status', async () => {
  stub(() => new Response('', { status: 503 }));
  await assert.rejects(drive.uploadChunk('u', new Blob(['a']), 0), (e) => e.status === 503);
});

test('uploadOffset melanjutkan dari byte terakhir yang diterima server', async () => {
  stub(() => new Response(null, { status: 308, headers: { Range: 'bytes=0-999' } }));
  assert.deepEqual(await drive.uploadOffset('u', 5000), { done: false, next: 1000 });
  assert.equal(calls[0].init.headers['Content-Range'], 'bytes */5000');
  stub(() => json({ id: 'Z' }, 201));
  assert.deepEqual(await drive.uploadOffset('u', 5000), { done: true, driveId: 'Z' });
});

test('uploadOffset 404 melempar dengan status 404', async () => {
  stub(() => new Response('', { status: 404 }));
  await assert.rejects(drive.uploadOffset('u', 10), (e) => e.status === 404);
});
