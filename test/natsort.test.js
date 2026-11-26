import test from 'node:test';
import assert from 'node:assert/strict';
import { naturalCompare } from '../src/natsort.js';

test('natural sort', () => assert.deepEqual(
  ['Batch 10.pdf', 'Batch 2.pdf', 'batch 1.pdf'].sort(naturalCompare),
  ['batch 1.pdf', 'Batch 2.pdf', 'Batch 10.pdf']));
