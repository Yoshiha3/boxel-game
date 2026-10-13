import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidAt } from '../src/physics/liquid.js';

const WATER = 3;
const liquid = new Uint8Array(256);
liquid[WATER] = 1;
/** y = 0〜1 が水（y = 1 が水面） */
const getBlock = (x, y) => (y === 0 || y === 1 ? WATER : 0);

test('points inside liquid report the liquid id', () => {
  assert.equal(liquidAt(getBlock, liquid, 0.5, 0.5, 0.5), WATER);
  assert.equal(liquidAt(getBlock, liquid, 0.5, 0.99, 0.5), WATER, 'full height below the surface block');
  assert.equal(liquidAt(getBlock, liquid, 0.5, 1.5, 0.5), WATER);
});

test('the surface block is only liquid up to the visible water line', () => {
  assert.equal(liquidAt(getBlock, liquid, 0.5, 1.9, 0.5), 0);
  assert.equal(liquidAt(getBlock, liquid, 0.5, 2.5, 0.5), 0);
});
