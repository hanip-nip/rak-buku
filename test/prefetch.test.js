import test from 'node:test';
import assert from 'node:assert/strict';
import { filesToFetch } from '../src/prefetch.js';

const series = { files: ['f1', 'f2', 'f3', 'f4', 'f5'].map((id) => ({ id })) };
const none = () => false;

test('prefetch: progres di file 3 dari 5 → [f3,f4,f5]', () => assert.deepEqual(filesToFetch(series, { fileId: 'f3' }, none), ['f3', 'f4', 'f5']));
test('prefetch: tanpa yang sudah lokal', () => assert.deepEqual(filesToFetch(series, { fileId: 'f3' }, (id) => id === 'f4'), ['f3', 'f5']));
test('prefetch: di file terakhir → hanya file itu', () => assert.deepEqual(filesToFetch(series, { fileId: 'f5' }, none), ['f5']));
test('prefetch: tanpa progres → mulai dari file pertama', () => assert.deepEqual(filesToFetch(series, undefined, none), ['f1', 'f2', 'f3']));
test('prefetch: fileId progres tidak ada → file pertama', () => assert.deepEqual(filesToFetch(series, { fileId: 'x' }, none), ['f1', 'f2', 'f3']));
test('prefetch: seri kosong', () => assert.deepEqual(filesToFetch({ files: [] }, undefined, none), []));
