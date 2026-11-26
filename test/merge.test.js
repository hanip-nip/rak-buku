import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../src/merge.js';

const f = (id, order, o = {}) => ({ id, driveId: 'D' + id, name: id, size: 1, pages: 9, order, updatedAt: 1, deleted: false, ...o });
const s = (o = {}) => ({ id: 's1', title: 'T', category: 'c', cover: null, files: [], updatedAt: 1, deleted: false, ...o });
const dev = (id, series = [], progress = {}, bookmarks = []) => ({ device: { id, name: id }, series, progress, bookmarks });
const bm = (o = {}) => ({ id: 'b1', seriesId: 's1', fileId: 'a', page: 1, offset: 0, note: '', createdAt: 1, updatedAt: 1, deleted: false, ...o });

test('merge: judul baru dari A dan batch baru dari B sama-sama bertahan', () => {
  const A = dev('A', [s({ title: 'Baru', updatedAt: 5, files: [f('a', 0)] })]);
  const B = dev('B', [s({ title: 'Lama', updatedAt: 2, files: [f('a', 0), f('b', 1, { updatedAt: 3 })] })]);
  const r = mergeStates([A, B], 'A');
  assert.equal(r.series[0].title, 'Baru');
  assert.deepEqual(r.series[0].files.map((x) => x.id), ['a', 'b']);
});

test('merge: progres terbaru menang', () => {
  const sr = s({ files: [f('a', 0), f('b', 1)] });
  const A = dev('A', [sr], { s1: { fileId: 'b', page: 9, offset: 0, updatedAt: 1 } });
  const B = dev('B', [sr], { s1: { fileId: 'a', page: 1, offset: 0, updatedAt: 2 } });
  assert.equal(mergeStates([A, B], 'A').progress.s1.fileId, 'a');
});

test('merge: updatedAt sama, posisi lebih jauh menang (order file, lalu page, lalu offset)', () => {
  const sr = s({ files: [f('a', 0), f('b', 1)] });
  const p = (fileId, page, offset) => ({ s1: { fileId, page, offset, updatedAt: 5 } });
  const win = (p1, p2) => mergeStates([dev('A', [sr], p1), dev('B', [sr], p2)], 'A').progress.s1;
  assert.equal(win(p('a', 50, 0), p('b', 1, 0)).fileId, 'b');
  assert.equal(win(p('b', 3, 0.9), p('b', 4, 0)).page, 4);
  assert.equal(win(p('b', 4, 0.2), p('b', 4, 0.7)).offset, 0.7);
  assert.equal(win(p('b', 4, 0.7), p('b', 4, 0.2)).offset, 0.7);
});

test('merge: seri yang dihapus di satu perangkat hilang walau perangkat lain punya salinan lama', () => {
  const A = dev('A', [s({ deleted: true, updatedAt: 9 })]);
  const B = dev('B', [s({ files: [f('a', 0)] })], { s1: { fileId: 'a', page: 1, offset: 0, updatedAt: 1 } }, [bm()]);
  const r = mergeStates([A, B], 'A');
  assert.deepEqual([r.series, r.progress, r.bookmarks], [[], {}, []]);
});

test('merge: file belum ter-upload dari perangkat lain tidak tampil, dari perangkat sendiri tampil', () => {
  const A = dev('A', [s({ files: [f('a', 0, { driveId: null })] })]);
  const B = dev('B', [s({ files: [f('b', 1, { driveId: null })] })]);
  assert.deepEqual(mergeStates([A, B], 'A').series[0].files.map((x) => x.id), ['a']);
  assert.deepEqual(mergeStates([A, B], 'B').series[0].files.map((x) => x.id), ['b']);
});

test('merge: bookmark dihapus (tombstone lebih baru) tidak tampil', () => {
  const sr = s();
  const A = dev('A', [sr], {}, [bm({ deleted: true, updatedAt: 5 })]);
  const B = dev('B', [sr], {}, [bm({ updatedAt: 2 })]);
  assert.deepEqual(mergeStates([A, B], 'A').bookmarks, []);
  const C = dev('C', [sr], {}, [bm({ note: 'x', updatedAt: 9 })]);
  assert.equal(mergeStates([A, B, C], 'A').bookmarks[0].note, 'x');
});

test('merge: file dihapus tidak tampil', () => {
  const A = dev('A', [s({ files: [f('a', 0, { deleted: true, updatedAt: 4 })] })]);
  const B = dev('B', [s({ files: [f('a', 0)] })]);
  assert.deepEqual(mergeStates([A, B], 'A').series[0].files, []);
});

test('merge: tidak ada status, rak kosong', () =>
  assert.deepEqual(mergeStates([], 'A'), { series: [], progress: {}, bookmarks: [] }));
