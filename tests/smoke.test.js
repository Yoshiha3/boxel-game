import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_SIZE, WORLD_HEIGHT, CHUNK_VOLUME } from '../src/core/constants.js';

test('constants are consistent', () => {
  assert.equal(CHUNK_SIZE, 16);
  assert.equal(CHUNK_VOLUME, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
});
