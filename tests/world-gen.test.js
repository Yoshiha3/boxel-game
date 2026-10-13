import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoise2D, fbm2D, hash3, createRandom } from '../src/world/noise.js';
import { Chunk, chunkIndex, toChunkCoord, toLocalCoord } from '../src/world/chunk.js';
import { createTerrainGenerator } from '../src/world/terrain.js';
import { buildRegistry } from '../src/core/registry.js';
import { AIR, CHUNK_SIZE, WORLD_HEIGHT } from '../src/core/constants.js';
import { loadDefaultDefs } from './helpers.js';

const defs = await loadDefaultDefs();
const registry = buildRegistry(defs);

test('noise is deterministic and bounded', () => {
  const a = createNoise2D(42), b = createNoise2D(42), c = createNoise2D(43);
  let differs = false;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, y = i * 0.11;
    assert.equal(a(x, y), b(x, y));
    if (a(x, y) !== c(x, y)) differs = true;
    const v = fbm2D(a, x * 50, y * 50);
    assert.ok(v >= -1.01 && v <= 1.01, `fbm out of range: ${v}`);
  }
  assert.ok(differs, 'different seeds give different noise');
});

test('hash3 and createRandom are deterministic', () => {
  assert.equal(hash3(1, 2, 3, 4), hash3(1, 2, 3, 4));
  assert.notEqual(hash3(1, 2, 3, 4), hash3(1, 2, 3, 5));
  const r1 = createRandom(7), r2 = createRandom(7);
  for (let i = 0; i < 10; i++) {
    const v = r1();
    assert.equal(v, r2());
    assert.ok(v >= 0 && v < 1);
  }
});

test('chunk coordinates and indexing', () => {
  assert.equal(chunkIndex(0, 0, 0), 0);
  assert.equal(chunkIndex(15, 0, 0), 15);
  assert.equal(chunkIndex(0, 0, 1), 16);
  assert.equal(chunkIndex(0, 1, 0), 256);
  assert.equal(toChunkCoord(-1), -1);
  assert.equal(toChunkCoord(16), 1);
  assert.equal(toLocalCoord(-1), 15);
  assert.equal(toLocalCoord(17), 1);
  const c = new Chunk(0, 0);
  c.set(3, 10, 5, 7);
  assert.equal(c.get(3, 10, 5), 7);
  assert.equal(c.get(3, -1, 5), AIR);
  assert.equal(c.get(3, WORLD_HEIGHT, 5), AIR);
});

test('terrain generation is deterministic and layered', () => {
  const gen = createTerrainGenerator(123, defs.worldgen, registry);
  const a = new Chunk(2, -3), b = new Chunk(2, -3);
  gen.generate(a);
  gen.generate(b);
  assert.deepEqual(a.blocks, b.blocks);

  const bedrock = registry.blockId('bedrock'), water = registry.blockId('water');
  const grass = registry.blockId('grass'), sand = registry.blockId('sand');
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const h = gen.heightAt(2 * CHUNK_SIZE + x, -3 * CHUNK_SIZE + z);
      assert.ok(h > 0 && h < WORLD_HEIGHT - 1);
      assert.equal(a.get(x, 0, z), bedrock);
      assert.ok([grass, sand].includes(a.get(x, h, z)), 'surface is grass or sand');
      for (let y = h + 1; y <= gen.seaLevel; y++) assert.equal(a.get(x, y, z), water, 'below sea level is water');
      assert.equal(a.get(x, Math.max(h, gen.seaLevel) + 1, z), AIR);
    }
  }
});
