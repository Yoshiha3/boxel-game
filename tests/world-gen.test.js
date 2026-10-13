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

test('findSpawn returns a dry surface position', async () => {
  const { findSpawn } = await import('../src/world/spawn.js');
  const gen = createTerrainGenerator(123, defs.worldgen, registry);
  const [x, y, z] = findSpawn(gen);
  assert.ok(gen.heightAt(Math.floor(x), Math.floor(z)) >= gen.seaLevel);
  assert.equal(y, gen.heightAt(Math.floor(x), Math.floor(z)) + 1);
});

test('river centers are below sea level', () => {
  const gen = createTerrainGenerator(123, defs.worldgen, registry);
  // 地形と同じシードで川のノイズを作り、ノイズが 0 に近い（川の中心）場所を調べる
  const river = createNoise2D(123 + 2);
  const f = defs.worldgen.river.frequency;
  let riverCells = 0;
  for (let x = -600; x < 600; x += 3) {
    for (let z = -600; z < 600; z += 3) {
      if (Math.abs(river(x * f, z * f)) < 0.01) {
        riverCells++;
        assert.ok(gen.heightAt(x, z) < gen.seaLevel, `dry river at ${x},${z}`);
      }
    }
  }
  assert.ok(riverCells > 100, `found ${riverCells} river cells`);
});

test('shores are sand and low ground is flooded up to sea level', () => {
  const gen = createTerrainGenerator(123, defs.worldgen, registry);
  const sand = registry.blockId('sand'), water = registry.blockId('water');
  let shoreCells = 0;
  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) {
      const ch = new Chunk(cx, cz);
      gen.generate(ch);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const h = gen.heightAt(cx * 16 + x, cz * 16 + z);
          if (h >= gen.seaLevel && h <= gen.seaLevel + defs.worldgen.beach.maxHeightAboveSea) {
            assert.equal(ch.get(x, h, z), sand);
            shoreCells++;
          }
          if (h < gen.seaLevel) assert.equal(ch.get(x, gen.seaLevel, z), water);
        }
      }
    }
  }
  assert.ok(shoreCells > 0, 'some shore exists in the sample area');
});
