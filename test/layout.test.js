import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, positionAt, scrollTopFor, visibleRange, windowRun } from '../src/layout.js';

const L = buildLayout([{ fileId: 'a', page: 1, height: 1000 }, { fileId: 'a', page: 2, height: 500 }, { fileId: 'b', page: 1, height: 1000 }], 10);

test('buildLayout: tops, heights, total', () => {
  assert.deepEqual(L.tops, [0, 1010, 1520]);
  assert.deepEqual(L.heights, [1000, 500, 1000]);
  assert.equal(L.total, 2530);
});
test('posisi tengah halaman 2', () => assert.deepEqual(positionAt(L, 1010 + 250), { fileId: 'a', page: 2, offset: 0.5 }));
test('bolak-balik posisi ↔ scroll', () => assert.equal(scrollTopFor(L, { fileId: 'b', page: 1, offset: 0.25 }), 1520 + 250));
test('scroll di celah masuk ke halaman berikutnya dengan offset 0', () => assert.deepEqual(positionAt(L, 1005), { fileId: 'a', page: 2, offset: 0 }));
test('scroll negatif → halaman pertama offset 0', () => assert.deepEqual(positionAt(L, -50), { fileId: 'a', page: 1, offset: 0 }));
test('scroll melewati akhir → halaman terakhir offset 1', () => assert.deepEqual(positionAt(L, 99999), { fileId: 'b', page: 1, offset: 1 }));
test('layout kosong', () => {
  const E = buildLayout([], 10);
  assert.equal(positionAt(E, 5), null);
  assert.equal(scrollTopFor(E, { fileId: 'a', page: 1, offset: 0 }), 0);
  assert.deepEqual(visibleRange(E, 0, 800), [0, -1]);
});
test('fileId tidak dikenal → 0', () => assert.equal(scrollTopFor(L, { fileId: 'zz', page: 1, offset: 0.5 }), 0));
test('halaman melebihi file → halaman terakhir file itu', () => assert.equal(scrollTopFor(L, { fileId: 'a', page: 99, offset: 0 }), 1010));

const M = buildLayout(Array.from({ length: 10 }, (_, i) => ({ fileId: 'a', page: i + 1, height: 100 })), 0);
test('visibleRange menambah 2 halaman di atas dan bawah', () => assert.deepEqual(visibleRange(M, 450, 100), [2, 7]));
test('visibleRange dijepit di tepi', () => {
  assert.deepEqual(visibleRange(M, 0, 100), [0, 3]);
  assert.deepEqual(visibleRange(M, 900, 100), [7, 9]);
});

const run = Array.from({ length: 10 }, () => ({ h: 10 }));
const hOf = (f) => f.h;
test('windowRun: cur−1…cur+2 dijepit ke rentang lokal', () => {
  assert.deepEqual(windowRun(run, 0, 10, 5, hOf, 100), [4, 8]);
  assert.deepEqual(windowRun(run, 0, 10, 0, hOf, 100), [0, 3]);
  assert.deepEqual(windowRun(run, 0, 10, 9, hOf, 100), [8, 10]);
  assert.deepEqual(windowRun(run.slice(3), 3, 10, 3, hOf, 100), [3, 6]);
});
test('windowRun: terlalu tinggi → cur…cur+1, lalu cur saja', () => {
  assert.deepEqual(windowRun(run, 0, 10, 5, hOf, 39), [5, 7]);
  assert.deepEqual(windowRun(run, 0, 10, 5, hOf, 19), [5, 6]);
  assert.deepEqual(windowRun(run, 0, 10, 5, hOf, 5), [5, 6]);
});
