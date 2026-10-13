import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveWithCollision, sweepAxis, makeBox, boxTouches } from '../src/physics/aabb.js';
import { TickClock } from '../src/core/tickClock.js';

/** y < 10 が固体の平らな床と、(5, 10..11, z) に壁がある世界 */
const isSolid = (x, y, z) => y < 10 || (x === 5 && y >= 10 && y < 12);
const SIZE = [0.6, 1.8, 0.6];

test('falling onto the floor stops at its surface', () => {
  const pos = [0.5, 12, 0.5];
  const res = moveWithCollision(isSolid, pos, SIZE, [0, -5, 0]);
  assert.equal(pos[1], 10);
  assert.equal(res.onGround, true);
  assert.equal(res.hit[1], true);
});

test('moving into a wall stops at the wall', () => {
  const pos = [3.5, 10, 0.5];
  const res = moveWithCollision(isSolid, pos, SIZE, [3, 0, 0]);
  assert.ok(Math.abs(pos[0] - (5 - 0.3)) < 1e-9, `x=${pos[0]}`);
  assert.equal(res.hit[0], true);
  assert.equal(res.onGround, false);
});

test('standing exactly on the floor stays there and is grounded', () => {
  const pos = [0.5, 10, 0.5];
  const res = moveWithCollision(isSolid, pos, SIZE, [0, -0.01, 0]);
  assert.equal(pos[1], 10);
  assert.equal(res.onGround, true);
});

test('ceiling stops upward movement', () => {
  const ceiling = (x, y, z) => y === 13;
  const pos = [0.5, 10, 0.5];
  moveWithCollision(ceiling, pos, SIZE, [0, 3, 0]);
  assert.ok(Math.abs(pos[1] - (13 - 1.8)) < 1e-9);
});

test('a box that fits exactly between blocks does not collide sideways', () => {
  const pos = [0.5, 10, 0.5];
  // 隣の列 (x=1) には何もないので通れる
  assert.equal(sweepAxis(isSolid, makeBox(pos, SIZE), 0, 0.4), 0.4);
});

test('boxTouches finds overlapping blocks', () => {
  assert.equal(boxTouches(isSolid, makeBox([0.5, 9.5, 0.5], SIZE)), true);
  assert.equal(boxTouches(isSolid, makeBox([0.5, 10, 0.5], SIZE)), false);
});

test('TickClock runs whole ticks and keeps the remainder', () => {
  const clock = new TickClock(20);
  assert.equal(clock.advance(0.12), 2);
  assert.ok(Math.abs(clock.alpha - 0.4) < 1e-9);
  assert.equal(clock.advance(0.03), 1);
  assert.equal(clock.advance(10), 10, 'capped by maxTicksPerFrame');
  assert.ok(clock.alpha <= 1);
  clock.setTickRate(60);
  assert.ok(Math.abs(clock.dt - 1 / 60) < 1e-12);
});
