import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, positionAt, scrollTopFor, visibleRange } from '../src/layout.js';

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
