import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, resolveAssetPaths, loadPacks } from '../src/core/packLoader.js';
import { readJson } from './helpers.js';

test('deepMerge merges objects recursively and replaces arrays', () => {
  const base = { a: 1, b: { c: 2, d: 3 }, list: [1, 2] };
  const out = deepMerge(base, { b: { d: 4, e: 5 }, list: [9] });
  assert.deepEqual(out, { a: 1, b: { c: 2, d: 4, e: 5 }, list: [9] });
  assert.deepEqual(base, { a: 1, b: { c: 2, d: 3 }, list: [1, 2] }, 'base is not mutated');
});

test('resolveAssetPaths resolves png paths relative to the pack dir', () => {
  const out = resolveAssetPaths({ t: { top: 'a.png', other: 'x' }, abs: '/b.png' }, 'data/packs/p');
  assert.deepEqual(out, { t: { top: 'data/packs/p/a.png', other: 'x' }, abs: '/b.png' });
});

test('loadPacks loads the base pack', async () => {
  const defs = await loadPacks(readJson, ['base']);
  assert.deepEqual(defs.packs, ['base']);
  assert.ok(defs.blocks.grass);
  assert.equal(defs.blocks.grass.textures.top, 'data/packs/base/textures/blocks/grass_top.png');
});

test('later packs override earlier ones by id (deep merge)', async () => {
  const defs = await loadPacks(readJson, ['base', 'test-override']);
  const grass = defs.blocks.grass;
  assert.equal(grass.textures.top, 'data/packs/test-override/textures/custom_grass_top.png');
  assert.equal(grass.textures.side, 'data/packs/base/textures/blocks/grass_side.png', 'untouched fields remain');
  assert.equal(grass.name, 'Grass');
  assert.ok(defs.blocks.marble, 'new blocks are added');
  assert.deepEqual(defs.hotbar.slots, ['marble'], 'arrays are replaced');
});
