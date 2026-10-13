import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raycast } from '../src/player/raycast.js';
import { breakBlock, placeBlock, isTargetable } from '../src/player/blockActions.js';
import { World } from '../src/world/world.js';
import { buildRegistry } from '../src/core/registry.js';
import { AIR } from '../src/core/constants.js';
import { loadDefaultDefs } from './helpers.js';

const registry = buildRegistry(await loadDefaultDefs());
const STONE = registry.blockId('stone');
const WATER = registry.blockId('water');
const BEDROCK = registry.blockId('bedrock');

test('raycast hits the first target and reports the face normal', () => {
  const isTarget = (x, y, z) => x === 5 && y === 0 && z === 0;
  const hit = raycast(isTarget, [0.5, 0.5, 0.5], [1, 0, 0], 10);
  assert.deepEqual(hit.block, [5, 0, 0]);
  assert.deepEqual(hit.normal, [-1, 0, 0]);
  assert.ok(Math.abs(hit.distance - 4.5) < 1e-9);
});

test('raycast works in negative and diagonal directions', () => {
  const floor = (x, y, z) => y < 0;
  const hit = raycast(floor, [0.5, 2.5, 0.5], [-1, -2, -0.5], 20);
  assert.equal(hit.block[1], -1);
  assert.deepEqual(hit.normal, [0, 1, 0]);
  const neg = raycast((x) => x === -3, [0.5, 0.5, 0.5], [-1, 0, 0], 10);
  assert.deepEqual(neg.block, [-3, 0, 0]);
  assert.deepEqual(neg.normal, [1, 0, 0]);
});

test('raycast respects max distance', () => {
  assert.equal(raycast((x) => x === 10, [0.5, 0.5, 0.5], [1, 0, 0], 5), null);
});

/** y < 10 が石、y = 10 に水がある世界 */
function world() {
  const w = new World(registry, {
    generate(c) {
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        c.set(x, 0, z, BEDROCK);
        for (let y = 1; y < 10; y++) c.set(x, y, z, STONE);
        c.set(x, 10, z, WATER);
      }
    },
  });
  w.loadChunk(0, 0);
  return w;
}

test('liquids are not targetable', () => {
  assert.equal(isTargetable(registry, WATER), false);
  assert.equal(isTargetable(registry, STONE), true);
  assert.equal(isTargetable(registry, AIR), false);
});

test('breaking blocks respects breakable', () => {
  const w = world();
  assert.equal(breakBlock(w, [3, 5, 3]), true);
  assert.equal(w.getBlock(3, 5, 3), AIR);
  assert.equal(breakBlock(w, [3, 0, 3]), false, 'bedrock is unbreakable');
});

test('placing blocks: into air or liquid, never into the player', () => {
  const w = world();
  const player = { pos: [5.5, 11, 5.5], size: [0.6, 1.8, 0.6] };
  assert.equal(placeBlock(w, [3, 9, 3], STONE, [player]), false, 'occupied by stone');
  assert.equal(placeBlock(w, [3, 10, 3], STONE, [player]), true, 'replaces water');
  assert.equal(placeBlock(w, [3, 11, 3], STONE, [player]), true);
  assert.equal(placeBlock(w, [5, 11, 5], STONE, [player]), false, 'overlaps the player');
  assert.equal(placeBlock(w, [5, 12, 5], STONE, [player]), false, 'overlaps the player head');
  assert.equal(placeBlock(w, [5, 11, 5], WATER, [player]), true, 'non-solid blocks may overlap');
});
