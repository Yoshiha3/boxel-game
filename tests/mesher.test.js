import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkMeshData, isFaceHidden, LIQUID_SURFACE_HEIGHT } from '../src/render/mesher.js';
import { buildRegistry } from '../src/core/registry.js';
import { emptyDefinitions } from '../src/core/packLoader.js';
import { Chunk } from '../src/world/chunk.js';
import { AIR, CHUNK_SIZE } from '../src/core/constants.js';

const registry = buildRegistry({
  ...emptyDefinitions(),
  blocks: {
    stone: { id: 'stone', textures: { all: 's.png' } },
    glass: { id: 'glass', render: 'cutout', textures: { all: 'g.png' } },
    leaves: { id: 'leaves', render: 'cutout', cullSameType: false, textures: { all: 'l.png' } },
    water: { id: 'water', render: 'liquid', textures: { all: 'w.png' } },
    lava: { id: 'lava', render: 'liquid', translucent: false, textures: { all: 'v.png' } },
  },
});
const STONE = registry.blockId('stone');
const GLASS = registry.blockId('glass');
const LEAVES = registry.blockId('leaves');
const WATER = registry.blockId('water');
const tileUVs = new Float32Array(registry.textures.length * 4).fill(0.5);
const airOutside = () => AIR;

/**
 * 指定したブロックを置いたチャンクのメッシュを作る。
 * @param {[number, number, number, number][]} placed [x, y, z, id]
 * @param {(x: number, y: number, z: number) => number} [neighbor]
 */
function mesh(placed, neighbor = airOutside) {
  const c = new Chunk(0, 0);
  for (const [x, y, z, id] of placed) c.set(x, y, z, id);
  return buildChunkMeshData(c, registry, tileUVs, neighbor);
}

test('a single block has 6 faces', () => {
  const m = mesh([[5, 10, 5, STONE]]);
  assert.equal(m.opaque.faceCount, 6);
  assert.equal(m.opaque.positions.length, 6 * 4 * 3);
  assert.equal(m.opaque.indices.length, 6 * 6);
});

test('two adjacent blocks share a hidden face pair (10 faces)', () => {
  assert.equal(mesh([[5, 10, 5, STONE], [6, 10, 5, STONE]]).opaque.faceCount, 10);
  assert.equal(mesh([[5, 10, 5, STONE], [5, 11, 5, STONE]]).opaque.faceCount, 10);
});

test('a 2x2x2 cube only has its outer faces', () => {
  const placed = [];
  for (let x = 0; x < 2; x++) for (let y = 1; y < 3; y++) for (let z = 0; z < 2; z++) placed.push([x + 4, y, z + 4, STONE]);
  assert.equal(mesh(placed).opaque.faceCount, 24);
});

test('bottom faces at y=0 are skipped', () => {
  assert.equal(mesh([[5, 0, 5, STONE]]).opaque.faceCount, 5);
});

test('faces at chunk borders are culled using the neighbor chunk', () => {
  const solidOutside = () => STONE;
  assert.equal(mesh([[0, 10, 0, STONE]], solidOutside).opaque.faceCount, 4, '-X and -Z hidden by neighbors');
  assert.equal(mesh([[CHUNK_SIZE - 1, 10, 5, STONE]], solidOutside).opaque.faceCount, 5);
});

test('transparent blocks: glass culls same type, leaves do not, both show stone behind', () => {
  assert.equal(mesh([[5, 10, 5, GLASS], [6, 10, 5, GLASS]]).cutout.faceCount, 10);
  assert.equal(mesh([[5, 10, 5, LEAVES], [6, 10, 5, LEAVES]]).cutout.faceCount, 12);
  const m = mesh([[5, 10, 5, GLASS], [6, 10, 5, STONE]]);
  assert.equal(m.opaque.faceCount, 6, 'stone face behind glass is drawn');
  assert.equal(m.cutout.faceCount, 5);
});

test('liquid faces: hidden between liquids, top is lowered at the surface', () => {
  const m = mesh([[5, 10, 5, WATER], [5, 11, 5, WATER], [6, 10, 5, STONE]]);
  assert.equal(m.liquid.faceCount, 9, 'shared face and the face against stone are hidden (4 + 5)');
  const ys = new Set();
  for (let i = 1; i < m.liquid.positions.length; i += 3) ys.add(m.liquid.positions[i]);
  assert.ok(ys.has(11 + LIQUID_SURFACE_HEIGHT), 'surface is lowered');
  assert.ok(!ys.has(12), 'no full-height top at the surface');
  assert.ok(ys.has(11), 'lower block keeps its full height');
});

test('isFaceHidden rules', () => {
  assert.equal(isFaceHidden(registry, STONE, AIR), false);
  assert.equal(isFaceHidden(registry, STONE, WATER), false);
  assert.equal(isFaceHidden(registry, WATER, STONE), true);
  assert.equal(isFaceHidden(registry, WATER, GLASS), false);
  assert.equal(isFaceHidden(registry, GLASS, GLASS), true);
});

test('non-translucent liquids go to the opaque layer but keep liquid culling', () => {
  const LAVA = registry.blockId('lava');
  const m = mesh([[5, 10, 5, LAVA], [6, 10, 5, LAVA], [5, 10, 6, STONE]]);
  assert.equal(m.liquid.faceCount, 0);
  // 溶岩 2 個: 12 面から、溶岩同士の 2 面と石に接する 1 面を除いて 9 面。石は溶岩で隠れないので 6 面
  assert.equal(m.opaque.faceCount, 9 + 6);
});
