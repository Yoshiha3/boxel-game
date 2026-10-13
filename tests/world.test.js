import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, chunksInRadius } from '../src/world/world.js';
import { chunkKey } from '../src/world/chunk.js';
import { buildRegistry } from '../src/core/registry.js';
import { emptyDefinitions } from '../src/core/packLoader.js';
import { AIR } from '../src/core/constants.js';

const registry = buildRegistry({ ...emptyDefinitions(), blocks: { stone: { id: 'stone', textures: { all: 's.png' } } } });
const STONE = registry.blockId('stone');

/** y < 10 を石で埋める平らな生成器 */
const flat = {
  generate(chunk) {
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 10; y++) chunk.set(x, y, z, STONE);
  },
};

test('chunksInRadius returns a sorted circle of chunks', () => {
  const list = chunksInRadius(5, -2, 2);
  assert.deepEqual(list[0], { cx: 5, cz: -2, d2: 0 });
  assert.equal(list.length, 13); // r=2 の円: 1 + 4 + 4 + 4
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].d2 <= list[i].d2);
  assert.equal(chunksInRadius(0, 0, 0).length, 1);
});

test('update loads up to maxLoads chunks nearest first, and unloads far ones', () => {
  const w = new World(registry, flat);
  const r1 = w.update(0, 0, 2, 5);
  assert.equal(r1.loaded.length, 5);
  assert.equal(r1.loaded[0], chunkKey(0, 0));
  while (w.update(0, 0, 2, 100).loaded.length) { /* 全部読み込む */ }
  assert.equal(w.chunks.size, chunksInRadius(0, 0, 3).length, 'loads renderDistance + 1');
  // 遠くへ移動すると、元の場所のチャンクは破棄される
  const r2 = w.update(20, 0, 2, 0);
  assert.equal(w.chunks.size, 0);
  assert.equal(r2.unloaded.length, chunksInRadius(0, 0, 3).length);
});

test('getBlock / setBlock with world coordinates (including negatives)', () => {
  const w = new World(registry, flat);
  w.loadChunk(-1, -1);
  assert.equal(w.getBlock(-1, 5, -1), STONE);
  assert.equal(w.getBlock(-1, 10, -1), AIR);
  assert.equal(w.getBlock(100, 5, 100), AIR, 'unloaded chunk is air');
  assert.equal(w.setBlock(-5, 20, -7, STONE), true);
  assert.equal(w.getBlock(-5, 20, -7), STONE);
  assert.equal(w.setBlock(100, 5, 100, STONE), false);
  assert.equal(w.setBlock(-5, -1, -7, STONE), false);
});

test('setBlock on a border marks the neighbor chunk dirty', () => {
  const w = new World(registry, flat);
  w.loadChunk(0, 0);
  w.loadChunk(-1, 0);
  w.dirty.clear();
  w.setBlock(0, 12, 5, STONE); // ローカル x = 0 → 西隣も
  assert.deepEqual([...w.dirty].sort(), [chunkKey(-1, 0), chunkKey(0, 0)].sort());
  w.dirty.clear();
  w.setBlock(5, 12, 5, STONE);
  assert.deepEqual([...w.dirty], [chunkKey(0, 0)]);
});

test('edits survive unloading and reloading a chunk', () => {
  const w = new World(registry, flat);
  w.loadChunk(0, 0);
  w.setBlock(3, 5, 3, AIR);
  w.chunks.clear();
  w.loadChunk(0, 0);
  assert.equal(w.getBlock(3, 5, 3), AIR);
  assert.equal(w.getBlock(4, 5, 3), STONE);
});

test('takeChunksToMesh waits for all neighbors and respects the radius', () => {
  const w = new World(registry, flat);
  w.loadChunk(0, 0);
  assert.equal(w.takeChunksToMesh(0, 0, 2, 10).length, 0, 'neighbors missing');
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.loadChunk(dx, dz);
  const out = w.takeChunksToMesh(0, 0, 2, 10);
  assert.deepEqual(out.map((c) => chunkKey(c.cx, c.cz)), [chunkKey(0, 0)]);
  assert.ok(!w.dirty.has(chunkKey(0, 0)));
  assert.ok(w.dirty.has(chunkKey(1, 0)), 'border chunks stay dirty until their neighbors load');
});
