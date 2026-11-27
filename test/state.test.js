import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDeviceState, upsertSeries, addFiles, reorderFiles, setDriveId, setProgress, upsertBookmark,
} from '../src/state.js';

const ser = (files = []) => ({ id: 's1', title: 'T', category: 'c', cover: null, files, updatedAt: 1, deleted: false });
const f = (id, order) => ({ id, driveId: null, name: id, size: 1, pages: 1, order, updatedAt: 1, deleted: false });

test('newDeviceState', () => assert.deepEqual(newDeviceState('d1', 'HP'),
  { device: { id: 'd1', name: 'HP' }, series: [], progress: {}, bookmarks: [] }));

test('addFiles menambah batch baru setelah yang lama, urut natural', () => {
  const s = addFiles(ser([f('a', 0), f('b', 1)]),
    [{ id: 'x', name: 'B 12', size: 1, pages: 1 }, { id: 'y', name: 'B 3', size: 1, pages: 1 }], 5);
  const added = s.files.slice(2);
  assert.deepEqual(added.map((x) => [x.name, x.order, x.driveId, x.deleted, x.updatedAt]),
    [['B 3', 2, null, false, 5], ['B 12', 3, null, false, 5]]);
  assert.equal(s.updatedAt, 5);
});

test('reorderFiles', () => {
  const s = reorderFiles(ser([f('a', 0), f('b', 1)]), ['b', 'a'], 9);
  assert.deepEqual(s.files.map((x) => [x.id, x.order]).sort(), [['a', 1], ['b', 0]]);
  assert.equal(s.updatedAt, 9);
});

test('upsertSeries mengganti salinan dan tidak mengubah input', () => {
  const own = newDeviceState('d1', 'HP');
  const own2 = upsertSeries(own, ser(), 7);
  assert.equal(own.series.length, 0);
  assert.equal(own2.series[0].updatedAt, 7);
  const own3 = upsertSeries(own2, { ...ser(), title: 'N', deleted: true }, 8);
  assert.equal(own3.series.length, 1);
  assert.deepEqual([own3.series[0].title, own3.series[0].deleted], ['N', true]);
});

test('setDriveId', () => {
  const own = upsertSeries(newDeviceState('d1', 'HP'), ser([f('a', 0)]), 1);
  const o2 = setDriveId(own, 's1', 'a', 'DRV', 3);
  assert.equal(o2.series[0].files[0].driveId, 'DRV');
  assert.equal(o2.series[0].files[0].updatedAt, 3);
  assert.equal(own.series[0].files[0].driveId, null);
});

test('setProgress dan upsertBookmark', () => {
  const own = newDeviceState('d1', 'HP');
  const o2 = setProgress(own, 's1', { fileId: 'a', page: 2, offset: 0.5 }, 4);
  assert.deepEqual(o2.progress.s1, { fileId: 'a', page: 2, offset: 0.5, updatedAt: 4 });
  assert.deepEqual(own.progress, {});
  const bm = { id: 'b1', seriesId: 's1', fileId: 'a', page: 1, offset: 0, note: '', createdAt: 1, deleted: false };
  const o3 = upsertBookmark(o2, bm, 6);
  const o4 = upsertBookmark(o3, { ...bm, deleted: true }, 7);
  assert.equal(o4.bookmarks.length, 1);
  assert.deepEqual([o4.bookmarks[0].deleted, o4.bookmarks[0].updatedAt], [true, 7]);
  assert.equal(o3.bookmarks[0].deleted, false);
});

test('upsertSeries membawa tombstone file lama', async () => {
  const { mergeStates } = await import('../src/merge.js');
  const live = (id) => ({ ...f(id, 0), driveId: 'D' + id });
  const x = live('x');
  const C = { ...newDeviceState('C', 'C'), series: [ser([x, live('y')])] };
  let A = upsertSeries(newDeviceState('A', 'A'), ser([x, live('y')]), 1);
  A = upsertSeries(A, ser([live('y')]), 5); // hapus x -> tombstone
  A.series[0].files.push({ ...x, deleted: true, updatedAt: 5 });
  const merged = mergeStates([A, C], 'A').series[0];
  assert.deepEqual(merged.files.map((q) => q.id), ['y']);
  A = upsertSeries(A, { ...merged, title: 'Baru' }, 8); // salinan gabungan, tanpa x
  assert.ok(A.series[0].files.some((q) => q.id === 'x' && q.deleted));
  assert.deepEqual(mergeStates([A, C], 'A').series[0].files.map((q) => q.id), ['y']);
});

test('addHistory: geser sedikit memperbarui entri terakhir, lompat jauh menambah entri baru, maksimal 10', async () => {
  const { addHistory } = await import('../src/state.js');
  let own = newDeviceState('d1', 'PC');
  own = addHistory(own, 's1', { fileId: 'a', page: 1, offset: 0 }, 1);
  own = addHistory(own, 's1', { fileId: 'a', page: 3, offset: 0.5 }, 2);
  assert.deepEqual(own.history.s1, [{ fileId: 'a', page: 3, offset: 0.5, at: 2 }]);
  own = addHistory(own, 's1', { fileId: 'a', page: 100, offset: 0 }, 3);
  own = addHistory(own, 's1', { fileId: 'b', page: 1, offset: 0 }, 4);
  assert.deepEqual(own.history.s1.map((e) => [e.fileId, e.page, e.at]), [['b', 1, 4], ['a', 100, 3], ['a', 3, 2]]);
  for (let i = 0; i < 20; i++) own = addHistory(own, 's1', { fileId: 'c', page: i * 10 + 1, offset: 0 }, 10 + i);
  assert.equal(own.history.s1.length, 10);
  assert.equal(own.history.s1[0].page, 191);
});
